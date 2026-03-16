'use strict';
// Failure Clustering Engine
// Groups failures with similar stack traces into clusters.
// Uses signature hashing — stable across runs, line-number independent.

const crypto = require('crypto');
const { generateId, now } = require('../backend/db/client');
const { alertNewCluster }  = require('../slack-bot/alerts');
const { broadcastUpdate }  = require('../backend/websocket/live');

// ── Root cause classifier ─────────────────────────────────────────────────────

const ROOT_CAUSE_RULES = [
  { pattern: /timeout|timed out|waiting for/i,          label: 'Timeout'   },
  { pattern: /net::err|network|ECONNREFUSED|ENOTFOUND/i, label: 'Network'   },
  { pattern: /oauth|popup|auth|login|403|401/i,          label: 'Auth/OAuth'},
  { pattern: /upload|filechooser|file chooser/i,         label: 'Upload'    },
  { pattern: /assertion|expect|toBe|toEqual|toContain/i, label: 'Assertion' },
  { pattern: /locator|selector|not found|no element/i,   label: 'Selector'  },
  { pattern: /navigation|goto|waitForURL/i,              label: 'Navigation'},
  { pattern: /step.*connect|connect account/i,           label: 'Connect'   },
];

function classifyRootCause(errorMessage, normalizedStack) {
  const text = `${errorMessage || ''} ${normalizedStack || ''}`;
  for (const { pattern, label } of ROOT_CAUSE_RULES) {
    if (pattern.test(text)) return label;
  }
  return 'Unknown';
}

// ── Stack normalization ───────────────────────────────────────────────────────

/**
 * Strip runtime-specific noise so the same logical error produces
 * the same signature across different runs, machines, and line numbers.
 */
function normalizeStack(stackTrace) {
  if (!stackTrace) return '';
  return stackTrace
    .split('\n')
    .filter(line => line.trim())
    .slice(0, 6)                                          // top 6 frames
    .map(line => line
      .replace(/:\d+:\d+/g, '')                          // strip :line:col
      .replace(/\([^)]*\)/g, '')                         // strip (file paths)
      .replace(/at\s+\S+\s*/g, m => m.split(' ')[0] + ' ') // keep 'at FunctionName'
      .replace(/0x[0-9a-f]+/gi, '0xADDR')               // strip hex addresses
      .replace(/\s+/g, ' ')
      .trim()
    )
    .filter(Boolean)
    .join(' | ');
}

function hashSignature(normalized) {
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Cluster a single failure result.
 * Creates a new cluster or increments occurrence on an existing one.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ testId: string, suiteId: string, errorMessage: string, stackTrace: string }} result
 * @returns {string} clusterId
 */
function clusterFailure(db, result) {
  const normalized = normalizeStack(result.stackTrace);
  const signature  = hashSignature(normalized || result.errorMessage || 'unknown');
  const rootCause  = classifyRootCause(result.errorMessage, normalized);

  const existing = db.prepare('SELECT id, affected_tests, occurrence FROM failure_clusters WHERE signature = ?').get(signature);

  if (existing) {
    const affected = JSON.parse(existing.affected_tests || '[]');
    if (!affected.includes(result.testId)) affected.push(result.testId);

    db.prepare(`
      UPDATE failure_clusters
      SET occurrence = occurrence + 1,
          last_seen = ?,
          affected_tests = ?
      WHERE id = ?
    `).run(now(), JSON.stringify(affected), existing.id);

    return existing.id;
  } else {
    const id = generateId();
    db.prepare(`
      INSERT INTO failure_clusters (id, suite_id, signature, root_cause, first_seen, last_seen, occurrence, affected_tests, sample_error)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      result.suiteId || '',
      signature,
      rootCause,
      now(), now(),
      JSON.stringify([result.testId]),
      (result.errorMessage || '').slice(0, 500)
    );

    console.log(`[cluster] New cluster: ${rootCause} — ${signature}`);

    // Broadcast live event to dashboard
    broadcastUpdate(result.suiteId || '', { type: 'new_cluster', clusterId: id, rootCause });

    // Fire Slack alert for newly discovered cluster (fire-and-forget)
    alertNewCluster({
      id,
      root_cause:     rootCause,
      occurrence:     1,
      affected_tests: [result.testId],
      sample_error:   (result.errorMessage || '').slice(0, 300),
    }).catch(err => console.error('[cluster] Slack alert failed:', err.message));

    return id;
  }
}

/**
 * Re-cluster all failures in the DB from scratch.
 * Useful after changing the normalization logic.
 */
function reclusterAll(db) {
  db.prepare('DELETE FROM failure_clusters').run();
  const failures = db.prepare(`SELECT tr.id, tr.test_id, tr.error_message, tr.stack_trace, t.suite_id
    FROM test_results tr JOIN tests t ON t.id = tr.test_id WHERE tr.status = 'failed'`).all();

  let count = 0;
  for (const f of failures) {
    clusterFailure(db, { testId: f.test_id, suiteId: f.suite_id, errorMessage: f.error_message, stackTrace: f.stack_trace });
    count++;
  }
  console.log(`[cluster] Re-clustered ${count} failures`);
  return count;
}

module.exports = { clusterFailure, reclusterAll, normalizeStack, classifyRootCause };
