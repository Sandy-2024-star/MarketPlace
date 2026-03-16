'use strict';
// SQLite client — uses built-in node:sqlite (Node.js >= 22.5.0, zero npm deps).
// Database file lives at qa-analytics/backend/qa-analytics.db

const path = require('path');
const fs   = require('fs');

const DB_PATH = path.resolve(__dirname, '../qa-analytics.db');
const SCHEMA  = path.resolve(__dirname, './schema.sql');

let _db = null;

function getDb() {
  if (_db) return _db;

  const { DatabaseSync } = require('node:sqlite');
  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');

  // Apply schema (all CREATE TABLE IF NOT EXISTS — idempotent)
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  _db.exec(schema);

  // Idempotent column migrations for existing databases
  try { _db.exec("ALTER TABLE test_results ADD COLUMN artifacts TEXT DEFAULT '[]'"); } catch {}

  console.log(`[db] Connected: ${DB_PATH}`);
  return _db;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function now() {
  return new Date().toISOString();
}

module.exports = { getDb, generateId, now };
