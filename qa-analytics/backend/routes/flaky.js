'use strict';
const { Router } = require('express');
const { getDb }  = require('../db/client');

const router = Router();

// GET /api/flaky-tests?suite=&min=0.1&limit=50
router.get('/', (req, res) => {
  const db = getDb();
  const { suite, min = 0.10, limit = 50 } = req.query;

  let sql = `
    SELECT t.id, t.name, t.file_path, t.owner_team, t.owner_email, t.is_critical,
           f.flaky_rate, f.pass_count, f.fail_count, f.run_window, f.last_updated
    FROM flaky_scores f
    JOIN tests t ON t.id = f.test_id
    WHERE f.flaky_rate >= ?`;
  const params = [parseFloat(min)];

  if (suite) { sql += ' AND t.suite_id = ?'; params.push(suite); }
  sql += ' ORDER BY f.flaky_rate DESC LIMIT ?';
  params.push(parseInt(limit));

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /api/flaky-tests/:testId/history  — last N results for a test
router.get('/:testId/history', (req, res) => {
  const db = getDb();
  const { limit = 20 } = req.query;
  const rows = db.prepare(`
    SELECT tr.status, tr.duration_ms, tr.started_at, r.run_number, r.branch
    FROM test_results tr
    JOIN runs r ON r.id = tr.run_id
    WHERE tr.test_id = ?
    ORDER BY tr.started_at DESC LIMIT ?
  `).all(req.params.testId, parseInt(limit));
  res.json(rows);
});

// PATCH /api/flaky-tests/:testId/critical  — set or unset critical flag
router.patch('/:testId/critical', (req, res) => {
  const db = getDb();
  const isCritical = req.body.critical ? 1 : 0;
  const changes = db.prepare('UPDATE tests SET is_critical = ? WHERE id = ?')
    .run(isCritical, req.params.testId);
  if (changes.changes === 0) return res.status(404).json({ error: 'Test not found' });
  res.json({ testId: req.params.testId, is_critical: isCritical });
});

// PATCH /api/flaky-tests/:testId/owner  — assign owner
router.patch('/:testId/owner', (req, res) => {
  const db = getDb();
  const { team, email, slack_channel } = req.body;
  const { generateId, now } = require('../db/client');
  db.prepare(`
    INSERT INTO test_owners (id, test_id, team, email, slack_channel)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(test_id) DO UPDATE SET team=excluded.team, email=excluded.email, slack_channel=excluded.slack_channel
  `).run(generateId(), req.params.testId, team || '', email || '', slack_channel || '');
  res.json({ updated: req.params.testId });
});

module.exports = router;
