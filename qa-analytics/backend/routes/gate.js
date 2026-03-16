'use strict';
const { Router }         = require('express');
const { getDb }          = require('../db/client');
const { evaluateGate }   = require('../../ci-gates/gate-evaluator');
const { sendAlert, TEMPLATES } = require('../../slack-bot/alerts');

const router = Router();

// POST /api/release-gate/check
// Body: { suiteId, branch?, commit? }
// Returns 200 DEPLOY_ALLOWED or 422 DEPLOY_BLOCKED
router.post('/check', (req, res) => {
  const db = getDb();
  const { suiteId, branch, commit } = req.body;
  if (!suiteId) return res.status(400).json({ error: 'suiteId is required' });

  // Get latest 2 runs for this suite
  const runs = db.prepare('SELECT * FROM runs WHERE suite_id = ? ORDER BY started_at DESC LIMIT 2').all(suiteId);
  if (runs.length === 0) return res.status(404).json({ error: 'No runs found for this suite' });

  const latestRun  = runs[0];
  const previousRun = runs[1] || null;

  const result = evaluateGate(db, latestRun, previousRun);
  result.runId  = latestRun.id;
  result.branch = branch || latestRun.branch;
  result.commit = commit || latestRun.commit_sha;

  // Send Slack alert if blocked (fire-and-forget — doesn't block the response)
  if (result.status === 'DEPLOY_BLOCKED' && process.env.SLACK_WEBHOOK) {
    sendAlert(process.env.SLACK_WEBHOOK,
      TEMPLATES.releaseGate(result.status, { ...latestRun, branch: result.branch, commit_sha: result.commit }))
      .catch(err => console.error('[gate] Slack alert failed:', err.message));
  }

  const httpStatus = result.status === 'DEPLOY_BLOCKED' ? 422 : 200;
  res.status(httpStatus).json(result);
});

// GET /api/release-gate/status?suite=  — latest gate status without blocking
router.get('/status', (req, res) => {
  const db = getDb();
  const { suite } = req.query;
  if (!suite) return res.status(400).json({ error: 'suite required' });

  const runs = db.prepare('SELECT * FROM runs WHERE suite_id = ? ORDER BY started_at DESC LIMIT 2').all(suite);
  if (runs.length === 0) return res.json({ status: 'NO_DATA' });

  const result = evaluateGate(db, runs[0], runs[1] || null);
  res.json(result);
});

// GET /api/release-gate/config  — show current gate thresholds
router.get('/config', (req, res) => {
  res.json({
    passRateMin:      parseFloat(process.env.GATE_PASS_RATE_MIN   || '0.95'),
    maxNewFailures:   parseInt(process.env.GATE_MAX_NEW_FAILURES   || '0'),
    maxFlakyRate:     parseFloat(process.env.GATE_MAX_FLAKY_RATE   || '0.03'),
    criticalFailures: 0,
  });
});

module.exports = router;
