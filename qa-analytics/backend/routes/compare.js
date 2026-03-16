'use strict';
const { Router }        = require('express');
const { getDb }         = require('../db/client');
const { compareRuns }   = require('../../ai-engine/run-comparison');

const router = Router();

// GET /api/compare?runA=<id>&runB=<id>
router.get('/', (req, res) => {
  const db = getDb();
  const { runA, runB } = req.query;
  if (!runA || !runB) return res.status(400).json({ error: 'runA and runB required' });

  const result = compareRuns(db, runA, runB);
  res.json(result);
});

// GET /api/compare/latest?suite=<id>   — compare last 2 runs automatically
router.get('/latest', (req, res) => {
  const db = getDb();
  const { suite } = req.query;
  if (!suite) return res.status(400).json({ error: 'suite required' });

  const runs = db.prepare('SELECT id FROM runs WHERE suite_id = ? ORDER BY started_at DESC LIMIT 2').all(suite);
  if (runs.length < 2) return res.json({ message: 'Need at least 2 runs to compare', runs });

  const result = compareRuns(db, runs[1].id, runs[0].id); // older → newer
  res.json(result);
});

module.exports = router;
