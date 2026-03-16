'use strict';
// QA Analytics Dashboard — Main App

const API = window.location.origin;
let currentSuite = '';
let ws           = null;
let pollTimer    = null;
const POLL_MS    = 30000;

// ── Theme toggle ───────────────────────────────────────────────────────────────

function getEffectiveTheme() {
  const saved = localStorage.getItem('qa-theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('qa-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  // Sync icon to current effective theme
  applyTheme(getEffectiveTheme());
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || getEffectiveTheme();
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
  // Watch OS preference changes when no manual override is saved
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!localStorage.getItem('qa-theme')) applyTheme(e.matches ? 'light' : 'dark');
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  initThemeToggle();
  await loadSuites();
  await refreshAll();
  connectWebSocket();
  pollTimer = setInterval(refreshAll, POLL_MS);
}

// ── Suite selector ─────────────────────────────────────────────────────────────

async function loadSuites() {
  const suites = await api('/api/suites');
  const sel    = document.getElementById('suite-select');
  if (!sel) return;

  sel.innerHTML = suites.length
    ? suites.map(s => `<option value="${s.id}">${s.name}</option>`).join('')
    : '<option value="">No suites yet</option>';

  currentSuite = suites[0]?.id || '';
  sel.value    = currentSuite;
  sel.addEventListener('change', () => { currentSuite = sel.value; refreshAll(); });
}

// ── Refresh all panels ─────────────────────────────────────────────────────────

async function refreshAll() {
  if (!currentSuite) return;
  document.getElementById('last-updated').textContent = 'Updating...';

  await Promise.all([
    renderMetrics(),
    renderGate(),
    renderClusters(),
    renderFlakyTests(),
    renderRunHistory(),
    renderCompare(),
  ]);

  document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
}

// ── Top metrics ───────────────────────────────────────────────────────────────

async function renderMetrics() {
  const runs = await api(`/api/runs?suite=${currentSuite}&limit=1`);
  const run  = runs[0];
  if (!run) { setMetrics(null); return; }

  const total      = run.total || 1;
  const passRate   = (run.passed / total * 100).toFixed(1);
  const flakyRate  = (run.flaky  / total * 100).toFixed(1);
  const failCount  = run.failed;

  document.getElementById('m-total').textContent  = run.total;
  document.getElementById('m-pass').textContent   = passRate + '%';
  document.getElementById('m-flaky').textContent  = flakyRate + '%';
  document.getElementById('m-failed').textContent = failCount;

  document.getElementById('m-pass-card').className   = `metric-card ${passRate >= 95 ? 'green' : 'red'}`;
  document.getElementById('m-failed-card').className = `metric-card ${failCount === 0 ? 'green' : 'red'}`;
  document.getElementById('m-flaky-card').className  = `metric-card ${flakyRate <= 3 ? 'green' : 'yellow'}`;

  // Charts
  const history = await api(`/api/runs?suite=${currentSuite}&limit=20`);
  const reversed = [...history].reverse();
  const passRates = reversed.map(r => (r.passed / Math.max(r.total,1)) * 100);
  const durations = reversed.map(r => Math.round(r.duration_ms / 60000));
  const labels    = reversed.map(r => `#${r.run_number}`);

  Charts.lineChart('chart-pass-rate', passRates, { color: '#22c55e', min: 80, max: 100, labels, fmt: v => v.toFixed(0) + '%' });
  Charts.lineChart('chart-duration',  durations, { color: '#3b82f6', labels, fmt: v => v.toFixed(0) + 'm' });

  // Donut
  Charts.donutChart('chart-donut', [
    { value: run.passed,  color: '#22c55e' },
    { value: run.failed,  color: '#ef4444' },
    { value: run.skipped, color: '#475569' },
    { value: run.flaky,   color: '#eab308' },
  ], { centerLabel: passRate + '%', centerSub: 'pass rate' });
}

function setMetrics(run) {
  ['m-total','m-pass','m-flaky','m-failed'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
}

// ── Release gate ───────────────────────────────────────────────────────────────

async function renderGate() {
  const data   = await api(`/api/release-gate/status?suite=${currentSuite}`);
  const card   = document.getElementById('gate-card');
  const status = document.getElementById('gate-status');
  const checks = document.getElementById('gate-checks');
  if (!card || !status || !checks) return;

  if (!data || data.status === 'NO_DATA') {
    status.innerHTML = '<span>⚪ No data</span>';
    checks.innerHTML = '<p class="text-muted">Run tests and ingest results first.</p>';
    return;
  }

  const allowed = data.status === 'DEPLOY_ALLOWED';
  card.className = `gate-card ${allowed ? 'allowed' : 'blocked'}`;
  status.innerHTML = allowed
    ? `<span style="color:var(--green)">✅ DEPLOY ALLOWED</span>`
    : `<span style="color:var(--red)">❌ DEPLOY BLOCKED</span>${data.blockers.length ? ` <small class="text-muted">— ${data.blockers.join(', ')}</small>` : ''}`;

  checks.innerHTML = (data.checks || []).map(c => `
    <div class="gate-check ${c.pass ? 'pass' : 'fail'}">
      <span class="check-name">${c.icon} ${c.name}</span>
      <span class="check-value">${c.display} <small class="text-muted">${c.threshold_display}</small></span>
    </div>
  `).join('');
}

// ── Failure clusters ───────────────────────────────────────────────────────────

async function renderClusters() {
  const clusters = await api(`/api/failure-clusters?suite=${currentSuite}&status=open&limit=10`);
  const tbody    = document.getElementById('clusters-tbody');
  const badge    = document.getElementById('clusters-badge');
  if (!tbody) return;

  if (badge) badge.textContent = `${clusters.length} open`;

  if (!clusters.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty"><h4>No open clusters</h4><p>All clean! Failures will be grouped here.</p></td></tr>`;
    return;
  }

  tbody.innerHTML = clusters.map(c => `
    <tr>
      <td><span class="badge ${c.status}">${esc(c.root_cause)}</span></td>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-dim)" title="${esc(c.sample_error)}">${esc(c.sample_error.slice(0,80) || '—')}</td>
      <td><strong style="color:var(--red)">${c.occurrence}</strong></td>
      <td>${(c.affected_tests || []).length}</td>
      <td>
        <button data-resolve="${c.id}" style="background:none;border:1px solid var(--border);color:var(--text-muted);padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px">Resolve</button>
      </td>
    </tr>
  `).join('');
}

// Event delegation — survives table re-renders
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-resolve]');
  if (!btn) return;
  btn.textContent = '…';
  btn.disabled    = true;
  await api(`/api/failure-clusters/${btn.dataset.resolve}/status`, 'PATCH', { status: 'resolved' });
  renderClusters();
});

// ── Flaky tests ───────────────────────────────────────────────────────────────

async function renderFlakyTests() {
  const tests = await api(`/api/flaky-tests?suite=${currentSuite}&min=0.05&limit=15`);
  const tbody = document.getElementById('flaky-tbody');
  const badge = document.getElementById('flaky-badge');
  if (!tbody) return;

  const highFlaky = tests.filter(t => t.flaky_rate >= 0.10);
  if (badge) badge.textContent = `${highFlaky.length} above 10%`;

  if (!tests.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty"><h4>No flaky tests</h4><p>All tests are stable.</p></td></tr>`;
    return;
  }

  tbody.innerHTML = tests.map(t => {
    const pct   = (t.flaky_rate * 100).toFixed(0);
    const color = t.flaky_rate >= 0.25 ? 'red' : t.flaky_rate >= 0.10 ? 'yellow' : 'green';
    const star  = t.is_critical ? '★' : '☆';
    const starStyle = t.is_critical
      ? 'color:var(--yellow);cursor:pointer;font-size:16px'
      : 'color:var(--text-muted);cursor:pointer;font-size:16px';
    return `
    <tr>
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.name)}">${esc(t.name)}</td>
      <td>
        <div class="bar-wrap">
          <div class="bar"><div class="bar-fill ${color}" style="width:${Math.min(pct,100)}%"></div></div>
          <span class="bar-pct">${pct}%</span>
        </div>
      </td>
      <td class="text-muted">${t.pass_count}P / ${t.fail_count}F</td>
      <td><span class="owner-cell" onclick="openOwnerModal('${t.id}', '${esc(t.name)}', '${esc(t.owner_team||'')}', '${esc(t.owner_email||'')}')" title="Assign owner" style="cursor:pointer;color:${t.owner_email||t.owner_team ? 'var(--text-dim)' : 'var(--text-muted)'}">${esc(t.owner_email || t.owner_team || '+ assign')}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(t.file_path?.split('/').pop() || '—')}</td>
      <td><span title="${t.is_critical ? 'Critical — unmark' : 'Mark as critical'}" style="${starStyle}" onclick="toggleCritical('${t.id}', ${t.is_critical ? 1 : 0})">${star}</span></td>
    </tr>`;
  }).join('');
}

async function toggleCritical(testId, current) {
  await api(`/api/flaky-tests/${testId}/critical`, 'PATCH', { critical: !current });
  renderFlakyTests();
}

// ── Owner assignment modal ─────────────────────────────────────────────────────

let _ownerTestId = null;

function openOwnerModal(testId, testName, team, email) {
  _ownerTestId = testId;
  document.getElementById('owner-test-name').textContent = testName;
  document.getElementById('owner-team').value  = team  || '';
  document.getElementById('owner-email').value = email || '';
  const modal = document.getElementById('owner-modal');
  modal.style.display = 'flex';
  document.getElementById('owner-email').focus();
}

function closeOwnerModal() {
  document.getElementById('owner-modal').style.display = 'none';
  _ownerTestId = null;
}

async function saveOwner() {
  if (!_ownerTestId) return;
  const team  = document.getElementById('owner-team').value.trim();
  const email = document.getElementById('owner-email').value.trim();
  await api(`/api/flaky-tests/${_ownerTestId}/owner`, 'PATCH', { team, email });
  closeOwnerModal();
  renderFlakyTests();
}

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('owner-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeOwnerModal();
  });
});

// ── Run history ────────────────────────────────────────────────────────────────

async function renderRunHistory() {
  const runs  = await api(`/api/runs?suite=${currentSuite}&limit=10`);
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  if (!runs.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty"><h4>No runs yet</h4><p>Ingest test results to see history.</p></td></tr>`;
    return;
  }

  tbody.innerHTML = runs.map(r => {
    const total    = r.total || 1;
    const passRate = (r.passed / total * 100).toFixed(0);
    const dur      = r.duration_ms > 60000 ? `${(r.duration_ms/60000).toFixed(1)}m` : `${(r.duration_ms/1000).toFixed(0)}s`;
    return `
    <tr>
      <td><strong>#${r.run_number}</strong></td>
      <td><span class="badge ${r.status}">${r.status}</span></td>
      <td>${passRate}% <span class="text-muted">(${r.passed}/${r.total})</span></td>
      <td class="${r.failed > 0 ? 'text-red' : 'text-green'}">${r.failed}</td>
      <td class="text-muted">${r.branch || 'main'}</td>
      <td class="text-muted">${dur}</td>
    </tr>`;
  }).join('');

  // Bar chart of recent pass rates
  const reversed   = [...runs].reverse();
  const passRates  = reversed.map(r => (r.passed / Math.max(r.total,1)) * 100);
  Charts.barChart('chart-runs', passRates.map((v,i) => ({
    value: v,
    label: `#${reversed[i].run_number}`,
    color: v >= 95 ? '#22c55e' : v >= 80 ? '#eab308' : '#ef4444',
  })));
}

// ── Run comparison ─────────────────────────────────────────────────────────────

async function renderCompare() {
  const data  = await api(`/api/compare/latest?suite=${currentSuite}`);
  const panel = document.getElementById('compare-content');
  if (!panel) return;

  if (!data || data.message) {
    panel.innerHTML = `<div class="empty"><h4>Need 2+ runs</h4><p>Run tests again to see a diff.</p></div>`;
    return;
  }

  const fmtMs = ms => !ms ? '—' : ms > 60000 ? `${(ms/60000).toFixed(1)}m` : `${(ms/1000).toFixed(1)}s`;

  // Strip browser/project prefix ("> chromium > ") and reduce to "spec file › test name"
  function fmtTestName(raw) {
    const parts = (raw || '').split(' > ').map(s => s.trim()).filter(Boolean);
    // Drop leading segments that look like a browser name or are empty
    const meaningful = parts.filter(p => !/^chromium$|^firefox$|^webkit$/i.test(p));
    if (meaningful.length === 0) return esc(raw);
    // Last part = test title, second-to-last = spec file (basename only)
    const title    = meaningful[meaningful.length - 1];
    const specFull = meaningful.length > 1 ? meaningful[meaningful.length - 2] : '';
    const spec     = specFull.split('/').pop().replace(/\.spec\.js$/, '');
    return spec ? `<span style="color:var(--text-muted)">${esc(spec)}</span> › ${esc(title)}` : esc(title);
  }

  // Only show rows where both runs have real duration data (skip 0-baseline entries)
  const meaningfulDur = (data.durationChanges || []).filter(d => d.durationA > 0 && d.durationB > 0);
  // If no meaningful comparisons, note it clearly
  const durSection = meaningfulDur.length ? `
    <div style="padding:12px 20px 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);border-top:1px solid var(--border)">
      Duration Changes
    </div>
    <table class="table" style="margin-bottom:4px">
      <thead>
        <tr>
          <th>Test</th>
          <th style="text-align:right">Run #${data.runA?.number}</th>
          <th style="text-align:right">Run #${data.runB?.number}</th>
          <th style="text-align:right">Δ</th>
        </tr>
      </thead>
      <tbody>
        ${meaningfulDur.slice(0, 10).map(d => {
          const delta    = d.delta;
          const sign     = delta > 0 ? '+' : '';
          const absDelta = Math.abs(delta);
          // Only flag as red if genuinely slower by >5s; treat <5s as noise
          const color = delta > 5000 ? 'var(--red)' : delta < -5000 ? 'var(--green)' : 'var(--text-dim)';
          const tooltip = esc((d.testName || '').replace(/"/g, '&quot;'));
          return `<tr>
            <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${tooltip}">${fmtTestName(d.testName)}</td>
            <td style="text-align:right" class="text-muted">${fmtMs(d.durationA)}</td>
            <td style="text-align:right" class="text-muted">${fmtMs(d.durationB)}</td>
            <td style="text-align:right;font-weight:600;color:${color}">${sign}${fmtMs(absDelta)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '';

  panel.innerHTML = `
    <div style="padding:12px 20px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-muted)">
      Comparing run <strong>#${data.runA?.number}</strong> → <strong>#${data.runB?.number}</strong>
      &nbsp;·&nbsp; branch: ${data.runB?.branch || 'main'}
    </div>
    <div class="diff-grid">
      <div class="diff-box new-fail">
        <div class="diff-label">New Failures</div>
        <div class="diff-count">${data.summary.newFailures}</div>
        <ul>${(data.newFailures || []).slice(0,5).map(f => `<li>● ${esc(f.testName)}</li>`).join('') || '<li class="text-muted">None</li>'}</ul>
      </div>
      <div class="diff-box resolved">
        <div class="diff-label">Resolved</div>
        <div class="diff-count">${data.summary.resolved}</div>
        <ul>${(data.resolved || []).slice(0,5).map(f => `<li>✓ ${esc(f.testName)}</li>`).join('') || '<li class="text-muted">None</li>'}</ul>
      </div>
      <div class="diff-box unchanged">
        <div class="diff-label">Still Failing</div>
        <div class="diff-count">${data.summary.stillFailing}</div>
        <ul>${(data.stillFailing || []).slice(0,5).map(f => `<li>⟳ ${esc(f.testName)}</li>`).join('') || '<li class="text-muted">None</li>'}</ul>
      </div>
    </div>
    ${durSection}`;
}

// ── WebSocket live updates ─────────────────────────────────────────────────────

function connectWebSocket() {
  if (!currentSuite) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/live?suite=${currentSuite}`);

  ws.onopen    = () => setLive(true);
  ws.onclose   = () => { setLive(false); setTimeout(connectWebSocket, 5000); };
  ws.onerror   = () => setLive(false);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === 'run_complete') {
      const icon = msg.status === 'failed' ? '❌' : '✅';
      showToast(`${icon} Run #${msg.runNumber} — ${msg.failed} failed / ${msg.total} total`, msg.status === 'failed' ? 'red' : 'green');
      refreshAll();
    }

    if (msg.type === 'new_cluster') {
      showToast(`🔴 New failure cluster: ${msg.rootCause}`, 'red');
      renderClusters();
    }

    if (msg.type === 'flaky_alert') {
      showToast(`⚠️ New flaky test: ${msg.testName} (${(msg.flakyRate * 100).toFixed(0)}%)`, 'yellow');
      renderFlakyTests();
    }
  };
}

function setLive(on) {
  const dot  = document.getElementById('live-dot');
  const text = document.getElementById('live-text');
  if (dot)  dot.style.background  = on ? 'var(--green)' : 'var(--red)';
  if (text) text.textContent      = on ? 'Live' : 'Offline';
}

function showToast(msg, type = 'green') {
  const bg = type === 'red' ? 'var(--red)' : type === 'yellow' ? 'var(--yellow)' : 'var(--green)';
  const fg = type === 'green' ? '#000' : '#fff';
  const t  = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:20px;right:20px;background:${bg};color:${fg};padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:999;animation:fadeIn .3s;max-width:340px`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Utilities ──────────────────────────────────────────────────────────────────

async function api(path, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', init);
