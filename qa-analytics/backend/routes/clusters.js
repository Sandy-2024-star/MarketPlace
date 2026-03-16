'use strict';
const { Router } = require('express');
const { getDb }  = require('../db/client');

const router = Router();

// GET /api/failure-clusters?suite=&status=open&limit=20
router.get('/', (req, res) => {
  const db = getDb();
  const { suite, status = 'open', limit = 20 } = req.query;

  let sql = 'SELECT * FROM failure_clusters WHERE status = ?';
  const params = [status];
  if (suite) { sql += ' AND suite_id = ?'; params.push(suite); }
  sql += ' ORDER BY occurrence DESC LIMIT ?';
  params.push(parseInt(limit));

  const rows = db.prepare(sql).all(...params);
  // Parse JSON fields
  res.json(rows.map(r => ({
    ...r,
    affected_tests: JSON.parse(r.affected_tests || '[]'),
  })));
});

// GET /api/failure-clusters/:id  — cluster detail with affected test names
router.get('/:id', (req, res) => {
  const db      = getDb();
  const cluster = db.prepare('SELECT * FROM failure_clusters WHERE id = ?').get(req.params.id);
  if (!cluster) return res.status(404).json({ error: 'Cluster not found' });

  const affectedIds = JSON.parse(cluster.affected_tests || '[]');
  const tests = affectedIds.length
    ? db.prepare(`SELECT id, name, file_path, owner_team, owner_email FROM tests WHERE id IN (${affectedIds.map(() => '?').join(',')})`).all(...affectedIds)
    : [];

  res.json({ ...cluster, affected_tests: affectedIds, tests });
});

// PATCH /api/failure-clusters/:id/status  — resolve or ignore a cluster
router.patch('/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  if (!['open', 'resolved', 'ignored'].includes(status)) {
    return res.status(400).json({ error: 'status must be open|resolved|ignored' });
  }
  db.prepare('UPDATE failure_clusters SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ id: req.params.id, status });
});

// GET /api/failure-clusters/stats/summary  — counts per root_cause
router.get('/stats/summary', (req, res) => {
  const db = getDb();
  const { suite } = req.query;
  let sql = `SELECT root_cause, COUNT(*) as count, SUM(occurrence) as total_hits
             FROM failure_clusters WHERE status = 'open'`;
  const params = [];
  if (suite) { sql += ' AND suite_id = ?'; params.push(suite); }
  sql += ' GROUP BY root_cause ORDER BY total_hits DESC';
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
