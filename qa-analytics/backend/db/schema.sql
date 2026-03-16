-- QA Analytics Platform — SQLite Schema
-- Run via: node db/migrate.js

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Suites ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suites (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  project     TEXT NOT NULL DEFAULT 'default',
  environment TEXT NOT NULL DEFAULT 'staging',
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── Runs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id           TEXT PRIMARY KEY,
  suite_id     TEXT REFERENCES suites(id),
  run_number   INTEGER NOT NULL DEFAULT 0,
  branch       TEXT DEFAULT 'main',
  commit_sha   TEXT,
  triggered_by TEXT DEFAULT 'manual',
  status       TEXT DEFAULT 'running',   -- running|passed|failed|blocked
  started_at   TEXT,
  finished_at  TEXT,
  duration_ms  INTEGER DEFAULT 0,
  total        INTEGER DEFAULT 0,
  passed       INTEGER DEFAULT 0,
  failed       INTEGER DEFAULT 0,
  skipped      INTEGER DEFAULT 0,
  flaky        INTEGER DEFAULT 0
);

-- ─── Tests ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tests (
  id          TEXT PRIMARY KEY,
  suite_id    TEXT REFERENCES suites(id),
  name        TEXT NOT NULL,
  file_path   TEXT DEFAULT '',
  tags        TEXT DEFAULT '[]',         -- JSON array
  owner_team  TEXT DEFAULT '',
  owner_email TEXT DEFAULT '',
  is_critical INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── Test Results ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_results (
  id            TEXT PRIMARY KEY,
  run_id        TEXT REFERENCES runs(id),
  test_id       TEXT REFERENCES tests(id),
  status        TEXT NOT NULL,           -- passed|failed|skipped|flaky
  duration_ms   INTEGER DEFAULT 0,
  error_message TEXT DEFAULT '',
  stack_trace   TEXT DEFAULT '',
  retry_count   INTEGER DEFAULT 0,
  started_at    TEXT,
  finished_at   TEXT,
  artifacts     TEXT DEFAULT '[]'   -- JSON array of { name, contentType, path }
);

-- ─── Failure Clusters ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS failure_clusters (
  id             TEXT PRIMARY KEY,
  suite_id       TEXT REFERENCES suites(id),
  signature      TEXT UNIQUE NOT NULL,
  root_cause     TEXT DEFAULT 'Unknown',
  first_seen     TEXT DEFAULT (datetime('now')),
  last_seen      TEXT DEFAULT (datetime('now')),
  occurrence     INTEGER DEFAULT 1,
  affected_tests TEXT DEFAULT '[]',      -- JSON array of test IDs
  sample_error   TEXT DEFAULT '',
  status         TEXT DEFAULT 'open'     -- open|resolved|ignored
);

-- ─── Flaky Scores ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flaky_scores (
  id           TEXT PRIMARY KEY,
  test_id      TEXT UNIQUE REFERENCES tests(id),
  flaky_rate   REAL DEFAULT 0.0,
  run_window   INTEGER DEFAULT 20,
  pass_count   INTEGER DEFAULT 0,
  fail_count   INTEGER DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- ─── Test Owners ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_owners (
  id            TEXT PRIMARY KEY,
  test_id       TEXT UNIQUE REFERENCES tests(id),
  team          TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  slack_channel TEXT DEFAULT '',
  assigned_at   TEXT DEFAULT (datetime('now'))
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_results_run    ON test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_results_test   ON test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_results_status ON test_results(status);
CREATE INDEX IF NOT EXISTS idx_runs_suite     ON runs(suite_id, started_at);
CREATE INDEX IF NOT EXISTS idx_flaky_rate     ON flaky_scores(flaky_rate DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_suite ON failure_clusters(suite_id, status);
