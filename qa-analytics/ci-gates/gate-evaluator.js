'use strict';
// CI Release Gate Evaluator
// Evaluates a test run against configurable thresholds.
// Returns DEPLOY_ALLOWED or DEPLOY_BLOCKED with per-check details.

const { compareRuns } = require('../ai-engine/run-comparison');

// ── Default thresholds (overridden by env vars) ───────────────────────────────

function getThresholds() {
  return {
    passRateMin:      parseFloat(process.env.GATE_PASS_RATE_MIN    || '0.95'),
    maxNewFailures:   parseInt(  process.env.GATE_MAX_NEW_FAILURES  || '0'),
    maxFlakyRate:     parseFloat(process.env.GATE_MAX_FLAKY_RATE    || '0.03'),
    criticalFailures: 0,   // any critical test failure = hard block
  };
}

// ── Formatters ────────────────────────────────────────────────────────────────

const pct = v  => `${(v * 100).toFixed(1)}%`;
const num = v  => `${v}`;

// ── Main evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluate a run against release gate thresholds.
 * @param {import('better-sqlite3').Database} db
 * @param {object} latestRun      — run row from DB
 * @param {object|null} prevRun   — previous run row (for new-failure diff)
 * @returns {{ status, checks, blockers, summary }}
 */
function evaluateGate(db, latestRun, prevRun) {
  const T = getThresholds();

  // ── Core metrics ──────────────────────────────────────────────────────────
  const total     = latestRun.total  || 1;   // avoid divide-by-zero
  const passRate  = (latestRun.passed || 0) / total;
  const flakyRate = (latestRun.flaky  || 0) / total;

  // ── New failures vs previous run ─────────────────────────────────────────
  let newFailures = 0;
  let diffDetail  = null;
  if (prevRun) {
    try {
      diffDetail  = compareRuns(db, prevRun.id, latestRun.id);
      newFailures = diffDetail.summary.newFailures;
    } catch {
      newFailures = 0;
    }
  }

  // ── Critical test failures ────────────────────────────────────────────────
  const critFails = db.prepare(`
    SELECT COUNT(*) as count FROM test_results tr
    JOIN tests t ON t.id = tr.test_id
    WHERE tr.run_id = ? AND tr.status = 'failed' AND t.is_critical = 1
  `).get(latestRun.id)?.count || 0;

  // ── Build check results ───────────────────────────────────────────────────
  const checks = [
    {
      name:      'Pass Rate',
      value:     passRate,
      threshold: T.passRateMin,
      pass:      passRate >= T.passRateMin,
      display:   pct(passRate),
      threshold_display: `≥ ${pct(T.passRateMin)}`,
      icon:      passRate >= T.passRateMin ? '✅' : '❌',
    },
    {
      name:      'New Failures',
      value:     newFailures,
      threshold: T.maxNewFailures,
      pass:      newFailures <= T.maxNewFailures,
      display:   num(newFailures),
      threshold_display: `≤ ${T.maxNewFailures}`,
      icon:      newFailures <= T.maxNewFailures ? '✅' : '❌',
      detail:    diffDetail?.newFailures?.map(f => f.testName) || [],
    },
    {
      name:      'Flaky Rate',
      value:     flakyRate,
      threshold: T.maxFlakyRate,
      pass:      flakyRate <= T.maxFlakyRate,
      display:   pct(flakyRate),
      threshold_display: `≤ ${pct(T.maxFlakyRate)}`,
      icon:      flakyRate <= T.maxFlakyRate ? '✅' : '⚠️',
    },
    {
      name:      'Critical Tests',
      value:     critFails,
      threshold: T.criticalFailures,
      pass:      critFails <= T.criticalFailures,
      display:   num(critFails),
      threshold_display: `= 0`,
      icon:      critFails === 0 ? '✅' : '❌',
    },
  ];

  const blockers = checks.filter(c => !c.pass).map(c => c.name);
  const status   = blockers.length === 0 ? 'DEPLOY_ALLOWED' : 'DEPLOY_BLOCKED';

  return {
    status,
    checks,
    blockers,
    summary: {
      total:       latestRun.total,
      passed:      latestRun.passed,
      failed:      latestRun.failed,
      passRate:    passRate,
      flakyRate:   flakyRate,
      newFailures,
      critFails,
    },
    diff: diffDetail ? {
      newFailures:   diffDetail.newFailures?.slice(0, 10),
      resolved:      diffDetail.resolved?.slice(0, 10),
      stillFailing:  diffDetail.stillFailing?.slice(0, 10),
    } : null,
  };
}

module.exports = { evaluateGate, getThresholds };
