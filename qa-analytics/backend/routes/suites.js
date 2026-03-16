'use strict';
const { Router }       = require('express');
const { getDb, generateId, now } = require('../db/client');

const router = Router();

// GET /api/suites
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM suites ORDER BY created_at DESC').all();
  res.json(rows);
});

// POST /api/suites
router.post('/', (req, res) => {
  const db = getDb();
  const { name, project = 'default', environment = 'staging' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = generateId();
  db.prepare('INSERT INTO suites (id, name, project, environment) VALUES (?, ?, ?, ?)')
    .run(id, name, project, environment);
  res.status(201).json({ id, name, project, environment });
});

// GET /api/suites/:id
router.get('/:id', (req, res) => {
  const db  = getDb();
  const row = db.prepare('SELECT * FROM suites WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Suite not found' });
  res.json(row);
});

module.exports = router;
