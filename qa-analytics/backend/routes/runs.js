'use strict';
const { Router }         = require('express');
const { getDb, generateId, now } = require('../db/client');
const { clusterFailure } = require('../../ai-engine/clustering');
const { updateFlakyScore } = require('../../ai-engine/flaky-detector');
const { broadcastUpdate }  = require('../websocket/live');
const { alertSuiteFailure } = require('../../slack-bot/alerts');
const { evaluateGate }      = require('../../ci-gates/gate-evaluator');

const router = Router();

// GET /api/runs?suite=&limit=20&branch=
router.get('/', (req, res) => {
  const db = getDb();
  const { suite, limit = 20, branch } = req.query;

  let sql = 'SELECT * FROM runs WHERE 1=1';
  const params = [];
  if (suite)  { sql += ' AND suite_id = ?';  params.push(suite); }
  if (branch) { sql += ' AND branch = ?';    params.push(branch); }
  sql += ' ORDER BY started_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /api/runs/:id
router.get('/:id', (req, res) => {
  const db  = getDb();
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const results = db.prepare(`
    SELECT tr.*, t.name as test_name, t.file_path, t.tags, t.owner_team, t.owner_email, t.is_critical
    FROM test_results tr
    JOIN tests t ON t.id = tr.test_id
    WHERE tr.run_id = ?
    ORDER BY tr.status DESC, tr.duration_ms DESC
  `).all(req.params.id);

  res.json({ run, results });
});

// GET /api/runs/:id/results
router.get('/:id/results', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = `
    SELECT tr.*, t.name as test_name, t.file_path, t.tags
    FROM test_results tr
    JOIN tests t ON t.id = tr.test_id
    WHERE tr.run_id = ?`;
  const params = [req.params.id];
  if (status) { sql += ' AND tr.status = ?'; params.push(status); }
  sql += ' ORDER BY tr.duration_ms DESC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/runs/ingest  — called by integrations/results-adapter.js or playwright-reporter
router.post('/ingest', (req, res) => {
  const db = getDb();
  const { suiteId, run, results = [] } = req.body;

  if (!suiteId || !run) return res.status(400).json({ error: 'suiteId and run are required' });

  // Ensure suite exists (auto-create if missing)
  const suite = db.prepare('SELECT id FROM suites WHERE id = ?').get(suiteId);
  if (!suite) {
    db.prepare('INSERT OR IGNORE INTO suites (id, name, project) VALUES (?, ?, ?)')
      .run(suiteId, run.suiteName || suiteId, run.project || 'default');
  }

  // Next run number for this suite
  const lastRun = db.prepare('SELECT MAX(run_number) as max FROM runs WHERE suite_id = ?').get(suiteId);
  const runNumber = (lastRun?.max || 0) + 1;

  // Insert run
  const runId = generateId();
  db.prepare(`
    INSERT INTO runs (id, suite_id, run_number, branch, commit_sha, triggered_by,
                      status, started_at, finished_at, duration_ms,
                      total, passed, failed, skipped, flaky)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId, suiteId, runNumber,
    run.branch || 'main', run.commitSha || '', run.triggeredBy || 'manual',
    run.status || 'passed',
    run.startedAt || now(), run.finishedAt || now(), run.durationMs || 0,
    run.total || results.length,
    run.passed || results.filter(r => r.status === 'passed').length,
    run.failed || results.filter(r => r.status === 'failed').length,
    run.skipped || results.filter(r => r.status === 'skipped').length,
    run.flaky  || results.filter(r => r.status === 'flaky').length
  );

  // Ingest each test result
  const insertTest   = db.prepare(`INSERT OR IGNORE INTO tests (id, suite_id, name, file_path, tags) VALUES (?, ?, ?, ?, ?)`);
  const insertResult = db.prepare(`INSERT INTO test_results (id, run_id, test_id, status, duration_ms, error_message, stack_trace, retry_count, started_at, finished_at, artifacts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  // Ingest all results in a single transaction (node:sqlite uses exec for BEGIN/COMMIT)
  db.exec('BEGIN');
  try {
    for (const r of results) {
      const testId = r.testId || generateId();
      insertTest.run(testId, suiteId, r.testName || 'unknown', r.filePath || '', JSON.stringify(r.tags || []));

      const resultId = generateId();
      insertResult.run(resultId, runId, testId, r.status, r.durationMs || 0, r.errorMessage || '', r.stackTrace || '', r.retryCount || 0, r.startedAt || now(), r.finishedAt || now(), JSON.stringify(r.artifacts || []));

      if (r.status === 'failed') {
        clusterFailure(db, { testId, suiteId, errorMessage: r.errorMessage, stackTrace: r.stackTrace });
      }
      updateFlakyScore(db, testId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // Determine final run status
  const failed = results.filter(r => r.status === 'failed').length;
  const finalStatus = failed > 0 ? 'failed' : 'passed';
  db.prepare('UPDATE runs SET status = ? WHERE id = ?').run(finalStatus, runId);

  // Broadcast live update
  broadcastUpdate(suiteId, { type: 'run_complete', runId, runNumber, status: finalStatus, total: results.length, failed });

  // Slack alert when run has failures (fire-and-forget — doesn't block the response)
  if (failed > 0 && process.env.SLACK_WEBHOOK) {
    const runData     = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    const previousRun = db.prepare('SELECT * FROM runs WHERE suite_id = ? AND id != ? ORDER BY started_at DESC LIMIT 1').get(suiteId, runId);
    const gate        = evaluateGate(db, runData, previousRun || null);
    alertSuiteFailure(runData, gate)
      .catch(err => console.error('[runs] Slack alert failed:', err.message));
  }

  console.log(`[ingest] Run #${runNumber} ingested — ${results.length} results, ${failed} failed`);
  res.status(201).json({ runId, runNumber, status: finalStatus });
});

// DELETE /api/runs/:id  (cleanup old runs)
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM test_results WHERE run_id = ?').run(req.params.id);
  db.prepare('DELETE FROM runs WHERE id = ?').run(req.params.id);
  res.json({ deleted: req.params.id });
});

module.exports = router;
