'use strict';
// Slack message templates — Block Kit format

const pct = v  => `${(v * 100).toFixed(1)}%`;
const dur = ms => ms > 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(0)}s`;
const num = v  => String(v);

const TEMPLATES = {

  // ── Suite failed ────────────────────────────────────────────────────────────
  suiteFailure(run, gate, dashboardUrl) {
    const passRate = pct((run.passed || 0) / Math.max(run.total || 1, 1));
    return {
      text: `❌ QA Suite Failed — ${run.branch || 'main'}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `❌ QA Suite Failed — ${run.branch || 'main'}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Pass Rate*\n${passRate}` },
            { type: 'mrkdwn', text: `*Failed*\n${num(run.failed || 0)}` },
            { type: 'mrkdwn', text: `*New Failures*\n${num(gate?.summary?.newFailures || 0)}` },
            { type: 'mrkdwn', text: `*Duration*\n${dur(run.duration_ms || 0)}` },
          ],
        },
        gate?.blockers?.length ? {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Gate Blockers:* ${gate.blockers.join(' • ')}` },
        } : null,
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '📊 View Dashboard' }, url: dashboardUrl || 'http://localhost:4000' },
            { type: 'button', text: { type: 'plain_text', text: '🔍 View Diff'      }, url: `${dashboardUrl || 'http://localhost:4000'}/#compare` },
          ],
        },
        { type: 'divider' },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Run #${run.run_number || '?'} | Commit: \`${(run.commit_sha || 'unknown').slice(0, 7)}\` | ${new Date().toUTCString()}` }] },
      ].filter(Boolean),
    };
  },

  // ── Flaky threshold exceeded ────────────────────────────────────────────────
  flakyAlert(tests, dashboardUrl) {
    const lines = tests.slice(0, 8).map(t =>
      `• *${t.name}* — ${pct(t.flaky_rate)} flaky · owner: ${t.owner_email || '_unassigned_'}`
    ).join('\n');

    return {
      text: `⚠️ Flaky Test Alert — ${tests.length} tests above threshold`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `⚠️ Flaky Tests Detected (${tests.length})` } },
        { type: 'section', text: { type: 'mrkdwn', text: lines } },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '🔍 View Flaky Tests' }, url: `${dashboardUrl || 'http://localhost:4000'}/#flaky` },
          ],
        },
      ],
    };
  },

  // ── Release gate result ─────────────────────────────────────────────────────
  releaseGate(status, run, dashboardUrl) {
    const allowed = status === 'DEPLOY_ALLOWED';
    return {
      text: allowed ? `✅ Release Gate Passed — ${run.branch || 'main'}` : `🚫 Release Gate BLOCKED — ${run.branch || 'main'}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: allowed ? `✅ Release Gate Passed` : `🚫 Release Gate BLOCKED` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Branch*\n${run.branch || 'main'}` },
            { type: 'mrkdwn', text: `*Commit*\n\`${(run.commit_sha || 'unknown').slice(0, 7)}\`` },
          ],
        },
        !allowed ? {
          type: 'section',
          text: { type: 'mrkdwn', text: `Deploy is *blocked*. Fix failing tests before merging.` },
        } : null,
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '📊 Dashboard' }, url: dashboardUrl || 'http://localhost:4000' },
          ],
        },
      ].filter(Boolean),
    };
  },

  // ── New cluster discovered ──────────────────────────────────────────────────
  newCluster(cluster, dashboardUrl) {
    return {
      text: `🔴 New Failure Cluster: ${cluster.root_cause}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `🔴 New Failure Cluster: ${cluster.root_cause}` } },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Occurrences*\n${cluster.occurrence}` },
            { type: 'mrkdwn', text: `*Tests Affected*\n${(cluster.affected_tests || []).length}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `\`\`\`${(cluster.sample_error || '').slice(0, 300)}\`\`\`` },
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '🔍 View Cluster' }, url: `${dashboardUrl || 'http://localhost:4000'}/#clusters` },
          ],
        },
      ],
    };
  },
};

module.exports = { TEMPLATES, pct, dur };
