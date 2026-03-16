'use strict';
// Run Comparison Engine
// Diffs two test runs to identify new failures, regressions, and resolved tests.

/**
 * Compare two runs and return a structured diff.
 * @param {import('better-sqlite3').Database} db
 * @param {string} runAId  — baseline (older)
 * @param {string} runBId  — target  (newer)
 * @returns {object}
 */
function compareRuns(db, runAId, runBId) {
  const runA = db.prepare('SELECT * FROM runs WHERE id = ?').get(runAId);
  const runB = db.prepare('SELECT * FROM runs WHERE id = ?').get(runBId);

  if (!runA) throw new Error(`Run A not found: ${runAId}`);
  if (!runB) throw new Error(`Run B not found: ${runBId}`);

  const resultsA = getRunResultMap(db, runAId);
  const resultsB = getRunResultMap(db, runBId);

  const allTestIds = new Set([...resultsA.keys(), ...resultsB.keys()]);

  const newFailures  = [];   // passed/absent in A, failed in B
  const resolved     = [];   // failed in A, passed in B
  const stillFailing = [];   // failed in both
  const nowSkipped   = [];   // was running, now skipped
  const unchanged    = [];   // same status in both

  for (const testId of allTestIds) {
    const statusA = resultsA.get(testId)?.status || 'absent';
    const statusB = resultsB.get(testId)?.status || 'absent';
    const testMeta = resultsB.get(testId) || resultsA.get(testId);

    const entry = {
      testId,
      testName:  testMeta?.test_name  || testId,
      filePath:  testMeta?.file_path  || '',
      ownerTeam: testMeta?.owner_team || '',
      statusA,
      statusB,
      durationA: resultsA.get(testId)?.duration_ms || 0,
      durationB: resultsB.get(testId)?.duration_ms || 0,
    };

    if (statusB === 'failed' && statusA !== 'failed')      newFailures.push(entry);
    else if (statusA === 'failed' && statusB === 'passed')  resolved.push(entry);
    else if (statusA === 'failed' && statusB === 'failed')  stillFailing.push(entry);
    else if (statusB === 'skipped' && statusA !== 'skipped') nowSkipped.push(entry);
    else                                                     unchanged.push(entry);
  }

  // Duration delta for slowest tests
  const durationChanges = [...allTestIds]
    .map(id => ({
      testId: id,
      testName: (resultsB.get(id) || resultsA.get(id))?.test_name || id,
      durationA: resultsA.get(id)?.duration_ms || 0,
      durationB: resultsB.get(id)?.duration_ms || 0,
      delta: (resultsB.get(id)?.duration_ms || 0) - (resultsA.get(id)?.duration_ms || 0),
    }))
    .filter(d => Math.abs(d.delta) > 2000)   // only >2s changes
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 10);

  return {
    runA:    { id: runAId, number: runA.run_number, branch: runA.branch, status: runA.status, total: runA.total, failed: runA.failed },
    runB:    { id: runBId, number: runB.run_number, branch: runB.branch, status: runB.status, total: runB.total, failed: runB.failed },
    summary: {
      newFailures:   newFailures.length,
      resolved:      resolved.length,
      stillFailing:  stillFailing.length,
      unchanged:     unchanged.length,
      nowSkipped:    nowSkipped.length,
      isRegression:  newFailures.length > 0,
      isImprovement: resolved.length > 0 && newFailures.length === 0,
    },
    newFailures,
    resolved,
    stillFailing,
    nowSkipped,
    durationChanges,
  };
}

function getRunResultMap(db, runId) {
  const rows = db.prepare(`
    SELECT tr.test_id, tr.status, tr.duration_ms,
           t.name as test_name, t.file_path, t.owner_team
    FROM test_results tr
    JOIN tests t ON t.id = tr.test_id
    WHERE tr.run_id = ?
  `).all(runId);

  return new Map(rows.map(r => [r.test_id, r]));
}

module.exports = { compareRuns };
