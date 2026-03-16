'use strict';
// Flaky Test Detection Engine
//
// A test is flaky when it both passes AND fails within a rolling window.
// Flaky rate = min(failRate, 1-failRate) — symmetric metric.
// A test failing 90%+ of the time is broken, not flaky.

const { generateId, now } = require('../backend/db/client');
const { alertFlakyTests }  = require('../slack-bot/alerts');
const { broadcastUpdate }  = require('../backend/websocket/live');

const WINDOW_SIZE      = 20;   // last N runs to analyze
const FLAKY_THRESHOLD  = 0.10; // 10% min rate to be considered flaky
const BROKEN_THRESHOLD = 0.90; // 90%+ fail rate = broken, not flaky

/**
 * Update the flaky score for a single test based on its recent history.
 * @param {import('better-sqlite3').Database} db
 * @param {string} testId
 * @returns {{ testId, flakyRate, isFlaky, isBroken }}
 */
function updateFlakyScore(db, testId) {
  const rows = db.prepare(`
    SELECT status FROM test_results
    WHERE test_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(testId, WINDOW_SIZE);

  if (rows.length === 0) return { testId, flakyRate: 0, isFlaky: false, isBroken: false };

  const total  = rows.length;
  const passed = rows.filter(r => r.status === 'passed').length;
  const failed = rows.filter(r => r.status === 'failed').length;

  const failRate   = failed / total;
  const hasBoth    = passed > 0 && failed > 0;
  const flakyRate  = hasBoth ? Math.min(failRate, 1 - failRate) : 0;
  const isFlaky    = flakyRate >= FLAKY_THRESHOLD;
  const isBroken   = failRate >= BROKEN_THRESHOLD;

  // Check if test was previously below the flaky threshold (detect new crossing)
  const prev    = db.prepare('SELECT flaky_rate FROM flaky_scores WHERE test_id = ?').get(testId);
  const wasFlaky = prev ? prev.flaky_rate >= FLAKY_THRESHOLD : false;

  db.prepare(`
    INSERT INTO flaky_scores (id, test_id, flaky_rate, run_window, pass_count, fail_count, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(test_id) DO UPDATE SET
      flaky_rate   = excluded.flaky_rate,
      run_window   = excluded.run_window,
      pass_count   = excluded.pass_count,
      fail_count   = excluded.fail_count,
      last_updated = excluded.last_updated
  `).run(generateId(), testId, flakyRate, total, passed, failed, now());

  // Alert when a test newly crosses the flaky threshold
  if (isFlaky && !wasFlaky) {
    const test = db.prepare('SELECT name, suite_id, owner_email, owner_team FROM tests WHERE id = ?').get(testId);
    if (test) {
      console.log(`[flaky] ⚠ New flaky test: "${test.name}" — ${(flakyRate * 100).toFixed(1)}%`);

      // Broadcast live event to dashboard
      broadcastUpdate(test.suite_id || '', { type: 'flaky_alert', testId, testName: test.name, flakyRate });

      alertFlakyTests([{ name: test.name, flaky_rate: flakyRate, owner_email: test.owner_email }])
        .catch(err => console.error('[flaky] Slack alert failed:', err.message));
    }
  }

  return { testId, flakyRate, isFlaky, isBroken };
}

/**
 * Recalculate flaky scores for all tests in a suite.
 * @param {import('better-sqlite3').Database} db
 * @param {string} suiteId
 * @returns {Array} updated scores
 */
function recalculateAll(db, suiteId) {
  const tests = suiteId
    ? db.prepare('SELECT id FROM tests WHERE suite_id = ?').all(suiteId)
    : db.prepare('SELECT id FROM tests').all();

  const results = [];
  for (const { id } of tests) {
    results.push(updateFlakyScore(db, id));
  }

  const flaky  = results.filter(r => r.isFlaky).length;
  const broken = results.filter(r => r.isBroken).length;
  console.log(`[flaky] Recalculated ${results.length} tests — ${flaky} flaky, ${broken} broken`);
  return results;
}

/**
 * Get top flaky tests for a suite.
 * @param {import('better-sqlite3').Database} db
 * @param {string} suiteId
 * @param {number} minRate  minimum flaky_rate to include
 * @returns {Array}
 */
function getTopFlaky(db, suiteId, minRate = FLAKY_THRESHOLD) {
  let sql = `
    SELECT t.id, t.name, t.file_path, t.owner_team, t.owner_email,
           f.flaky_rate, f.pass_count, f.fail_count
    FROM flaky_scores f
    JOIN tests t ON t.id = f.test_id
    WHERE f.flaky_rate >= ?`;
  const params = [minRate];
  if (suiteId) { sql += ' AND t.suite_id = ?'; params.push(suiteId); }
  sql += ' ORDER BY f.flaky_rate DESC LIMIT 50';
  return db.prepare(sql).all(...params);
}

module.exports = { updateFlakyScore, recalculateAll, getTopFlaky, FLAKY_THRESHOLD, WINDOW_SIZE };
