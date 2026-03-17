#!/usr/bin/env node
// @ts-nocheck — large CLI script; full strict typing deferred to a future pass
// Reads test-results/results.json → generates + opens a visual HTML dashboard.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const RESULTS_JSON   = path.resolve(__dirname, '../test-results/results.json');
const STEPS_JSON     = path.resolve(__dirname, '../test-results/steps.json');
const INVENTORY_JSON = path.resolve(__dirname, '../test-results/inventory.json');
const CATALOG_JSON   = path.resolve(__dirname, '../fixtures/data/templates_catalog.json');
const HISTORY_JSON   = path.resolve(__dirname, '../test-results/history.json');
const CONFIG_JSON    = path.resolve(__dirname, '../dashboard.config.json');
const OUT_HTML       = path.resolve(__dirname, '../test-results/dashboard.html');

const dashConfig  = fs.existsSync(CONFIG_JSON)  ? JSON.parse(fs.readFileSync(CONFIG_JSON,  'utf8')) : {};
const historyRaw  = fs.existsSync(HISTORY_JSON) ? JSON.parse(fs.readFileSync(HISTORY_JSON, 'utf8')) : [];
const SLOW_MS         = dashConfig.slowThresholdMs  ?? 30000;
const PER_TEST_MS     = dashConfig.perTestThresholds ?? {};
const HISTORY_LIMIT   = dashConfig.historyLimit      ?? 200;

// Return the effective slow threshold for a given test title
function slowMsFor(title) { return PER_TEST_MS[title] ?? SLOW_MS; }

// Strip ANSI terminal escape codes (colors, bold, etc.) from a string
function stripAnsi(str) {
  if (!str) return str;
  return str
    .replace(/\x1B\[[0-9;]*[mGKHFA-Za-z]/g, '')  // CSI sequences (colors, bold, etc.)
    .replace(/\x1B\][^\x07]*\x07/g, '')            // OSC sequences
    .replace(/\x1B./g, '');                         // other ESC sequences
}

// ── Parse Playwright error messages for Expected / Actual / Stack ─────────────
function parseFailureDetail(errorMsg) {
  if (!errorMsg) return { expected: null, actual: null, stackTrace: null, assertionCall: null, locator: null, callLog: null };
  const lines = errorMsg.split('\n');
  let expected = null, actual = null, stackStart = -1;
  let assertionCall = null, locator = null;
  let callLogStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // Extract assertion call: "expect(locator).toBeDisabled() failed"
    if (!assertionCall) {
      const m = l.match(/expect\([^)]*\)\.\w+\([^)]*\)/);
      if (m) assertionCall = l.replace(/\s+failed\s*$/i, '').trim();
    }
    // Extract locator line: "  Locator: locator('.foo')"
    if (!locator && /^\s*Locator\s*:/.test(l))
      locator = l.replace(/^\s*Locator\s*:\s*/, '').trim();
    if (expected === null && /^\s*Expected\s*:/.test(l))
      expected = l.replace(/^\s*Expected\s*:\s*/, '').trim();
    if (actual === null && /^\s*Received\s*:/.test(l))
      actual = l.replace(/^\s*Received\s*:\s*/, '').trim();
    // Capture "Call log:" section for extra context
    if (callLogStart < 0 && /^\s*Call log\s*:/i.test(l)) callLogStart = i + 1;
    if (stackStart < 0 && /^\s{2,}at /.test(l)) stackStart = i;
  }

  // Extract up to 4 call log lines (stop at stack frames)
  let callLog = null;
  if (callLogStart >= 0) {
    const logLines = [];
    for (let i = callLogStart; i < lines.length && !/^\s{2,}at /.test(lines[i]) && logLines.length < 4; i++) {
      const trimmed = lines[i].replace(/^\s*[-–•]\s*/, '').trim();
      if (trimmed) logLines.push(trimmed);
    }
    if (logLines.length) callLog = logLines.join('\n');
  }

  const stackTrace = stackStart >= 0 ? lines.slice(stackStart).join('\n') : null;
  return { expected, actual, stackTrace, assertionCall, locator, callLog };
}

// ── Auto-classify probable failure cause ──────────────────────────────────────
function classifyCause(errorMsg) {
  if (!errorMsg) return null;
  const e = errorMsg;
  if (/net::|ERR_|SSL|ECONNREFUSED|fetch failed|Navigation timeout|ERR_NAME_NOT_RESOLVED/i.test(e)) return 'env';
  if (/TimeoutError.*navigation|page.*not.*load|browser.*crash/i.test(e)) return 'env';
  if (/TypeError|SyntaxError|ReferenceError|Cannot read prop|is not a function|is not defined/i.test(e)) return 'script';
  if (/strict mode violation|resolved to \d+ elements/i.test(e)) return 'script';
  if (/expect\(.*\).*failed|Expected:|Received:/s.test(e)) return 'app';
  if (/TimeoutError|Timeout \d+ms exceeded/i.test(e)) return 'env';
  return 'app';
}

// ── Recommended action based on error patterns ────────────────────────────────
// Returns { title, body, detail, actionType } where actionType is 'dev'|'qa'|'ops'
function buildRecommendation(errorMsg, cause) {
  if (!errorMsg && !cause) return null;
  const e = errorMsg || '';

  // ── Script / selector issues ───────────────────────────────────────────────
  if (
    /element not found|locator.*failed|selector not found|strict mode violation|resolved to \d+ elements/i.test(e) ||
    /No element found|Unable to find/i.test(e)
  ) {
    return {
      actionType: 'qa',
      title: 'Review & Update Test Script',
      body:  'The locator or selector used in this test may no longer match the current UI.',
      detail: 'Check whether the element\'s CSS selector, role, or text has changed in the application. Update the Page Object or test locator accordingly.',
    };
  }

  if (
    /TypeError|SyntaxError|ReferenceError|Cannot read prop|is not a function|is not defined/i.test(e)
  ) {
    return {
      actionType: 'qa',
      title: 'Fix Test Script Error',
      body:  'A JavaScript runtime error occurred inside the test script itself.',
      detail: 'This is not caused by the application — the test code has a bug. Review the stack trace and fix the script before re-running.',
    };
  }

  // ── Environment / infrastructure issues ───────────────────────────────────
  if (
    /timeout|Timeout \d+ms exceeded|service unavailable|network error|ECONNREFUSED|ERR_|net::|fetch failed|ERR_NAME_NOT_RESOLVED|SSL|Navigation timeout/i.test(e)
  ) {
    return {
      actionType: 'ops',
      title: 'Investigate Environment',
      body:  'A network, timeout, or infrastructure problem prevented the test from completing.',
      detail: 'Verify that the test environment is up and reachable. Check service health, DNS resolution, SSL certificates, and any VPN or proxy settings required.',
    };
  }

  if (/500|internal server error|unexpected response|API failed|server error/i.test(e)) {
    return {
      actionType: 'dev',
      title: 'Report Bug to Development',
      body:  'The application returned a server-side error (5xx) during this test.',
      detail: 'Attach the error message, request/response logs, and any screenshots to a bug report for the development team.',
    };
  }

  // ── Assertion failures (Expected vs Received mismatch) ────────────────────
  if (cause === 'app' || /expect\(.*\).*failed|Expected:|Received:/s.test(e)) {
    return {
      actionType: 'dev',
      title: 'Report Bug to Development',
      body:  'The application\'s behaviour did not match what the test expects.',
      detail: 'Compare the Expected vs Received values above. If the expected behaviour is correct per the requirements, file a bug report and include this failure detail.',
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return {
    actionType: 'dev',
    title: 'Report or Investigate',
    body:  'The failure could not be automatically classified.',
    detail: 'Review the error message and stack trace. If the application produced an unexpected result, report it to the development team. If the test script appears broken, update it.',
  };
}

if (!fs.existsSync(RESULTS_JSON)) {
  console.error('No results.json found. Run tests first.');
  process.exit(1);
}

const raw       = JSON.parse(fs.readFileSync(RESULTS_JSON, 'utf8'));
const stats     = raw.stats || {};
const stepsMap  = fs.existsSync(STEPS_JSON)     ? JSON.parse(fs.readFileSync(STEPS_JSON, 'utf8'))     : {};
const inventory = fs.existsSync(INVENTORY_JSON) ? JSON.parse(fs.readFileSync(INVENTORY_JSON, 'utf8')) : null;
const catalogRaw = fs.existsSync(CATALOG_JSON)  ? JSON.parse(fs.readFileSync(CATALOG_JSON,  'utf8')) : null;
// Build name → { tags, entities, pricing } lookup from templates_catalog.json
const catalogMeta = {};
if (catalogRaw?.templates) {
  for (const t of catalogRaw.templates) {
    catalogMeta[t.name] = { tags: t.tags || [], entities: t.entities || [], pricing: t.pricing || '' };
  }
}

// ── Flatten all tests ────────────────────────────────────────────────────────
function flattenTests(suites, filePath = '', suiteTitles = []) {
  const out = [];
  for (const suite of suites) {
    const fp  = suite.file || filePath;
    const sp  = suite.title ? [...suiteTitles, suite.title] : suiteTitles;
    for (const spec of (suite.specs || [])) {
      for (const test of (spec.tests || [])) {
        const allResults = test.results || [];
        const lastResult = allResults[allResults.length - 1] || {};
        const steps = lastResult.steps?.length ? lastResult.steps : stepsMap[spec.id] || [];
        const errorMsg   = stripAnsi(lastResult.error?.message || '');
        const parsed     = parseFailureDetail(errorMsg);
        const stdout     = stripAnsi((lastResult.stdout  || []).map(e => (typeof e === 'string' ? e : e.text || '')).filter(Boolean).join(''));
        const stderr     = stripAnsi((lastResult.stderr  || []).map(e => (typeof e === 'string' ? e : e.text || '')).filter(Boolean).join(''));
        out.push({
          id:          spec.id,
          file:        fp.replace(/^.*?tests\//, '').replace(/\.spec\.js$/, ''),
          suite:       sp.join(' › '),
          title:       spec.title,
          status:      lastResult.status || 'unknown',
          duration:    lastResult.duration || 0,
          retry:       allResults.length - 1,
          error:         errorMsg,
          expected:      parsed.expected,
          actual:        parsed.actual,
          stackTrace:    parsed.stackTrace,
          assertionCall: parsed.assertionCall,
          locator:       parsed.locator,
          callLog:       parsed.callLog,
          cause:         classifyCause(errorMsg),
          stdout,
          stderr,
          steps,
          attachments: lastResult.attachments || [],
          allResults,
          startTime:   allResults[0]?.startTime || null,
        });
      }
    }
    if (suite.suites?.length) out.push(...flattenTests(suite.suites, fp, sp));
  }
  return out;
}

const tests      = flattenTests(raw.suites || []);
const passed     = tests.filter(t => t.status === 'passed').length;
const timedOut   = tests.filter(t => t.status === 'timedOut').length;
const failedOnly = tests.filter(t => t.status === 'failed').length;
const failed     = failedOnly + timedOut;
const skipped    = tests.filter(t => t.status === 'skipped').length;
const unknownCt  = tests.filter(t => t.status === 'unknown').length;
const flakyTests = tests.filter(t => t.retry > 0 && t.status === 'passed');
const flaky      = flakyTests.length;
const retried    = tests.filter(t => t.retry > 0).length;
const total      = tests.length;
const dur        = stats.duration ? fmt(stats.duration) : '—';
const pct        = total ? Math.round((passed / total) * 100) : 0;
const failRate   = total ? failed / total : 0;

const barColor = pct >= 95 ? 'linear-gradient(90deg,#22c55e,#16a34a)'
               : pct >= 80 ? 'linear-gradient(90deg,#f59e0b,#d97706)'
               : 'linear-gradient(90deg,#ef4444,#b91c1c)';

// ── History & trend ───────────────────────────────────────────────────────────
const prevRun   = historyRaw.length > 0 ? historyRaw[historyRaw.length - 1] : null;
const trendDiff = prevRun !== null ? pct - prevRun.pct : null;
const trendHtml = trendDiff === null ? ''
  : trendDiff > 0  ? `<span class="trend-up">▲ +${trendDiff}% vs last run</span>`
  : trendDiff < 0  ? `<span class="trend-down">▼ ${trendDiff}% vs last run</span>`
  : `<span class="trend-flat">→ same as last run</span>`;

// Warn if significantly fewer tests ran than historical peak
const histMax  = historyRaw.length > 0 ? Math.max(...historyRaw.map(r => r.total)) : 0;
const countGap = histMax > 0 && total < Math.floor(histMax * 0.9) ? histMax - total : 0;

// ── CI context from environment variables ────────────────────────────────────
const e = process.env;
const ctx = {
  branch:   e.GITHUB_REF_NAME    || e.CI_COMMIT_REF_NAME || e.CI_BRANCH    || e.GIT_BRANCH    || (() => { try { return require('child_process').execSync('git branch --show-current', { stdio: ['pipe','pipe','pipe'] }).toString().trim(); } catch { return ''; } })(),
  commit:   (e.GITHUB_SHA        || e.CI_COMMIT_SHA      || e.GIT_COMMIT   || '').slice(0, 8),
  env:      e.CI_ENVIRONMENT_NAME|| e.CI_ENVIRONMENT     || e.ENVIRONMENT  || e.BASE_URL       || '',
  actor:    e.GITHUB_ACTOR       || e.GITLAB_USER_LOGIN  || e.CI_ACTOR     || e.USER           || '',
  buildUrl: e.GITHUB_SERVER_URL && e.GITHUB_REPOSITORY && e.GITHUB_RUN_ID
              ? `${e.GITHUB_SERVER_URL}/${e.GITHUB_REPOSITORY}/actions/runs/${e.GITHUB_RUN_ID}`
              : e.CI_JOB_URL || e.BUILD_URL || '',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(ms) {
  if (ms < 1000)  return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
function esc(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const statusClass = { passed:'pass', failed:'fail', timedOut:'fail', skipped:'skip', unknown:'skip' };

// ── Release gate ─────────────────────────────────────────────────────────────
function buildReleaseGate() {
  let cls, icon, verdict, reason, detail;

  if (unknownCt > 0) {
    cls     = 'gate-incomplete';
    icon    = '⚫';
    verdict = 'INCOMPLETE RUN';
    reason  = `${unknownCt} test${unknownCt !== 1 ? 's' : ''} have unknown status — results cannot be trusted`;
    detail  = 'Re-run the suite. Unknown status usually means a worker crash or reporter failure.';
  } else if (timedOut > 0) {
    cls     = 'gate-blocked';
    icon    = '🔴';
    verdict = 'BLOCKED';
    reason  = `${timedOut} test${timedOut !== 1 ? 's' : ''} timed out`;
    detail  = 'Timed-out tests indicate infrastructure issues, infinite waits, or dead network calls. Do not release.';
  } else if (failed === 0 && skipped === 0) {
    cls     = 'gate-safe';
    icon    = '🟢';
    verdict = 'SAFE TO RELEASE';
    reason  = `All ${total} tests passed`;
    detail  = flaky > 0 ? `⚠ ${flaky} test${flaky !== 1 ? 's' : ''} needed retries — monitor for flakiness` : 'No failures, no skips, no retries.';
  } else if (failed === 0) {
    cls     = 'gate-safe';
    icon    = '🟢';
    verdict = 'SAFE TO RELEASE';
    reason  = `${passed} passed, ${skipped} skipped — no failures detected`;
    detail  = flaky > 0 ? `⚠ ${flaky} test${flaky !== 1 ? 's' : ''} needed retries — monitor for flakiness` : 'All executed tests passed.';
  } else if (failRate < 0.05) {
    cls     = 'gate-review';
    icon    = '🟡';
    verdict = 'REVIEW REQUIRED';
    reason  = `${failed} failure${failed !== 1 ? 's' : ''} detected (${pct}% pass rate — below 5% block threshold)`;
    detail  = 'Inspect failures below. If they are known flakes or unrelated to this change, release may proceed with sign-off.';
  } else {
    cls     = 'gate-blocked';
    icon    = '🔴';
    verdict = 'BLOCKED';
    reason  = `${failed} failure${failed !== 1 ? 's' : ''} — pass rate ${pct}% is below the 95% release threshold`;
    detail  = 'Fix all failing tests before releasing. Expand failures below to see error details.';
  }

  return `
<div class="release-gate ${cls}">
  <div class="gate-left">
    <span class="gate-icon">${icon}</span>
    <div class="gate-text">
      <span class="gate-verdict">${verdict}</span>
      <span class="gate-reason">${esc(reason)}</span>
    </div>
  </div>
  <div class="gate-detail">${esc(detail)}</div>
</div>`;
}

// ── Context bar ───────────────────────────────────────────────────────────────
function buildContextBar() {
  const items = [];
  if (ctx.branch)   items.push(`<span class="ctx-item">🌿 <strong>Branch:</strong> ${esc(ctx.branch)}</span>`);
  if (ctx.commit)   items.push(`<span class="ctx-item">🔖 <strong>Commit:</strong> <code>${esc(ctx.commit)}</code></span>`);
  if (ctx.env)      items.push(`<span class="ctx-item">🌐 <strong>Env:</strong> ${esc(ctx.env)}</span>`);
  if (ctx.actor)    items.push(`<span class="ctx-item">👤 <strong>By:</strong> ${esc(ctx.actor)}</span>`);
  if (ctx.buildUrl) items.push(`<span class="ctx-item">🔗 <a href="${esc(ctx.buildUrl)}" target="_blank">View CI Build</a></span>`);

  if (!items.length) {
    items.push(`<span class="ctx-item ctx-local">💻 Local run — no CI context detected. Set CI env vars to show branch/commit info.</span>`);
  }

  return `<div class="context-bar">${items.join('<span class="ctx-sep">·</span>')}</div>`;
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function buildSparkline() {
  const recent = historyRaw.slice(-10);
  if (recent.length < 2) return '';

  const W = 140, H = 36, PAD = 4;
  const vals   = recent.map(r => r.pct);
  const minVal = Math.max(0,   Math.min(...vals) - 5);
  const maxVal = Math.min(100, Math.max(...vals) + 5);
  const range  = maxVal - minVal || 1;

  const pts = vals.map((v, i) => {
    const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2);
    const y = (H - PAD) - ((v - minVal) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lineColor = pct >= 95 ? '#22c55e' : pct >= 80 ? '#f59e0b' : '#ef4444';
  const [lx, ly]  = pts[pts.length - 1].split(',');

  // Area fill path: line points + bottom-right + bottom-left
  const areaPath = `M ${pts.join(' L ')} L ${(W - PAD).toFixed(1)},${H} L ${PAD},${H} Z`;

  const dots = pts.map((pt, i) => {
    const [x, y] = pt.split(',');
    if (i === pts.length - 1) return `<circle cx="${x}" cy="${y}" r="3.5" fill="${lineColor}" stroke="#0f1117" stroke-width="1.5"/>`;
    return `<circle cx="${x}" cy="${y}" r="1.5" fill="#475569"/>`;
  }).join('');

  // Tooltip titles on dots
  const titles = pts.map((pt, i) => {
    const r  = recent[i];
    const [x, y] = pt.split(',');
    const d  = new Date(r.date).toLocaleDateString();
    return `<circle cx="${x}" cy="${y}" r="6" fill="transparent" style="cursor:default"><title>${d}: ${r.pct}% (${r.passed}/${r.total})</title></circle>`;
  }).join('');

  return `<div class="sparkline-wrap" title="Pass rate trend — last ${vals.length} runs">
    <svg width="${W}" height="${H}" class="sparkline">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="${lineColor}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#sparkGrad)"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="${lineColor}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${titles}
      <text x="${lx}" y="${(parseFloat(ly) - 6).toFixed(1)}" text-anchor="middle" font-size="9" fill="${lineColor}" font-weight="700">${pct}%</text>
    </svg>
    <span class="sparkline-label">${vals.length} runs</span>
  </div>`;
}

// ── Flaky tests block ─────────────────────────────────────────────────────────
function buildFlakyBlock() {
  if (!flakyTests.length) return '';

  const rows = flakyTests.map(t => `
    <tr>
      <td class="flaky-title">${esc(t.title)}<span class="slow-file"> · ${esc(t.file)}</span></td>
      <td class="flaky-retries">🔁 ${t.retry} retr${t.retry > 1 ? 'ies' : 'y'}</td>
      <td class="flaky-dur">${fmt(t.duration)}</td>
    </tr>`).join('');

  return `
<div class="flaky-section">
  <div class="flaky-header">
    <span>⚠ Flaky Tests</span>
    <span class="flaky-count">${flakyTests.length} test${flakyTests.length !== 1 ? 's' : ''} passed only after retry</span>
  </div>
  <table class="flaky-table"><tbody>${rows}</tbody></table>
</div>`;
}

// ── Step tree ────────────────────────────────────────────────────────────────
function stepRows(steps, depth = 0) {
  if (!steps?.length) return '';
  return steps.map(s => {
    const ok       = !s.error;
    const indent   = depth * 18;
    const children = s.steps?.length ? stepRows(s.steps, depth + 1) : '';
    let errMsg = '';
    if (s.error?.message) {
      const lines = s.error.message.split('\n');
      const full  = lines.length > 1
        ? `<details class="step-err-detail"><summary>Full trace</summary><pre>${esc(s.error.message)}</pre></details>`
        : '';
      errMsg = `<div class="step-err-msg" onclick="event.stopPropagation()">
        <div class="step-err-short">${esc(lines[0])}</div>${full}
      </div>`;
    }
    return `<div class="step ${ok ? 'step-ok' : 'step-err'}" style="padding-left:${16 + indent}px">
      <span class="step-icon">${ok ? '✓' : '✗'}</span>
      <span class="step-title">${esc(s.title)}</span>
      <span class="step-dur">${fmt(s.duration || 0)}</span>
    </div>${errMsg}${children}`;
  }).join('');
}

// ── Screenshots ──────────────────────────────────────────────────────────────
function screenshotSection(attachments) {
  const imgs = (attachments || []).filter(a => a.contentType?.startsWith('image/') && a.path);
  if (!imgs.length) return '';

  const thumbs = imgs.map((a, idx) => {
    const rel      = path.relative(path.dirname(OUT_HTML), a.path).replace(/\\/g, '/');
    const basename = path.basename(a.path, path.extname(a.path));
    let label = a.name || basename;
    if (/^test-finished/i.test(basename)) label = `Final state (${idx + 1})`;
    else if (/^test-failed/i.test(basename)) label = `❌ Failure shot (${idx + 1})`;
    else label = basename.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    let sizeKb = 0;
    try { sizeKb = Math.round(fs.statSync(a.path).size / 1024); } catch {}
    const blankWarning = sizeKb > 0 && sizeKb < 20
      ? `<span class="ss-blank">⚠ possibly blank (${sizeKb} KB)</span>`
      : `<span class="ss-size">${sizeKb > 0 ? sizeKb + ' KB' : ''}</span>`;

    return `<div class="ss-card">
      <a href="${esc(rel)}" target="_blank" title="Open full size — ${esc(label)}">
        <img src="${esc(rel)}" class="ss-thumb" alt="${esc(label)}" onerror="this.closest('.ss-card').style.display='none'"/>
      </a>
      <div class="ss-caption">${esc(label)}</div>
      ${blankWarning}
    </div>`;
  }).join('');

  return `<div class="ss-section"><div class="section-label">📸 Screenshots</div><div class="ss-grid">${thumbs}</div></div>`;
}

// ── Playwright traces ─────────────────────────────────────────────────────────
function traceSection(attachments) {
  const traces = (attachments || []).filter(a =>
    a.path && (a.contentType === 'application/zip' || a.path.endsWith('.zip'))
  );
  if (!traces.length) return '';

  const cards = traces.map((a, idx) => {
    const absPath = a.path.replace(/\\/g, '/');
    let sizeKb = 0;
    try { sizeKb = Math.round(fs.statSync(a.path).size / 1024); } catch {}
    return `<div class="trace-card">
      <div class="trace-icon">📦</div>
      <div class="trace-body">
        <div class="trace-label">Trace ${idx + 1}${sizeKb > 0 ? ' · ' + sizeKb + ' KB' : ''}</div>
        <div class="trace-path" title="${esc(absPath)}">${esc(absPath)}</div>
        <div class="trace-actions">
          <a class="trace-btn" href="https://trace.playwright.dev" target="_blank">Open Trace Viewer ↗</a>
          <button class="trace-copy" onclick="copyTracePath('${esc(absPath)}',this)">Copy path</button>
        </div>
        <div class="trace-hint">In Trace Viewer: drag-and-drop the .zip file, or paste the path above.</div>
      </div>
    </div>`;
  }).join('');

  return `<div class="section-label">🔍 Playwright Traces</div><div class="trace-list">${cards}</div>`;
}

// ── Videos ───────────────────────────────────────────────────────────────────
function videoSection(attachments) {
  const vids = (attachments || []).filter(a => a.contentType?.startsWith('video/') && a.path);
  if (!vids.length) return '';

  const cards = vids.map((a, idx) => {
    const rel = path.relative(path.dirname(OUT_HTML), a.path).replace(/\\/g, '/');
    let sizeKb = 0;
    try { sizeKb = Math.round(fs.statSync(a.path).size / 1024); } catch {}
    return `<div class="vid-card">
      <video class="vid-player" controls preload="metadata" src="${esc(rel)}">
        Your browser does not support video playback.
      </video>
      <div class="ss-caption">🎥 Recording ${idx + 1}${sizeKb > 0 ? ' · ' + sizeKb + ' KB' : ''}</div>
    </div>`;
  }).join('');

  return `<div class="ss-section"><div class="section-label">🎥 Video Recordings</div><div class="ss-grid">${cards}</div></div>`;
}

// ── Retry timeline ────────────────────────────────────────────────────────────
function retryTimeline(allResults) {
  if (!allResults || allResults.length < 2) return '';
  const icons = { passed:'✅', failed:'❌', timedOut:'⏱', skipped:'⏭' };
  const rows = allResults.map((r, i) => {
    const icon = icons[r.status] || '❓';
    const ts   = r.startTime ? new Date(r.startTime).toLocaleTimeString() : '';
    return `<div class="retry-row">
      <span class="retry-attempt">Attempt ${i + 1}</span>
      <span class="retry-status">${icon} ${esc(r.status)}</span>
      <span class="retry-dur">${fmt(r.duration || 0)}</span>
      ${ts ? `<span class="retry-ts">${esc(ts)}</span>` : ''}
    </div>`;
  }).join('');

  return `<div class="section-label">🔁 Retry History</div><div class="retry-timeline">${rows}</div>`;
}

// ── Slowest tests block ───────────────────────────────────────────────────────
function buildSlowestBlock() {
  const eligible = [...tests].filter(t => t.status !== 'skipped' && t.duration > 0);
  const ranked   = eligible.sort((a, b) => b.duration - a.duration).slice(0, 5);
  if (!ranked.length) return '';

  const avgMs     = eligible.length ? Math.round(eligible.reduce((s, t) => s + t.duration, 0) / eligible.length) : 0;
  const overCount = eligible.filter(t => t.duration >= slowMsFor(t.title)).length;

  const rows = ranked.map((t, i) => {
    // Bar is absolute: width = duration / threshold (capped at 100%)
    const tMs  = slowMsFor(t.title);
    const bar  = Math.min(100, Math.round((t.duration / tMs) * 100));
    const slow = t.duration >= tMs;
    const cls  = slow ? 'fail' : (statusClass[t.status] || 'skip');
    const badge = slow ? `<span class="slow-over-badge">⚠ exceeds ${fmt(tMs)} threshold</span>` : '';
    const td   = testData.find(d => d.title === t.title);
    const tid  = td ? td.id : -1;
    return `<tr class="slow-link-row" onclick="goToTest(${tid})" title="Jump to test">
      <td class="slow-rank">#${i + 1}</td>
      <td class="slow-title">${esc(t.title)}<span class="slow-file"> · ${esc(t.file)}</span>${badge}</td>
      <td class="slow-dur-cell">
        <div class="slow-bar-wrap"><div class="slow-bar ${cls}" style="width:${bar}%"></div></div>
        <span class="slow-dur ${slow ? 'slow-over' : ''}">${fmt(t.duration)}</span>
      </td>
    </tr>`;
  }).join('');

  const meta = `avg: ${fmt(avgMs)} &nbsp;·&nbsp; threshold: ${fmt(SLOW_MS)}${overCount > 0 ? ` &nbsp;·&nbsp; <span class="slow-over">${overCount} test${overCount !== 1 ? 's' : ''} over threshold</span>` : ''}`;

  return `
<div class="slowest-section">
  <div class="slowest-header">
    <span>🐢 Slowest Tests (top 5)</span>
    <span class="slowest-meta">${meta}</span>
  </div>
  <table class="slow-table"><tbody>${rows}</tbody></table>
</div>`;
}

// ── Failure detail panel ──────────────────────────────────────────────────────
const CAUSE_META = {
  app:    { label: 'Application Bug',   cls: 'cause-app',    icon: '🐛' },
  script: { label: 'Test Script Issue', cls: 'cause-script', icon: '📝' },
  env:    { label: 'Environment Issue', cls: 'cause-env',    icon: '🌐' },
};

function buildFailureDetail(t) {
  if (!t.error) return '';

  // ── Cause badge ────────────────────────────────────────────────────────────
  const cm = t.cause ? CAUSE_META[t.cause] : null;
  const causeBadge = cm
    ? `<span class="fd-cause ${cm.cls}">${cm.icon} ${cm.label}</span>`
    : '';

  // ── Assertion context (what was checked and where) ────────────────────────
  let assertionHtml = '';
  if (t.assertionCall || t.locator) {
    const assertLine = t.assertionCall
      ? `<div class="fd-assertion-call"><code>${esc(t.assertionCall)}</code></div>` : '';
    const locatorLine = t.locator
      ? `<div class="fd-locator-line"><span class="fd-locator-label">Locator:</span> <code>${esc(t.locator)}</code></div>` : '';
    assertionHtml = `<div class="fd-assertion-ctx">${assertLine}${locatorLine}</div>`;
  }

  // ── Expected / Actual diff ─────────────────────────────────────────────────
  // Annotate bare state words with human context
  function annotateVal(val, isExpected) {
    if (!val) return val;
    const lower = val.toLowerCase();
    const stateMap = {
      disabled: isExpected ? 'disabled (not interactable)' : 'enabled — element is interactive',
      enabled:  isExpected ? 'enabled (interactable)' : 'disabled — element is not interactable',
      visible:  isExpected ? 'visible in the DOM' : 'hidden or not in DOM',
      hidden:   isExpected ? 'hidden / not visible' : 'visible on the page',
      checked:  isExpected ? 'checked' : 'unchecked',
      unchecked:isExpected ? 'unchecked' : 'checked',
    };
    return stateMap[lower] || val;
  }

  let diffHtml = '';
  if (t.expected !== null || t.actual !== null) {
    const expVal = annotateVal(t.expected, true);
    const actVal = annotateVal(t.actual, false);
    const expBox = expVal != null
      ? `<div class="fd-diff-box fd-expected">
           <div class="fd-diff-label">✓ Expected</div>
           <div class="fd-diff-val">${esc(expVal)}</div>
         </div>` : '';
    const actBox = actVal != null
      ? `<div class="fd-diff-box fd-actual">
           <div class="fd-diff-label">✗ Received</div>
           <div class="fd-diff-val">${esc(actVal)}</div>
         </div>` : '';
    diffHtml = `<div class="fd-diff">${expBox}${actBox}</div>`;
  }

  // ── Error message (first meaningful lines, skip stack + duplicated assertion header) ──
  const errLines = t.error.split('\n')
    .filter(l => !/^\s{2,}at /.test(l) && !/^Call log\s*:/i.test(l))
    .slice(0, 5)
    .join('\n')
    .trim();
  const errBlock = `<div class="fd-section">
    <div class="fd-section-label">Error Message</div>
    <pre class="fd-error-msg">${esc(errLines)}</pre>
  </div>`;

  // ── Call log excerpt ────────────────────────────────────────────────────────
  const callLogBlock = t.callLog
    ? `<div class="fd-section fd-call-log">
        <div class="fd-section-label">Call Log</div>
        <pre class="fd-error-msg fd-call-log-pre">${esc(t.callLog)}</pre>
      </div>` : '';

  // ── Stack trace (collapsible) ──────────────────────────────────────────────
  const stackSrc = t.stackTrace;
  const stackBlock = stackSrc
    ? `<details class="fd-collapsible">
        <summary class="fd-collapsible-hdr">📋 Stack Trace</summary>
        <pre class="fd-stack">${esc(stackSrc)}</pre>
      </details>` : '';

  // ── Logs: stdout + stderr (collapsible) ────────────────────────────────────
  const logsText = [t.stdout, t.stderr].filter(Boolean).join('\n').trim();
  const logLines = logsText ? logsText.split('\n').length : 0;
  const logsBlock = logsText
    ? `<details class="fd-collapsible">
        <summary class="fd-collapsible-hdr">🪵 Logs <span class="fd-log-count">${logLines} lines</span></summary>
        <pre class="fd-logs">${esc(logsText)}</pre>
      </details>` : '';

  // ── Recommended action ──────────────────────────────────────────────────────
  const rec = buildRecommendation(t.error, t.cause);
  const ACTION_META = {
    dev: { icon: '🐛', label: 'Report to Developers', cls: 'rec-dev',
           btn: 'Copy Bug Report', btnIcon: '📋' },
    qa:  { icon: '🔧', label: 'Update Test Script',   cls: 'rec-qa',
           btn: 'Copy Error Details', btnIcon: '📋' },
    ops: { icon: '🌐', label: 'Check Environment',    cls: 'rec-ops',
           btn: 'Copy Error Details', btnIcon: '📋' },
  };
  let recBlock = '';
  if (rec) {
    const am = ACTION_META[rec.actionType] || ACTION_META.dev;
    // Encode error + recommendation into a copyable text blob (base64 to avoid quote escaping)
    const copyData = JSON.stringify({
      title:  t.title || '',
      error:  t.error || '',
      expected: t.expected || '',
      actual:   t.actual   || '',
      rec:    rec.title + '\n' + rec.body + '\n' + rec.detail,
    });
    const copyDataB64 = Buffer.from(copyData).toString('base64');
    recBlock = `
<div class="rec-panel ${am.cls}">
  <div class="rec-header">
    <span class="rec-icon">${am.icon}</span>
    <div class="rec-header-text">
      <div class="rec-label">Recommended Action</div>
      <div class="rec-type-badge">${am.label}</div>
    </div>
  </div>
  <div class="rec-body">${esc(rec.body)}</div>
  <div class="rec-detail">${esc(rec.detail)}</div>
  <div class="rec-actions">
    <button class="rec-btn rec-btn-copy" onclick="copyFailureDetails('${copyDataB64}', this)" title="Copy failure summary to clipboard">
      ${am.btnIcon} ${am.btn}
    </button>
    <button class="rec-btn rec-btn-mark" onclick="markOverride(this, 'dev')" data-override="">🐛 Dev Bug</button>
    <button class="rec-btn rec-btn-mark" onclick="markOverride(this, 'qa')"  data-override="">🔧 Script Issue</button>
    <button class="rec-btn rec-btn-mark" onclick="markOverride(this, 'ops')" data-override="">🌐 Env Issue</button>
  </div>
</div>`;
  }

  return `<div class="fd-panel">
    <div class="fd-panel-hdr">
      <span class="fd-panel-title">❌ Failure Details</span>
      ${causeBadge}
    </div>
    ${assertionHtml}
    ${diffHtml}
    ${errBlock}
    ${callLogBlock}
    ${stackBlock}
    ${logsBlock}
    ${recBlock}
  </div>`;
}

// ── Test rows ─────────────────────────────────────────────────────────────────
const groups = {};
for (const t of tests) (groups[t.file] = groups[t.file] || []).push(t);

let testId = 0;
const testData = [];

function testRow(t) {
  const id         = testId++;
  const isFlaky    = t.retry > 0 && t.status === 'passed';
  const cls        = isFlaky ? 'pass flaky-row' : (statusClass[t.status] || 'skip');
  const retryBadge = t.retry > 0 ? `<span class="retry-badge">🔁 ×${t.retry}</span>` : '';
  const icons      = { passed:'✅', failed:'❌', timedOut:'⏱', skipped:'⏭', unknown:'❓' };
  const icon       = isFlaky ? '⚠️' : (icons[t.status] || '❓');
  const stepsHtml  = stepRows(t.steps);

  // Inline error preview — visible on the row without expanding
  const errPreview = (t.status === 'failed' || t.status === 'timedOut') && t.error
    ? `<div class="err-preview">${esc(t.error.split('\n')[0].slice(0, 120))}${t.error.length > 120 ? '…' : ''}</div>`
    : '';

  const isSlow    = t.duration >= slowMsFor(t.title);
  const slowBadge = isSlow ? `<span class="slow-badge" title="Exceeds ${fmt(slowMsFor(t.title))} threshold">🐢</span>` : '';

  const errHtml    = buildFailureDetail(t);
  const ssHtml     = screenshotSection(t.attachments);
  const vidHtml    = videoSection(t.attachments);
  const traceHtml  = traceSection(t.attachments);
  const retryHtml  = retryTimeline(t.allResults);
  const tsHtml     = t.startTime
    ? `<div class="section-label">🕐 Started</div><div class="test-ts">${esc(new Date(t.startTime).toLocaleString())}</div>`
    : '';

  testData.push({ id, status: t.status, retry: t.retry, flaky: isFlaky, title: t.title, file: t.file });

  return `<tr class="test-row ${cls}" data-id="${id}" data-status="${t.status}" data-title="${esc(t.title.toLowerCase())}" data-file="${esc(t.file || '')}" data-flaky="${isFlaky}" onclick="toggleDetail(${id})">
      <td class="icon" aria-label="${t.status}">${icon}</td>
      <td class="title">
        ${esc(t.title)}${retryBadge}
        ${errPreview}
      </td>
      <td class="dur">${fmt(t.duration)}${slowBadge}</td>
    </tr>
    <tr class="detail-row" id="detail-${id}" style="display:none">
      <td colspan="3">
        <div class="detail-panel">
          ${errHtml}
          ${retryHtml}
          ${traceHtml}
          ${ssHtml}
          ${vidHtml}
          ${tsHtml}
          <div class="section-label">🪜 Steps</div>
          <div class="steps-wrap">${stepsHtml || '<span class="no-steps">No steps recorded</span>'}</div>
        </div>
      </td>
    </tr>`;
}

// ── File blocks ───────────────────────────────────────────────────────────────
function fileBlock(file, list) {
  const hasFail = list.some(t => t.status === 'failed' || t.status === 'timedOut');
  const ff  = list.filter(t => t.status === 'failed' || t.status === 'timedOut').length;
  const fp  = list.filter(t => t.status === 'passed').length;
  const fs_ = list.filter(t => t.status === 'skipped').length;
  const fk  = list.filter(t => t.retry > 0 && t.status === 'passed').length;
  const tags = [
    ff  > 0 ? `<span class="tag fail">${ff} failed</span>`   : '',
    fp  > 0 ? `<span class="tag pass">${fp} passed</span>`   : '',
    fs_ > 0 ? `<span class="tag skip">${fs_} skipped</span>` : '',
    fk  > 0 ? `<span class="tag flaky">${fk} flaky</span>`   : '',
  ].filter(Boolean).join('');

  const suiteGroups = {};
  for (const t of list) (suiteGroups[t.suite || ''] = suiteGroups[t.suite || ''] || []).push(t);

  const bodyRows = Object.entries(suiteGroups).map(([suite, tests]) => {
    const suiteHeader = suite
      ? `<tr class="suite-header-row"><td colspan="3"><span class="suite-name">▸ ${esc(suite)}</span></td></tr>`
      : '';
    return suiteHeader + tests.map(testRow).join('');
  }).join('');

  const fileDurMs  = list.reduce((s, t) => s + (t.duration || 0), 0);
  const fileDurStr = fileDurMs > 0 ? fmt(fileDurMs) : '';
  const fileCount  = list.length;

  return `<div class="file-block ${hasFail ? 'has-fail' : ''}" data-file="${esc(file)}">
    <div class="file-header" onclick="toggleFile(this)">
      <div class="file-header-left">
        <span class="file-name">📁 ${esc(file)}</span>
        <span class="file-sub">${fileCount} test${fileCount !== 1 ? 's' : ''}${fileDurStr ? ` &nbsp;·&nbsp; ${fileDurStr}` : ''}</span>
      </div>
      <span class="file-meta">${tags} <span class="caret">›</span></span>
    </div>
    <table class="test-table"><tbody>${bodyRows}</tbody></table>
  </div>`;
}

// Sort file blocks: failures first, then flaky, then passing, then all-skipped
const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => {
  const rank = list => {
    if (list.some(t => t.status === 'failed' || t.status === 'timedOut')) return 0;
    if (list.some(t => t.retry > 0 && t.status === 'passed'))            return 1;
    if (list.every(t => t.status === 'skipped'))                          return 3;
    return 2;
  };
  return rank(a) - rank(b);
});

// ── Category-grouped file blocks ──────────────────────────────────────────────
const fileCats = [
  { label: 'API',              icon: '⚡', prefix: 'api/'              },
  { label: 'UI · Auth',        icon: '🔐', prefix: 'UI/auth/'          },
  { label: 'UI · Marketplace', icon: '🏪', prefix: 'UI/marketplace/'   },
  { label: 'UI · Migration',   icon: '🔄', prefix: 'UI/migration/'     },
];
// ── Sidebar HTML ──────────────────────────────────────────────────────────────
const sidebarHtml = (() => {
  const used2 = new Set();
  const totalFiles = sortedGroups.length;
  let html = `<div class="sb-all sb-active" id="sb-all" onclick="sbClearSelect()"><span class="sb-all-icon">📋</span><span class="sb-all-label">All files</span><span class="sb-all-count">${totalFiles}</span></div><div class="sb-divider"></div>`;

  const FILE_LABELS = {
    // API
    'auth':                   'Auth',
    'list_templates':         'List Templates',
    'listing':                'Listing',
    'marketplace':            'Marketplace API',
    // UI · Auth
    'auth-pages':             'Auth Pages',
    'forgotpassword':         'Forgot Password',
    'login':                  'Login',
    'onboarding':             'Onboarding',
    'sign-out':               'Sign Out',
    'signout':                'Sign Out',
    'signup':                 'Sign Up',
    // UI · Marketplace
    'card-badges':            'Card Badges',
    'card-detail':            'Card Detail',
    'explore':                'Explore',
    'file-assist':            'File Assist',
    'filters':                'Filters',
    'landing-page':           'Landing Page',
    'my-projects':            'My Projects',
    'navigation-flows':       'Navigation Flows',
    'pagination':             'Pagination',
    'responsive':             'Responsive',
    'search-behavior':        'Search Behavior',
    'url-persistence':        'URL Persistence',
    'user-profile':           'User Profile',
    'wizard-step1':           'Wizard · Step 1',
    // UI · Migration
    'error-states':           'Error States',
    'integration-smoke':      'Integration Smoke',
    'migration':              'Migration',
    'validate':               'Validate',
    'wizard':                 'Wizard',
    'wizard-step3':           'Wizard · Step 3',
    'e2e_migration':          'E2E Migration',
    'e2e_migration_full':     'E2E Migration Full',
    'e2e-all-migrations':     'All Migrations',
    'e2e_all_migrations':     'All Migrations',
    // misc
    'api-connector-errors':   'Connector Errors',
    'file-upload-validation': 'File Upload',
    'e2e_square_shopify':     'Square → Shopify',
    'e2e_square_shopify_v2':  'Square → Shopify v2',
    'probe':                  'Probe',
    'shopify.setup':          'Shopify Setup',
    'shopifyLogin':           'Shopify Login',
  };

  const makeFileItem = (f, l) => {
    const hasFail = l.some(t => t.status === 'failed' || t.status === 'timedOut');
    const fp  = l.filter(t => t.status === 'passed').length;
    const ff  = l.filter(t => t.status === 'failed' || t.status === 'timedOut').length;
    const fn  = l.length;
    const pct = fn > 0 ? Math.round((fp / fn) * 100) : 0;
    const stem  = f.split('/').pop().replace(/\.spec\.[jt]s$/, '');
    const label = FILE_LABELS[stem] || stem.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const badge = hasFail
      ? `<span class="sb-badge fail">${ff}✗</span>`
      : `<span class="sb-badge pass">${fp}</span>`;
    const barCol = hasFail ? '#ef4444' : '#22c55e';
    return `<div class="sb-file" data-file="${esc(f)}" onclick="sbSelectFile('${esc(f)}', this)">
      <div class="sb-file-top"><span class="sb-file-name">${esc(label)}</span>${badge}</div>
      <div class="sb-file-bar"><div class="sb-file-bar-fill" style="width:${pct}%;background:${barCol}"></div></div>
    </div>`;
  };

  for (const cat of fileCats) {
    const grps = sortedGroups.filter(([f]) => f.startsWith(cat.prefix));
    if (!grps.length) continue;
    grps.forEach(([f]) => used2.add(f));
    const cFail = grps.reduce((s, [, l]) => s + l.filter(t => t.status === 'failed' || t.status === 'timedOut').length, 0);
    const failPart = cFail > 0 ? ` <span class="sb-fold-fail">${cFail}✗</span>` : '';
    const folderId = 'sbf-' + cat.prefix.replace(/\//g, '-').replace(/-$/, '');
    html += `<div class="sb-folder" id="${folderId}">
      <div class="sb-folder-hdr" onclick="sbToggleCat('${folderId}', this)">
        <span class="sb-caret">▶</span>
        <span class="sb-fold-icon">${cat.icon}</span>
        <span class="sb-fold-label">${cat.label}</span>
        <span class="sb-fold-count">${grps.length}${failPart}</span>
      </div>
      <div class="sb-folder-files">${grps.map(([f, l]) => makeFileItem(f, l)).join('')}</div>
    </div>`;
  }

  const other2 = sortedGroups.filter(([f]) => !used2.has(f));
  if (other2.length) {
    const cFail = other2.reduce((s, [, l]) => s + l.filter(t => t.status === 'failed' || t.status === 'timedOut').length, 0);
    const failPart = cFail > 0 ? ` <span class="sb-fold-fail">${cFail}✗</span>` : '';
    html += `<div class="sb-folder" id="sbf-other">
      <div class="sb-folder-hdr" onclick="sbToggleCat('sbf-other', this)">
        <span class="sb-caret">▶</span>
        <span class="sb-fold-icon">📄</span>
        <span class="sb-fold-label">Other</span>
        <span class="sb-fold-count">${other2.length}${failPart}</span>
      </div>
      <div class="sb-folder-files">${other2.map(([f, l]) => makeFileItem(f, l)).join('')}</div>
    </div>`;
  }
  return html;
})();

const fileBlocks = (() => {
  const used = new Set();
  const sections = fileCats.map(cat => {
    const grps = sortedGroups.filter(([f]) => f.startsWith(cat.prefix));
    if (!grps.length) return '';
    grps.forEach(([f]) => used.add(f));
    const allT  = grps.flatMap(([, l]) => l);
    const cPass = allT.filter(t => t.status === 'passed').length;
    const cFail = allT.filter(t => t.status === 'failed' || t.status === 'timedOut').length;
    const cTotal= allT.length;
    const failBit = cFail > 0 ? ` <span class="cat-sec-fail">${cFail} failed</span>` : '';
    const catId = 'cat-' + cat.prefix.replace(/\//g, '-').replace(/-$/, '');
    return `<div class="cat-sec" id="${catId}" data-cat-prefix="${esc(cat.prefix)}">
  <div class="cat-sec-hdr">
    <span class="cat-sec-icon">${cat.icon}</span>
    <span class="cat-sec-label">${cat.label}</span>
    <span class="cat-sec-stats">${grps.length} files &nbsp;·&nbsp; ${cTotal} tests &nbsp;·&nbsp; ${cPass} passed${failBit}</span>
  </div>
  ${grps.map(([f, l]) => fileBlock(f, l)).join('\n')}
</div>`;
  }).filter(Boolean);
  const other = sortedGroups.filter(([f]) => !used.has(f));
  if (other.length) sections.push(other.map(([f, l]) => fileBlock(f, l)).join(''));
  return sections.join('');
})();
const runAt      = new Date().toLocaleString();

// ── By Category block ─────────────────────────────────────────────────────────
function buildCategoryBlock() {
  const categories = [
    { label: 'API',              prefix: 'api/',              match: t => t.file.startsWith('api/') },
    { label: 'UI · Auth',        prefix: 'UI/auth/',          match: t => t.file.startsWith('UI/auth/') },
    { label: 'UI · Marketplace', prefix: 'UI/marketplace/',   match: t => t.file.startsWith('UI/marketplace/') },
    { label: 'UI · Migration',   prefix: 'UI/migration/',     match: t => t.file.startsWith('UI/migration/') },
  ];
  const rows = categories.map(cat => {
    const group   = tests.filter(cat.match);
    if (!group.length) return '';
    const p       = group.filter(t => t.status === 'passed').length;
    const f       = group.filter(t => t.status === 'failed' || t.status === 'timedOut').length;
    const n       = group.length;
    const pct     = Math.round((p / n) * 100);
    const eligible = group.filter(t => t.duration > 0);
    const totalMs = eligible.reduce((s, t) => s + t.duration, 0);
    const avgMs   = eligible.length ? Math.round(totalMs / eligible.length) : 0;
    const barCol  = pct >= 95 ? '#22c55e' : pct >= 80 ? '#f59e0b' : '#ef4444';
    const cntCol  = f > 0 ? '#ef4444' : '#94a3b8';
    return `<tr class="cat-row cat-link-row" onclick="goToCategory('${esc(cat.prefix)}')" title="Filter tests: ${esc(cat.label)}">
      <td class="cat-label">${esc(cat.label)}</td>
      <td class="cat-bar-cell"><div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%;background:${barCol}"></div></div></td>
      <td class="cat-pct">${pct}%</td>
      <td class="cat-count" style="color:${cntCol}">${p}/${n} tests</td>
      <td class="cat-avg">${fmt(avgMs)}</td>
      <td class="cat-total">${fmt(totalMs)}</td>
    </tr>`;
  }).filter(Boolean).join('');
  return `<div class="cat-block">
  <div class="cat-title">📂 By Category</div>
  <table class="cat-table">
    <thead><tr class="cat-head">
      <th class="cat-th cat-th-label">Category</th>
      <th class="cat-th cat-th-bar"></th>
      <th class="cat-th cat-th-pct">Pass %</th>
      <th class="cat-th cat-th-count">Tests</th>
      <th class="cat-th cat-th-avg">Avg</th>
      <th class="cat-th cat-th-total">Total Time</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ── Inventory section ─────────────────────────────────────────────────────────
function buildCatalogContent() {
  if (!inventory) return '<p style="padding:40px 32px;color:#475569;text-align:center">No inventory.json found — run the catalog script first.</p>';
  const entries   = (inventory.cards || []).map(c => [c.title, c.type]).sort(([a], [b]) => a.localeCompare(b));
  const fileBased = entries.filter(([, t]) => t === 'File Based').length;
  const api       = entries.filter(([, t]) => t === 'API').length;

  // Tag colour groups
  const tagGroup = t => {
    const v = t.toLowerCase();
    if (['ecommerce','shopify','amazon','bigcommerce','etsy','wix','prestashop','magento','adobe','open-source'].includes(v)) return 'ecom';
    if (['pos','retail','restaurant','clover','lightspeed','square','toast','touchbistro','vend','rseries','xseries','rtox','qbpos'].includes(v)) return 'pos';
    if (['accounting','bookkeeping','quickbooks','xero','freshbooks','csv','desktop','qbpos','billing','payments','subscriptions'].includes(v)) return 'acc';
    if (['crm','sales','salesforce','hubspot','dynamics','enterprise','contacts','deals','zoho'].includes(v)) return 'crm';
    if (['migration','file','file-based'].includes(v)) return 'mig';
    return 'other';
  };

  // Collect unique tags
  const allTags = new Set();
  entries.forEach(([title]) => { (catalogMeta[title]?.tags || []).forEach(t => allTags.add(t.toLowerCase())); });
  const tagList = [...allTags].sort();

  const rows = entries.map(([title, type]) => {
    const cls  = type === 'File Based' ? 'file' : 'api';
    const meta = catalogMeta[title] || {};
    const tags = (meta.tags || []).map(t =>
      `<span class="cat-tag tg-${tagGroup(t)}">${esc(t)}</span>`
    ).join('');
    const rawEntities = meta.entities || [];
    const entityStr = rawEntities.slice(0, 4).join(', ') + (rawEntities.length > 4 ? `<span class="inv-more">+${rawEntities.length - 4}</span>` : '');
    const pricing  = meta.pricing ? `<span class="cat-pricing cat-pricing-${esc(meta.pricing)}">${esc(meta.pricing)}</span>` : '';
    const tagStr   = (meta.tags || []).map(t => t.toLowerCase()).join(' ');
    return `<tr class="inv-row" data-type="${cls}" data-title="${esc(title.toLowerCase())} ${tagStr}">
      <td class="inv-name-cell"><div class="inv-name">${esc(title)}</div>${entityStr ? `<div class="inv-entities">${entityStr}</div>` : ''}</td>
      <td class="inv-type-cell"><span class="inv-type ${cls}">${type === 'File Based' ? 'File Based' : 'API'}</span>${pricing}</td>
      <td class="inv-tags-cell">${tags}</td>
    </tr>`;
  }).join('');

  // Group tags by category for the dropdown
  const tagGroups = [
    { label: 'Ecommerce',  cls: 'ecom',  tags: tagList.filter(t => tagGroup(t) === 'ecom')  },
    { label: 'POS & Retail', cls: 'pos', tags: tagList.filter(t => tagGroup(t) === 'pos')   },
    { label: 'Accounting', cls: 'acc',   tags: tagList.filter(t => tagGroup(t) === 'acc')   },
    { label: 'CRM & Sales',cls: 'crm',   tags: tagList.filter(t => tagGroup(t) === 'crm')   },
    { label: 'Migration',  cls: 'mig',   tags: tagList.filter(t => tagGroup(t) === 'mig')   },
    { label: 'Other',      cls: 'other', tags: tagList.filter(t => tagGroup(t) === 'other') },
  ].filter(g => g.tags.length > 0);

  const dropdownGroups = tagGroups.map(g => `
    <div class="tag-dd-group">
      <div class="tag-dd-group-label tg-${g.cls}">${g.label}</div>
      <div class="tag-dd-pills">
        ${g.tags.map(t => `<span class="inv-badge cat tg-${g.cls}" onclick="filterInvTag('${esc(t)}', this)">${esc(t)}</span>`).join('')}
      </div>
    </div>`).join('');

  return `
<div class="catalog-header">
  <div class="catalog-header-left">
    <span class="catalog-title">📋 Migration Templates Catalog</span>
    <span class="catalog-meta">${entries.length} templates &nbsp;·&nbsp; ${fileBased} File Based &nbsp;·&nbsp; ${api} API</span>
  </div>
  <input class="inv-search" type="text" placeholder="🔍  Search templates…" oninput="searchInv(this.value)"/>
</div>
<div class="inv-filter-wrap">
  <div class="inv-filter-row inv-filter-type">
    <span class="inv-filter-label">Type</span>
    <span class="inv-badge file active" onclick="filterInv('file', this)">📄 File Based <em>${fileBased}</em></span>
    <span class="inv-badge api"         onclick="filterInv('api',  this)">⚡ API <em>${api}</em></span>
    <span class="inv-badge all"         onclick="filterInv('all',  this)">All <em>${entries.length}</em></span>
    <div class="tag-dd-wrap" id="tag-dd-wrap">
      <button class="tag-dd-btn" id="tag-dd-btn" onclick="toggleTagDropdown()">
        <span id="tag-dd-label">Tags</span>
        <span class="tag-dd-arrow" id="tag-dd-arrow">▾</span>
      </button>
      <div class="tag-dd-panel" id="tag-dd-panel">
        <div class="tag-dd-inner">
          ${dropdownGroups}
        </div>
        <div class="tag-dd-footer">
          <button class="tag-dd-clear" onclick="clearTagFilter()">Clear filter</button>
        </div>
      </div>
    </div>
  </div>
</div>
<table class="inv-table">
  <thead><tr>
    <th class="inv-th">Template</th>
    <th class="inv-th">Type &amp; Pricing</th>
    <th class="inv-th inv-th-tags">Tags</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

// ── Compare tab ───────────────────────────────────────────────────────────────
function buildCompareTab() {
  const curr = { date: new Date().toISOString(), passed, failed, skipped, flaky, total, pct, duration: stats.duration || 0, branch: ctx.branch || '' };

  // ── Side-by-side comparison ─────────────────────────────────────────────────
  let comparisonHtml = '';
  if (!prevRun) {
    comparisonHtml = `<div class="cmp-empty">⚡ This is the first recorded run — no previous run to compare yet.<br>Run the tests again to see a before/after comparison.</div>`;
  } else {
    const fmtDate = iso => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
    const fmtDur  = ms  => ms ? fmt(ms) : '—';

    const delta = (curr, prev, higherIsBetter = true) => {
      const d = curr - prev;
      if (d === 0) return `<span class="cmp-same">↔ no change</span>`;
      const up = d > 0;
      const cls = (higherIsBetter ? up : !up) ? 'cmp-good' : 'cmp-bad';
      return `<span class="${cls}">${up ? '▲' : '▼'} ${up ? '+' : ''}${d}</span>`;
    };
    const deltaPct = (curr, prev) => {
      const d = curr - prev;
      if (d === 0) return `<span class="cmp-same">↔ no change</span>`;
      const up = d > 0;
      return `<span class="${up ? 'cmp-good' : 'cmp-bad'}">${up ? '▲ +' : '▼ '}${d}%</span>`;
    };
    const deltaDur = (curr, prev) => {
      if (!curr || !prev) return `<span class="cmp-same">—</span>`;
      const d = curr - prev;
      if (Math.abs(d) < 1000) return `<span class="cmp-same">↔ similar</span>`;
      const faster = d < 0;
      return `<span class="${faster ? 'cmp-good' : 'cmp-bad'}">${faster ? '▲ faster ' : '▼ slower '} ${fmt(Math.abs(d))}</span>`;
    };

    const rows = [
      ['Pass Rate',  `${prevRun.pct}%`,              `${pct}%`,              deltaPct(pct, prevRun.pct)],
      ['Passed',     prevRun.passed,                  passed,                 delta(passed,  prevRun.passed)],
      ['Failed',     prevRun.failed,                  failed,                 delta(failed,  prevRun.failed, false)],
      ['Flaky',      prevRun.flaky ?? '—',            flaky,                  delta(flaky,   prevRun.flaky  ?? 0, false)],
      ['Skipped',    prevRun.skipped,                 skipped,                delta(skipped, prevRun.skipped, false)],
      ['Total',      prevRun.total,                   total,                  delta(total,   prevRun.total)],
      ['Duration',   fmtDur(prevRun.duration),        fmtDur(curr.duration),  deltaDur(curr.duration, prevRun.duration)],
    ].map(([label, prev, cur, chg]) => `
      <tr class="cmp-row">
        <td class="cmp-label">${esc(String(label))}</td>
        <td class="cmp-prev-val">${esc(String(prev))}</td>
        <td class="cmp-arrow-cell">→</td>
        <td class="cmp-curr-val">${esc(String(cur))}</td>
        <td class="cmp-delta-cell">${chg}</td>
      </tr>`).join('');

    comparisonHtml = `
<div class="cmp-section">
  <div class="cmp-section-title">⚖️ Previous vs Current</div>
  <div class="cmp-run-meta">
    <div class="cmp-run-badge prev-badge">
      <span class="cmp-run-label">Previous</span>
      <span class="cmp-run-date">📅 ${esc(fmtDate(prevRun.date))}</span>
      ${prevRun.branch ? `<span class="cmp-run-branch">🌿 ${esc(prevRun.branch)}</span>` : ''}
    </div>
    <div class="cmp-run-badge curr-badge">
      <span class="cmp-run-label">Current</span>
      <span class="cmp-run-date">📅 ${esc(fmtDate(curr.date))}</span>
      ${curr.branch ? `<span class="cmp-run-branch">🌿 ${esc(curr.branch)}</span>` : ''}
    </div>
  </div>
  <table class="cmp-table">
    <thead><tr>
      <th class="cmp-label">Metric</th>
      <th class="cmp-prev-val">Previous</th>
      <th class="cmp-arrow-cell"></th>
      <th class="cmp-curr-val">Current</th>
      <th class="cmp-delta-cell">Change</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  // ── Run history table ───────────────────────────────────────────────────────
  const allRuns = [...historyRaw, curr];
  const histRows = [...allRuns].reverse().map((r, i) => {
    const isCurrent = i === 0;
    const d = new Date(r.date);
    const dateStr = d.toLocaleDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const barW    = Math.min(100, r.pct);
    const barCol  = r.pct >= 95 ? '#22c55e' : r.pct >= 80 ? '#f59e0b' : '#ef4444';
    const durStr  = r.duration ? fmt(r.duration) : '—';
    return `<tr class="hist-row${isCurrent ? ' hist-current' : ''}">
      <td class="hist-date">${esc(dateStr)}<span class="hist-time">${esc(timeStr)}</span></td>
      <td class="hist-branch">${r.branch ? `🌿 ${esc(r.branch)}` : '<span style="color:#475569">—</span>'}</td>
      <td class="hist-pct-cell">
        <div class="hist-bar-wrap"><div class="hist-bar" style="width:${barW}%;background:${barCol}"></div></div>
        <span class="hist-pct" style="color:${barCol}">${r.pct}%</span>
      </td>
      <td class="hist-num pass-num">${r.passed}</td>
      <td class="hist-num fail-num">${r.failed}</td>
      <td class="hist-num flaky-num">${r.flaky ?? 0}</td>
      <td class="hist-num skip-num">${r.skipped}</td>
      <td class="hist-num">${r.total}</td>
      <td class="hist-dur">${esc(durStr)}</td>
      ${isCurrent ? '<td class="hist-badge-cell"><span class="hist-current-badge">current</span></td>' : '<td></td>'}
    </tr>`;
  }).join('');

  return `
<div class="compare-wrap">
  ${comparisonHtml}
  <div class="cmp-section">
    <div class="cmp-section-title">📜 Run History (${allRuns.length} run${allRuns.length !== 1 ? 's' : ''})</div>
    <table class="hist-table">
      <thead><tr>
        <th>Date</th><th>Branch</th><th>Pass Rate</th>
        <th class="pass-num">✅</th><th class="fail-num">❌</th>
        <th class="flaky-num">⚠️</th><th class="skip-num">⏭</th>
        <th>Total</th><th>Duration</th><th></th>
      </tr></thead>
      <tbody>${histRows}</tbody>
    </table>
  </div>
</div>`;
}

// ── HTML ──────────────────────────────────────────────────────────────────────
const defaultTab = failed > 0 ? 'tests' : 'summary';
const catalogCount = inventory?.cards?.length ?? catalogRaw?.templates?.length ?? 0;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Test Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f1117;--bg-2:#1a1d27;--bg-3:#12141f;--bg-4:#1e2235;--bg-hover:#21253a;
  --border:#2d3148;--border-2:#1e2235;
  --text:#e2e8f0;--text-2:#cbd5e1;--text-3:#94a3b8;--text-4:#64748b;--text-5:#475569;
}
html.theme-light{
  --bg:#f1f5f9;--bg-2:#ffffff;--bg-3:#f8fafc;--bg-4:#e8edf5;--bg-hover:#dde3ee;
  --border:#cbd5e1;--border-2:#dde3ee;
  --text:#0f172a;--text-2:#1e293b;--text-3:#334155;--text-4:#64748b;--text-5:#94a3b8;
}
body{font-family:'Inter',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
/* Tabular numerals — prevents layout shift as counts change */
.stat .num,.cat-pct,.cat-count,.cat-avg,.cat-total,.cmp-val,.cmp-prev-val,.cmp-curr-val,
.run-stat,.file-sub,.sb-badge,.sb-fold-meta,.dur-num,em{font-variant-numeric:tabular-nums}
/* Monospace — code paths, error text, trace */
code,.err-preview,.trace-path,.ctx-item code,.inv-entities{font-family:'JetBrains Mono','Cascadia Code','Fira Code','Menlo','Consolas',monospace;font-size:.8em}

/* ── Tab nav ─────────────────────────────────────────────────────────────── */
.tab-nav{background:var(--bg-2);border-bottom:2px solid var(--border);display:flex;align-items:stretch;gap:0;flex-shrink:0;padding:0 20px}
.tab-btn{background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--text-4);font-size:.85rem;font-weight:600;padding:11px 20px;cursor:pointer;transition:all .15s;white-space:nowrap;display:flex;align-items:center;gap:6px;font-family:inherit}
.tab-btn:hover{color:var(--text-2);background:var(--bg-hover)}
.tab-btn.active{color:#38bdf8;border-bottom-color:#38bdf8}
.tab-badge{background:var(--border);color:var(--text-3);border-radius:10px;font-size:.65rem;padding:1px 7px;font-weight:700;line-height:1.4}
.tab-btn.active .tab-badge{background:#1e3a5f;color:#7dd3fc}
.tab-badge.fail-badge{background:#7f1d1d;color:#fca5a5}
.tab-pane{display:none;flex:1;overflow-y:auto;min-height:0}
.tab-pane.active{display:block}

/* Header */
.header{background:var(--bg-2);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-shrink:0}
.header h1{font-size:1.3rem;font-weight:700;color:var(--text);white-space:nowrap}
.run-at{font-size:.78rem;color:var(--text-4)}
.search-box{background:#12141f;border:1px solid #2d3148;border-radius:8px;padding:6px 12px;color:#e2e8f0;font-size:.82rem;width:220px;outline:none;transition:border-color .15s;font-family:inherit}
.search-box:focus{border-color:#38bdf8}
.search-box::placeholder{color:#475569}

/* ── Tests toolbar (sticky) ─────────────────────────────────────────────── */
.tests-toolbar{background:#0f1117;border-bottom:1px solid #2d3148;padding:10px 24px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0}
/* Window layout */
.tests-window{display:flex;height:calc(100vh - 170px);overflow:hidden}
.tests-sidebar{width:230px;flex-shrink:0;overflow-y:auto;border-right:1px solid #2d3148;background:#0f1117;padding:10px 10px 28px;display:flex;flex-direction:column}
.tests-panel{flex:1;overflow-y:auto;background:#0f1117}
/* Sidebar — All files row */
.sb-all{display:flex;align-items:center;gap:7px;padding:6px 10px;border-radius:6px;font-size:.75rem;font-weight:600;color:#94a3b8;cursor:pointer;margin-bottom:2px;transition:background .12s,color .12s}
.sb-all:hover,.sb-all.sb-active{background:#1e2a45;color:#7dd3fc}
.sb-all-icon{flex-shrink:0;font-size:.8rem}
.sb-all-label{flex:1}
.sb-all-count{background:#1e2235;color:#64748b;border-radius:9px;padding:0 7px;font-size:.65rem;font-weight:700;flex-shrink:0;line-height:18px;transition:background .12s,color .12s}
.sb-all.sb-active .sb-all-count{background:#1e3a5f;color:#7dd3fc}
/* Divider between All-files and folder list */
.sb-divider{height:1px;background:#1e2235;margin:6px 0 8px}
/* Folder structure */
.sb-folder{margin-bottom:2px}
.sb-folder-hdr{display:flex;align-items:center;gap:5px;padding:6px 10px 6px 8px;font-size:.73rem;font-weight:600;color:#64748b;cursor:pointer;border-radius:6px;transition:background .12s,color .12s;user-select:none;border-left:2px solid transparent}
.sb-folder-hdr:hover{background:#1a2035;color:#94a3b8}
.sb-folder.open>.sb-folder-hdr{background:#0d1929;color:#7dd3fc;border-left-color:#2563eb}
.sb-caret{font-size:.7rem;transition:transform .2s;flex-shrink:0;color:#475569;line-height:1;width:10px;text-align:center}
.sb-fold-icon{flex-shrink:0;font-size:.8rem;line-height:1}
.sb-fold-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-fold-count{background:#1e2235;color:#475569;border-radius:9px;padding:0 7px;font-size:.65rem;font-weight:700;flex-shrink:0;line-height:18px;transition:background .12s,color .12s}
.sb-folder.open>.sb-folder-hdr .sb-fold-count{background:#1e3a5f;color:#7dd3fc}
.sb-fold-fail{color:#f87171;font-weight:700;margin-left:2px}
.sb-folder-files{display:none;padding:3px 0 6px 0;margin-left:22px;border-left:1px solid #1e2a45}
/* File items */
.sb-file{display:flex;flex-direction:column;padding:5px 8px 5px 10px;font-size:.72rem;color:#64748b;cursor:pointer;border-radius:5px;transition:background .12s,color .12s;gap:4px}
.sb-file:hover{background:#1a2035}
.sb-file:hover .sb-file-name{color:#cbd5e1}
.sb-file.sb-active{background:#1e2a45}
.sb-file.sb-active .sb-file-name{color:#7dd3fc}
.sb-file-top{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}
.sb-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;color:#94a3b8;font-weight:500;transition:color .12s}
.sb-file-bar{height:2px;border-radius:1px;background:#1e2235;overflow:hidden;margin-top:1px}
.sb-file-bar-fill{height:100%;border-radius:1px;transition:width .3s}
.sb-badge{font-size:.6rem;font-weight:700;padding:0 6px;border-radius:9px;flex-shrink:0;white-space:nowrap;min-width:20px;text-align:center;line-height:17px}
.sb-badge.pass{background:#14532d;color:#86efac}
.sb-badge.fail{background:#7f1d1d;color:#fca5a5}
.toolbar-search{display:flex;align-items:center;gap:8px;flex:1;min-width:180px}
.toolbar-actions{display:flex;gap:6px;align-items:center;flex-shrink:0}

/* ── Summary tab ─────────────────────────────────────────────────────────── */
.summary-scroll{padding-bottom:40px;overflow-y:auto}
.summary-grid{display:flex;gap:16px;padding:0 32px 8px;flex-wrap:wrap}
.summary-grid > *{flex:1 1 320px;margin:0!important}
.cat-block{background:#1a1d27;border:1px solid #2d3148;border-radius:12px;padding:18px 24px;margin:0 32px 16px}
.cat-title{font-weight:700;font-size:.85rem;color:#cbd5e1;margin-bottom:12px}
.cat-table{width:100%;border-collapse:collapse}
.cat-head th{font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#475569;padding:4px 8px 8px;border-bottom:1px solid #2d3148}
.cat-th-label{width:160px;white-space:nowrap}.cat-th-bar{width:100%}.cat-th-pct,.cat-th-count,.cat-th-avg,.cat-th-total{text-align:right;white-space:nowrap;padding-left:12px}
.cat-link-row{cursor:pointer;transition:background .12s}
.cat-link-row:hover td{background:var(--bg-hover)}
.cat-row td{padding:6px 8px;vertical-align:middle}
.cat-label{color:#e2e8f0;font-size:.82rem;font-weight:600;width:160px;white-space:nowrap}
.cat-bar-cell{width:100%}
.cat-bar-wrap{background:#1e2235;border-radius:4px;height:8px;overflow:hidden}
.cat-bar{height:8px;border-radius:4px;transition:width .3s}
.cat-pct{color:#94a3b8;font-size:.78rem;text-align:right;white-space:nowrap;padding-left:10px;width:40px}
.cat-count{font-size:.78rem;text-align:right;white-space:nowrap;padding-left:12px;width:80px}
.cat-avg{color:#64748b;font-size:.75rem;text-align:right;white-space:nowrap;padding-left:12px;width:80px}
.cat-total{color:#38bdf8;font-size:.75rem;text-align:right;white-space:nowrap;padding-left:12px;width:90px}

/* ── Catalog tab ─────────────────────────────────────────────────────────── */
.catalog-wrap{padding:20px 32px 40px}
.catalog-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px}
.catalog-header-left{display:flex;flex-direction:column;gap:3px}
.catalog-title{font-weight:700;font-size:1rem;color:#cbd5e1}
.catalog-meta{font-size:.75rem;color:#64748b}

/* Context bar */
.context-bar{background:#12141f;border-bottom:1px solid #2d3148;padding:8px 32px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:.78rem;color:#94a3b8;min-height:36px}
.ctx-item{display:flex;align-items:center;gap:4px;color:#94a3b8}
.ctx-item strong{color:#cbd5e1;font-weight:600}
.ctx-item code{background:#1e2235;padding:1px 5px;border-radius:3px;color:#38bdf8;font-family:'JetBrains Mono','Cascadia Code','Fira Code','Menlo','Consolas',monospace;font-size:.76rem}
.ctx-item a{color:#38bdf8;text-decoration:none}.ctx-item a:hover{text-decoration:underline}
.ctx-sep{color:#2d3148;margin:0 4px;user-select:none}
.ctx-local{color:#475569;font-style:italic}

/* Release gate */
.release-gate{margin:16px 32px 0;border-radius:12px;padding:16px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border:2px solid transparent;flex-wrap:wrap}
.gate-safe    {background:#052e16;border-color:#16a34a}
.gate-review  {background:#2d1e00;border-color:#d97706}
.gate-blocked {background:#2d0a0a;border-color:#b91c1c}
.gate-incomplete{background:#1a1d27;border-color:#475569}
.gate-left{display:flex;align-items:center;gap:16px}
.gate-icon{font-size:2rem;line-height:1;flex-shrink:0}
.gate-text{display:flex;flex-direction:column;gap:3px}
.gate-verdict{font-size:1.1rem;font-weight:800;letter-spacing:.04em;color:#fff}
.gate-safe .gate-verdict    {color:#4ade80}
.gate-review .gate-verdict  {color:#fbbf24}
.gate-blocked .gate-verdict {color:#f87171}
.gate-incomplete .gate-verdict{color:#94a3b8}
.gate-reason{font-size:.85rem;color:#94a3b8}
.gate-detail{font-size:.78rem;color:#64748b;text-align:right;max-width:360px;line-height:1.5;flex-shrink:0}

/* Stats — display only on Summary, no interaction */
.stats{display:flex;gap:14px;padding:20px 32px 10px;flex-wrap:wrap}
.stat{background:#1a1d27;border:2px solid #2d3148;border-radius:12px;padding:16px 22px;min-width:140px;text-align:center;cursor:pointer;user-select:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;transition:transform .12s,box-shadow .12s}
.stat:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.4)}
.stat.dur{cursor:default}.stat.dur:hover{transform:none;box-shadow:none}
.stat.pass{border-color:#16a34a}
.stat.fail{border-color:#b91c1c}
.stat.skip{border-color:#92400e}
.stat.flaky-stat{border-color:#92400e}
.stat.retry{border-color:#5b21b6}
.stat .num{font-size:2rem;font-weight:800;line-height:1}
.stat .lbl{font-size:.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
.stat.pass .num{color:#22c55e}.stat.fail .num{color:#ef4444}
.stat.skip .num{color:#f59e0b}.stat.flaky-stat .num{color:#fb923c}
.stat.retry .num{color:#a78bfa}
.stat.dur .num{color:#38bdf8;font-size:1.6rem;white-space:nowrap}
.stat.dur{min-width:160px}
.stat.total .num{color:#38bdf8;font-size:2rem}

/* Filter chips — Tests tab toolbar */
.filter-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.fchip{background:#1a1d27;border:1px solid #2d3148;border-radius:16px;color:#94a3b8;font-size:.75rem;padding:4px 12px;cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
.fchip em{font-style:normal;font-weight:700;opacity:.85}
.fchip:hover{border-color:#38bdf8;color:#38bdf8}
.fchip.active{font-weight:700}
.fchip.all.active{background:#1e3a5f;border-color:#38bdf8;color:#7dd3fc}
.fchip.pass.active{background:#14532d;border-color:#22c55e;color:#86efac}
.fchip.fail.active{background:#7f1d1d;border-color:#ef4444;color:#fca5a5}
.fchip.flaky.active{background:#2d1e00;border-color:#f59e0b;color:#fb923c}
.fchip.skip.active{background:#422006;border-color:#f59e0b;color:#fcd34d}
.fchip.retry.active{background:#3b0764;border-color:#a78bfa;color:#c4b5fd}

/* Legend */
.legend{padding:4px 24px 4px;display:flex;gap:14px;flex-wrap:wrap;font-size:.72rem;color:#475569}
.legend-item{display:flex;align-items:center;gap:4px}

.progress-wrap{padding:0 32px 16px}
.progress-row{display:flex;align-items:center;gap:20px}
.progress-left{flex:1;min-width:0}
.progress-bar{height:7px;background:#2d3148;border-radius:4px;overflow:hidden}
.progress-fill{height:100%;border-radius:4px}
.progress-label{font-size:.78rem;color:#64748b;margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.count-warn{color:#fbbf24;font-weight:600}
.flaky-note{color:#fb923c}
.trend-up{color:#22c55e;font-weight:700}
.trend-down{color:#ef4444;font-weight:700}
.trend-flat{color:#64748b}

/* Sparkline */
.sparkline-wrap{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;cursor:default}
.sparkline{display:block;overflow:visible}
.sparkline-label{font-size:.65rem;color:#475569;text-align:center}

/* Flaky section */
.flaky-section{margin:0 32px 16px;background:#1e1800;border:1px solid #92400e;border-radius:10px;overflow:hidden}
.flaky-header{padding:12px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #92400e55}
.flaky-header span:first-child{font-weight:700;font-size:.88rem;color:#fbbf24}
.flaky-count{font-size:.78rem;color:#92400e}
.flaky-table{width:100%;border-collapse:collapse;font-size:.8rem}
.flaky-table tr{border-top:1px solid #2a2000}
.flaky-table tr:hover td{background:#261c00}
.flaky-table td{padding:8px 18px;color:#cbd5e1;vertical-align:middle}
.flaky-retries{color:#fb923c;font-weight:600;white-space:nowrap;width:100px}
.flaky-dur{color:#475569;white-space:nowrap;width:80px;text-align:right}
.flaky-title{color:#cbd5e1}

/* Slowest tests */
.slowest-section{margin:0 32px 16px;background:#1a1d27;border:1px solid #2d3148;border-radius:10px;overflow:hidden}
.slowest-header{padding:12px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2d3148}
.slowest-header span:first-child{font-weight:600;font-size:.88rem;color:#cbd5e1}
.slowest-meta{font-size:.75rem;color:#64748b}
.slow-table{width:100%;border-collapse:collapse;font-size:.8rem}
.slow-table tr{border-top:1px solid #1e2235}
.slow-link-row{cursor:pointer}
.slow-table tr:hover td{background:#21253a}
.slow-table td{padding:8px 18px;vertical-align:middle}
.slow-rank{color:#475569;width:36px;text-align:center;font-weight:700}
.slow-title{color:#cbd5e1}
.slow-file{color:#475569;font-size:.72rem}
.slow-over-badge{display:inline-block;margin-left:8px;font-size:.68rem;color:#fbbf24;background:#2d1e00;border:1px solid #92400e;border-radius:4px;padding:1px 6px;vertical-align:middle}
.slow-dur-cell{width:200px;white-space:nowrap}
.slow-bar-wrap{height:4px;background:#2d3148;border-radius:2px;margin-bottom:3px}
.slow-bar{height:4px;border-radius:2px;transition:width .3s}
.slow-bar.pass{background:#22c55e}.slow-bar.fail{background:#ef4444}.slow-bar.skip{background:#f59e0b}
.slow-dur{font-size:.72rem;color:#64748b}
.slow-over{color:#f87171;font-weight:600}
.slow-badge{margin-left:4px;font-size:.72rem;cursor:help}

/* Action buttons */
.action-btn{background:#1a1d27;border:1px solid #2d3148;border-radius:6px;color:#94a3b8;font-size:.75rem;padding:5px 12px;cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap}
.action-btn:hover{border-color:#38bdf8;color:#38bdf8}
.action-btn-jump{border-color:#ef444488;color:#f87171}
.action-btn-jump:hover{border-color:#ef4444;color:#ef4444;background:#2d0a0a}

.blocks{padding:12px 24px 40px;display:flex;flex-direction:column;gap:10px;min-height:100%}
/* Category sections */
.cat-sec{margin-bottom:20px}
.cat-sec-hdr{display:flex;align-items:center;gap:8px;padding:6px 4px 8px;border-bottom:2px solid #2d3148;margin-bottom:8px}
.cat-sec-icon{font-size:1rem;line-height:1}
.cat-sec-label{font-weight:700;font-size:.88rem;color:#e2e8f0}
.cat-sec-stats{font-size:.75rem;color:#64748b;margin-left:4px}
.cat-sec-fail{color:#ef4444;font-weight:600}
.cat-sec .file-block{margin-bottom:6px}
.cat-sec .file-block:last-child{margin-bottom:0}
/* File blocks */
.file-block{background:#1a1d27;border:1px solid #2d3148;border-radius:10px;overflow:hidden}
.file-block.has-fail{border-color:#ef444455;border-left:3px solid #ef4444}
.file-block.hidden{display:none}
.file-header{display:flex;justify-content:space-between;align-items:center;padding:11px 18px;cursor:pointer;user-select:none;gap:12px}
.file-header:hover{background:#21253a}
.file-header-left{display:flex;flex-direction:column;gap:2px;min-width:0}
.file-name{font-weight:600;font-size:.88rem;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file-sub{font-size:.7rem;color:#475569}
.file-meta{display:flex;gap:6px;align-items:center;font-size:.8rem;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0}
.caret{color:#94a3b8;font-size:1rem;font-weight:700;transition:transform .18s;display:inline-block;margin-left:4px}
.file-header.collapsed .caret{transform:rotate(90deg)}

.test-table{width:100%;border-collapse:collapse}
.test-table.hidden{display:none}
.test-row{cursor:pointer;transition:background .12s}
@keyframes test-flash{0%,100%{background:transparent}30%{background:#1e3a5f}}
.test-highlight{animation:test-flash 2s ease-out}
.test-row td{padding:7px 18px;font-size:.82rem;border-top:1px solid #1e2235;vertical-align:top}
.test-row:hover td{background:#21253a}
.test-row.fail{background:#ef444408;border-left:3px solid #ef444444}
.test-row.skip{opacity:.55}
.test-row.flaky-row{background:#2d1e0088}
.test-row.hidden{display:none}
.icon{width:28px;text-align:center;padding-top:9px!important}
.title{color:#cbd5e1}
.dur{text-align:right;color:#475569;white-space:nowrap;width:64px;padding-top:9px!important}
.retry-badge{display:inline-block;margin-left:8px;font-size:.7rem;background:#4c1d95;color:#c4b5fd;border-radius:4px;padding:1px 5px;vertical-align:middle}

/* Inline error preview */
.err-preview{font-size:.72rem;color:#f87171;margin-top:3px;font-family:'JetBrains Mono','Cascadia Code','Fira Code','Menlo','Consolas',monospace;word-break:break-all;line-height:1.4;opacity:.85}

/* Detail panel */
.detail-row td{padding:0 18px 12px 46px;border-top:none!important}
.detail-panel{background:#12141f;border:1px solid #2d3148;border-radius:8px;padding:14px;margin-top:4px}
.detail-err details summary{font-size:.78rem;color:#f87171;cursor:pointer;padding:2px 0 6px;font-weight:600}
.detail-err pre{font-size:.75rem;color:#f87171;white-space:pre-wrap;word-break:break-all;margin-bottom:10px;background:#1c1c2e;padding:8px;border-radius:6px}

/* ── Failure Detail Panel ──────────────────────────────────────────────────── */
.fd-panel{background:#130c0c;border:1px solid #ef444430;border-radius:8px;padding:14px 16px;margin-bottom:12px}
.fd-panel-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap}
.fd-panel-title{font-size:.8rem;font-weight:700;color:#f87171;letter-spacing:.02em}
/* Cause badge */
.fd-cause{font-size:.69rem;font-weight:700;padding:2px 10px;border-radius:10px;white-space:nowrap;border:1px solid transparent}
.cause-app   {background:#3d1515;color:#fca5a5;border-color:#ef444440}
.cause-script{background:#0f1e3a;color:#93c5fd;border-color:#3b82f640}
.cause-env   {background:#2d1f00;color:#fcd34d;border-color:#f59e0b40}
/* Assertion context block */
.fd-assertion-ctx{background:#0d111e;border:1px solid #1e2a45;border-radius:6px;padding:8px 12px;margin-bottom:10px}
.fd-assertion-call{font-size:.78rem;font-family:'JetBrains Mono','Cascadia Code','Fira Code','Menlo','Consolas',monospace;color:#93c5fd;font-weight:500;margin-bottom:4px}
.fd-assertion-call code{background:none;font-size:inherit;color:inherit}
.fd-locator-line{font-size:.72rem;color:#64748b}
.fd-locator-label{color:#475569;font-weight:600}
.fd-locator-line code{font-family:'JetBrains Mono','Cascadia Code','Fira Code','Menlo','Consolas',monospace;color:#7dd3fc;font-size:.72rem;background:none}
/* Call log */
.fd-call-log-pre{color:#94a3b8 !important;background:#0d111e !important;border-color:#1e2a45 !important}
/* Expected / Actual diff */
.fd-diff{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.fd-diff-box{border-radius:6px;padding:10px 12px}
.fd-expected{background:#051a0c;border:1px solid #16a34a40}
.fd-actual  {background:#1a0505;border:1px solid #ef444440}
.fd-diff-label{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}
.fd-expected .fd-diff-label{color:#4ade80}
.fd-actual   .fd-diff-label{color:#f87171}
.fd-diff-val{font-size:.78rem;font-family:'JetBrains Mono','Cascadia Code','Fira Code','Menlo','Consolas',monospace;color:#e2e8f0;word-break:break-all;line-height:1.5}
/* Error message */
.fd-section{margin-bottom:10px}
.fd-section-label{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#475569;margin-bottom:5px}
.fd-error-msg{margin:0;font-size:.74rem;font-family:'JetBrains Mono','Cascadia Code','Fira Code','Menlo','Consolas',monospace;color:#fca5a5;background:#1c0a0a;border:1px solid #ef444420;border-radius:5px;padding:9px 12px;white-space:pre-wrap;word-break:break-all;line-height:1.5}
/* Collapsibles */
.fd-collapsible{margin-top:8px;border:1px solid #2d3148;border-radius:6px;overflow:hidden}
.fd-collapsible>summary{padding:7px 12px;font-size:.74rem;font-weight:600;color:#94a3b8;cursor:pointer;background:#12141f;list-style:none;display:flex;align-items:center;gap:6px;user-select:none}
.fd-collapsible>summary:hover{background:#1a2035;color:#cbd5e1}
.fd-collapsible[open]>summary{background:#1a1d27;color:#e2e8f0;border-bottom:1px solid #2d3148}
.fd-stack,.fd-logs{margin:0;padding:12px;font-size:.71rem;font-family:'JetBrains Mono','Cascadia Code','Fira Code','Menlo','Consolas',monospace;color:#94a3b8;background:#0f1117;white-space:pre-wrap;word-break:break-all;max-height:280px;overflow-y:auto;line-height:1.5}
.fd-log-count{font-size:.62rem;font-weight:400;opacity:.6;margin-left:4px}
/* ── Recommended Action panel ─────────────────────────────────────────────── */
.rec-panel{margin-top:14px;border-radius:8px;padding:14px 16px;border:1px solid transparent}
.rec-dev {background:#0d1a0d;border-color:#16a34a25}
.rec-qa  {background:#0a0f1f;border-color:#3b82f625}
.rec-ops {background:#1a1400;border-color:#f59e0b25}
.rec-header{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
.rec-icon{font-size:1.2rem;line-height:1;flex-shrink:0;margin-top:1px}
.rec-header-text{display:flex;flex-direction:column;gap:3px}
.rec-label{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#475569}
.rec-type-badge{font-size:.78rem;font-weight:700}
.rec-dev  .rec-type-badge{color:#4ade80}
.rec-qa   .rec-type-badge{color:#93c5fd}
.rec-ops  .rec-type-badge{color:#fcd34d}
.rec-body{font-size:.8rem;font-weight:600;color:#e2e8f0;margin-bottom:6px;line-height:1.5}
.rec-detail{font-size:.75rem;color:#94a3b8;line-height:1.55;margin-bottom:12px}
.rec-actions{display:flex;gap:7px;flex-wrap:wrap}
.rec-btn{padding:5px 12px;border-radius:5px;font-size:.72rem;font-weight:600;cursor:pointer;border:1px solid transparent;transition:opacity .15s,transform .1s;line-height:1.4}
.rec-btn:hover{opacity:.85}
.rec-btn:active{transform:scale(.97)}
.rec-btn-copy{background:#1e3a5f;color:#93c5fd;border-color:#2563eb40}
.rec-btn-copy.copied{background:#14532d;color:#4ade80;border-color:#16a34a40}
.rec-btn-mark{background:#1e2235;color:#64748b;border-color:#2d3148}
.rec-btn-mark.active{background:#1e3a5f;color:#93c5fd;border-color:#3b82f650}

/* Retry timeline */
.retry-timeline{display:flex;flex-direction:column;gap:4px;margin-bottom:6px}
.retry-row{display:flex;align-items:center;gap:14px;font-size:.78rem;padding:4px 0;border-bottom:1px solid #1e2235}
.retry-row:last-child{border-bottom:none}
.retry-attempt{color:#64748b;width:70px;flex-shrink:0;font-weight:600}
.retry-status{color:#cbd5e1;width:90px;flex-shrink:0}
.retry-dur{color:#475569;width:60px}
.retry-ts{color:#475569;margin-left:auto;font-size:.72rem}

/* Per-test timestamp */
.test-ts{font-size:.78rem;color:#64748b;padding:2px 0 8px}

/* Steps */
.steps-wrap{display:flex;flex-direction:column;gap:3px}
.step{display:flex;align-items:baseline;gap:8px;padding:3px 0;font-size:.78rem}
.step-ok .step-icon{color:#22c55e;font-weight:700;flex-shrink:0}
.step-err .step-icon{color:#ef4444;font-weight:700;flex-shrink:0}
.step-title{color:#94a3b8;flex:1}
.step-err .step-title{color:#fca5a5}
.step-dur{color:#475569;white-space:nowrap;font-size:.72rem}
.no-steps{color:#475569;font-size:.78rem;font-style:italic}
.step-err-msg{padding:2px 0 2px 34px}
.step-err-short{font-size:.72rem;color:#f87171;word-break:break-all}
.step-err-detail summary{font-size:.68rem;color:#f59e0b;cursor:pointer;padding:2px 0}
.step-err-detail pre{font-size:.68rem;color:#f87171;background:#1c1c2e;padding:6px;border-radius:4px;white-space:pre-wrap;word-break:break-all;margin-top:3px}

/* Section labels */
.section-label{font-size:.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;padding:10px 0 5px;margin-top:4px;border-top:1px solid #2d3148}
.section-label:first-child{border-top:none;margin-top:0}

/* Tags */
.tag{border-radius:5px;padding:2px 8px;font-size:.72rem;font-weight:600}
.tag.pass{background:#14532d;color:#86efac}
.tag.fail{background:#7f1d1d;color:#fca5a5}
.tag.skip{background:#422006;color:#fcd34d}
.tag.flaky{background:#2d1e00;color:#fb923c;border:1px solid #92400e}

.no-results{text-align:center;padding:48px;color:#475569;font-size:.9rem}

/* Suite sub-header */
.suite-header-row td{padding:8px 18px 4px;background:#12141f;border-top:1px solid #2d3148}
.suite-name{font-size:.75rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:.06em}

/* Screenshots */
.ss-section{margin-bottom:6px}
.ss-grid{display:flex;flex-wrap:wrap;gap:10px;padding:6px 0 4px}
.ss-card{display:flex;flex-direction:column;align-items:center;gap:5px;max-width:190px}
.ss-thumb{width:180px;height:110px;object-fit:cover;border-radius:6px;border:1px solid #2d3148;cursor:zoom-in;transition:transform .15s}
.ss-thumb:hover{transform:scale(1.04);border-color:#38bdf8}
.ss-caption{font-size:.72rem;color:#94a3b8;text-align:center;word-break:break-word;max-width:180px;line-height:1.3}
.ss-blank{font-size:.68rem;color:#f59e0b;background:#422006;border-radius:4px;padding:1px 6px;white-space:nowrap}
.ss-size{font-size:.68rem;color:#475569}

/* Video */
.vid-card{display:flex;flex-direction:column;align-items:center;gap:5px;max-width:320px}
.vid-player{width:300px;border-radius:6px;border:1px solid #2d3148;background:#000}

/* Trace files */
.trace-list{display:flex;flex-direction:column;gap:8px;margin-bottom:6px}
.trace-card{display:flex;gap:12px;background:#0f1117;border:1px solid #2d3148;border-radius:8px;padding:10px 14px;align-items:flex-start}
.trace-icon{font-size:1.4rem;flex-shrink:0;margin-top:2px}
.trace-body{flex:1;min-width:0}
.trace-label{font-size:.78rem;font-weight:600;color:#cbd5e1;margin-bottom:3px}
.trace-path{font-size:.7rem;color:#475569;font-family:'JetBrains Mono','Cascadia Code','Fira Code','Menlo','Consolas',monospace;word-break:break-all;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trace-path:hover{white-space:normal}
.trace-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.trace-btn{font-size:.73rem;color:#38bdf8;background:#0c1a2e;border:1px solid #1e40af;border-radius:5px;padding:3px 10px;text-decoration:none;transition:all .15s;white-space:nowrap}
.trace-btn:hover{background:#1e3a5f;border-color:#38bdf8}
.trace-copy{font-size:.73rem;color:#94a3b8;background:#1a1d27;border:1px solid #2d3148;border-radius:5px;padding:3px 10px;cursor:pointer;transition:all .15s;white-space:nowrap}
.trace-copy:hover{border-color:#38bdf8;color:#38bdf8}
.trace-hint{font-size:.68rem;color:#475569;margin-top:5px;font-style:italic}

/* Inventory */
.inventory-section{margin:0 32px 20px;background:#1a1d27;border:1px solid #2d3148;border-radius:10px;overflow:hidden}
.inventory-header{display:flex;justify-content:space-between;align-items:center;padding:13px 18px;cursor:pointer;user-select:none}
.inventory-header:hover{background:#21253a}
.inventory-title{font-weight:600;font-size:.88rem;color:#cbd5e1}
.inventory-meta{font-size:.78rem;color:#64748b}
.inventory-body{padding:0 0 8px}
/* ── Catalog filters ──────────────────────────────────────────────────────── */
.inv-filter-wrap{background:#12141f;border:1px solid #1e2235;border-radius:10px;margin-bottom:14px;overflow:visible}
.inv-filter-row{display:flex;align-items:center;gap:6px;padding:8px 14px;flex-wrap:wrap}
.inv-filter-label{font-size:.68rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-right:4px;white-space:nowrap}
.inv-badge{cursor:pointer;border-radius:5px;padding:2px 9px;font-size:.71rem;font-weight:600;border:1px solid transparent;transition:all .15s;display:inline-flex;align-items:center;gap:4px}
.inv-badge em{font-style:normal;opacity:.7;font-weight:400}
.inv-badge.file{background:#1e3a5f;color:#7dd3fc;border-color:#1e40af}
.inv-badge.api{background:#3b2f6e;color:#c4b5fd;border-color:#4c1d95}
.inv-badge.all{background:#1a2035;color:#94a3b8;border-color:#2d3148}
.inv-badge:hover{filter:brightness(1.2)}
.inv-badge.file.active{background:#1e4a80;color:#bae6fd;border-color:#38bdf8;box-shadow:0 0 0 2px #38bdf840}
.inv-badge.api.active{background:#4c2090;color:#e9d5ff;border-color:#a78bfa;box-shadow:0 0 0 2px #a78bfa40}
.inv-badge.all.active{background:#243050;color:#cbd5e1;border-color:#64748b;box-shadow:0 0 0 2px #64748b40}
.inv-search{background:#12141f;border:1px solid #2d3148;border-radius:7px;padding:5px 12px;color:#e2e8f0;font-size:.78rem;outline:none;width:220px;transition:border-color .15s}
.inv-search:focus{border-color:#38bdf8}
.inv-search::placeholder{color:#475569}
/* ── Tags dropdown ─────────────────────────────────────────────────────────── */
.tag-dd-wrap{position:relative;margin-left:6px}
.tag-dd-btn{display:inline-flex;align-items:center;gap:6px;background:#1a2035;color:#94a3b8;border:1px solid #2d3148;border-radius:6px;padding:3px 10px;font-size:.75rem;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
.tag-dd-btn:hover,.tag-dd-btn.open{background:#1e2a45;color:#e2e8f0;border-color:#38bdf8}
.tag-dd-btn.has-active{background:#1e3a5f;color:#7dd3fc;border-color:#38bdf8}
.tag-dd-arrow{font-size:.65rem;transition:transform .2s}
.tag-dd-btn.open .tag-dd-arrow{transform:rotate(180deg)}
.tag-dd-panel{display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:100;background:#0a0d14;border:1px solid #2d3148;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.6);min-width:480px;max-width:600px}
.tag-dd-panel.open{display:block}
.tag-dd-inner{padding:16px;display:flex;flex-direction:column;gap:14px}
.tag-dd-group{}
.tag-dd-group-label{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;padding:1px 6px;border-radius:3px;display:inline-block}
.tag-dd-group-label.tg-ecom{color:#7dd3fc;background:#0c2a4a}
.tag-dd-group-label.tg-pos{color:#86efac;background:#052e16}
.tag-dd-group-label.tg-acc{color:#fcd34d;background:#2d1b00}
.tag-dd-group-label.tg-crm{color:#d8b4fe;background:#2e1065}
.tag-dd-group-label.tg-mig{color:#94a3b8;background:#252e45}
.tag-dd-group-label.tg-other{color:#64748b;background:#1e2638}
.tag-dd-pills{display:flex;flex-wrap:wrap;gap:5px}
.tag-dd-footer{border-top:1px solid #2d3148;padding:8px 16px;display:flex;justify-content:flex-end}
.tag-dd-clear{background:none;border:1px solid #2d3148;border-radius:5px;color:#64748b;font-size:.71rem;padding:3px 10px;cursor:pointer;transition:all .15s}
.tag-dd-clear:hover{border-color:#94a3b8;color:#cbd5e1}
/* ── Catalog table ──────────────────────────────────────────────────────────── */
.inv-table{width:100%;border-collapse:collapse;font-size:.8rem}
.inv-th{padding:7px 16px;font-size:.68rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #2d3148;background:#12141f;text-align:left}
.inv-th-tags{text-align:right}
.inv-table tbody tr{border-top:1px solid #1a1d2a}
.inv-table tbody tr:hover td{background:#1e2235}
.inv-table td{padding:8px 16px;color:#cbd5e1;vertical-align:middle}
.inv-name-cell{max-width:300px}
.inv-name{font-weight:500;color:#e2e8f0}
.inv-entities{font-size:.68rem;color:#64748b;margin-top:3px}
.inv-more{background:#1e2235;color:#64748b;border-radius:3px;padding:0 4px;font-size:.6rem;margin-left:3px}
.inv-type-cell{white-space:nowrap;width:160px}
.inv-type{border-radius:4px;padding:2px 8px;font-size:.69rem;font-weight:700}
.inv-type.file{background:#1e3a5f;color:#7dd3fc}
.inv-type.api{background:#3b2f6e;color:#c4b5fd}
.inv-tags-cell{text-align:right;white-space:normal;max-width:340px}
.inv-row.hidden{display:none}
/* ── Pricing badges ─────────────────────────────────────────────────────────── */
.cat-pricing{border-radius:4px;padding:2px 7px;font-size:.65rem;font-weight:700;margin-left:5px;vertical-align:middle}
.cat-pricing-free{background:#14532d;color:#86efac}
.cat-pricing-paid{background:#1e3a5f;color:#7dd3fc}
.cat-pricing-one-time{background:#1c3050;color:#93c5fd}
.cat-pricing-subscription{background:#2e1065;color:#d8b4fe}
.cat-pricing-custom{background:#431407;color:#fdba74}
/* ── Tag colour groups ──────────────────────────────────────────────────────── */
.cat-tag{display:inline-block;border-radius:4px;padding:2px 8px;font-size:.72rem;font-weight:600;margin:2px 2px;border:1px solid transparent}
.cat-tag.tg-ecom,.inv-badge.cat.tg-ecom{background:#0f3460;color:#7dd3fc;border-color:#1e4f8c}
.cat-tag.tg-pos,.inv-badge.cat.tg-pos{background:#064e24;color:#86efac;border-color:#166534}
.cat-tag.tg-acc,.inv-badge.cat.tg-acc{background:#3d2400;color:#fcd34d;border-color:#92400e}
.cat-tag.tg-crm,.inv-badge.cat.tg-crm{background:#3b0f85;color:#d8b4fe;border-color:#5b21b6}
.cat-tag.tg-mig,.inv-badge.cat.tg-mig{background:#252e45;color:#94a3b8;border-color:#3d4a6a}
.cat-tag.tg-other,.inv-badge.cat.tg-other{background:#1e2638;color:#64748b;border-color:#334155}
.inv-badge.cat.active{filter:brightness(1.5);border-color:currentColor;box-shadow:0 0 0 2px currentColor;outline:none}

/* ── Compare tab ─────────────────────────────────────────────────────────── */
.compare-wrap{padding:20px 32px 40px;display:flex;flex-direction:column;gap:24px}
.cmp-section{background:#1a1d27;border:1px solid #2d3148;border-radius:12px;overflow:hidden}
.cmp-section-title{padding:14px 20px;font-weight:700;font-size:.9rem;color:#cbd5e1;border-bottom:1px solid #2d3148;background:#12141f}
.cmp-empty{padding:40px;text-align:center;color:#475569;font-size:.88rem;line-height:1.8}
.cmp-run-meta{display:flex;gap:12px;padding:14px 20px 8px;flex-wrap:wrap}
.cmp-run-badge{display:flex;flex-direction:column;gap:3px;padding:10px 16px;border-radius:8px;border:1px solid #2d3148;min-width:200px;flex:1}
.prev-badge{background:#12141f;border-color:#2d3148}
.curr-badge{background:#0c1a2e;border-color:#1e40af}
.cmp-run-label{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#475569}
.curr-badge .cmp-run-label{color:#3b82f6}
.cmp-run-date{font-size:.82rem;color:#cbd5e1;font-weight:600}
.cmp-run-branch{font-size:.75rem;color:#64748b}
.cmp-table{width:100%;border-collapse:collapse;font-size:.82rem}
.cmp-table thead tr{background:#12141f;border-bottom:1px solid #2d3148}
.cmp-table thead th{padding:8px 16px;text-align:left;font-size:.7rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em}
.cmp-row{border-top:1px solid #1e2235;transition:background .12s}
.cmp-row:hover td{background:#21253a}
.cmp-label{padding:10px 16px;color:#94a3b8;font-weight:600;width:110px}
.cmp-prev-val{padding:10px 16px;color:#64748b;text-align:right;width:100px}
.cmp-arrow-cell{padding:10px 8px;color:#2d3148;text-align:center;width:24px}
.cmp-curr-val{padding:10px 16px;color:#e2e8f0;font-weight:700;width:100px}
.cmp-delta-cell{padding:10px 16px;width:140px}
.cmp-good{color:#22c55e;font-weight:700}
.cmp-bad{color:#ef4444;font-weight:700}
.cmp-same{color:#475569}
/* History table */
.hist-table{width:100%;border-collapse:collapse;font-size:.8rem}
.hist-table thead tr{background:#12141f;border-bottom:1px solid #2d3148}
.hist-table thead th{padding:8px 16px;text-align:left;font-size:.7rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.hist-row{border-top:1px solid #1e2235;transition:background .12s}
.hist-row:hover td{background:#21253a}
.hist-current{background:#0c1a2e}
.hist-current:hover td{background:#0e2040}
.hist-date{padding:9px 16px;color:#cbd5e1;white-space:nowrap;font-weight:600}
.hist-time{display:block;font-size:.68rem;color:#475569;font-weight:400;margin-top:1px}
.hist-branch{padding:9px 16px;color:#64748b;font-size:.78rem;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}
.hist-pct-cell{padding:9px 16px;width:140px}
.hist-bar-wrap{height:4px;background:#2d3148;border-radius:2px;margin-bottom:4px;width:80px}
.hist-bar{height:4px;border-radius:2px}
.hist-pct{font-size:.78rem;font-weight:700}
.hist-num{padding:9px 10px;text-align:center;font-weight:600;white-space:nowrap}
.hist-dur{padding:9px 16px;color:#64748b;white-space:nowrap;font-size:.78rem}
.pass-num{color:#22c55e}.fail-num{color:#ef4444}.flaky-num{color:#fb923c}.skip-num{color:#f59e0b}
.hist-badge-cell{padding:9px 16px}
.hist-current-badge{background:#1e3a5f;color:#7dd3fc;border:1px solid #1e40af;border-radius:10px;font-size:.65rem;font-weight:700;padding:2px 8px}

/* ── Theme toggle button ─────────────────────────────────────────────────── */
.theme-dd-wrap{position:relative}
.theme-btn{display:inline-flex;align-items:center;gap:6px;background:var(--bg-4);color:var(--text-3);border:1px solid var(--border);border-radius:7px;padding:5px 11px;font-size:.75rem;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit}
.theme-btn:hover{border-color:var(--text-3);color:var(--text)}
.theme-btn .theme-arrow{font-size:.6rem;opacity:.7}
.theme-dd-panel{display:none;position:absolute;top:calc(100% + 6px);right:0;z-index:200;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,.4);overflow:hidden;min-width:140px}
.theme-dd-panel.open{display:block}
.theme-opt{display:flex;align-items:center;gap:8px;padding:9px 14px;font-size:.78rem;color:var(--text-3);cursor:pointer;transition:background .12s}
.theme-opt:hover{background:var(--bg-hover);color:var(--text)}
.theme-opt.active{color:#38bdf8;background:var(--bg-4)}
.theme-opt .theme-opt-icon{width:16px;text-align:center}

/* ── Light theme structural overrides ───────────────────────────────────── */
/* Page regions */
html.theme-light .summary-wrap,
html.theme-light .blocks,
html.theme-light .catalog-wrap,
html.theme-light .compare-wrap{background:var(--bg)}
/* Cards & blocks */
html.theme-light .file-block,
html.theme-light .flaky-section,
html.theme-light .slowest-section,
html.theme-light .cat-block,
html.theme-light .cmp-section,
html.theme-light .sparkline-wrap{background:var(--bg-2);border-color:var(--border)}
html.theme-light .context-bar{background:var(--bg-3);border-color:var(--border);color:var(--text-3)}
html.theme-light .ctx-item{color:var(--text-3)}
html.theme-light .ctx-item strong{color:var(--text-2)}
html.theme-light .ctx-sep{color:var(--border)}
html.theme-light .ctx-local{color:var(--text-4)}
/* Stat cards */
html.theme-light .stat{background:var(--bg-2)}
html.theme-light .stat .lbl{color:var(--text-4)}
/* Release gate */
html.theme-light .gate-safe    {background:#f0fdf4;border-color:#16a34a}
html.theme-light .gate-review  {background:#fffbeb;border-color:#d97706}
html.theme-light .gate-blocked {background:#fff1f2;border-color:#b91c1c}
html.theme-light .gate-incomplete{background:var(--bg-3);border-color:var(--border)}
html.theme-light .gate-safe .gate-verdict    {color:#15803d}
html.theme-light .gate-review .gate-verdict  {color:#b45309}
html.theme-light .gate-blocked .gate-verdict {color:#b91c1c}
html.theme-light .gate-incomplete .gate-verdict{color:var(--text-3)}
html.theme-light .gate-reason{color:var(--text-3)}
html.theme-light .gate-detail{color:var(--text-4)}
/* By Category block */
html.theme-light .cat-title{color:var(--text-2)}
html.theme-light .cat-label{color:var(--text)}
html.theme-light .cat-head th{color:var(--text-4);border-color:var(--border)}
html.theme-light .cat-pct,html.theme-light .cat-avg{color:var(--text-4)}
html.theme-light .cat-total{color:#0284c7}
html.theme-light .cat-bar-wrap{background:var(--bg-4)}
/* Progress */
html.theme-light .progress-bar{background:var(--bg-4)}
html.theme-light .progress-label{color:var(--text-4)}
html.theme-light .legend{color:var(--text-4)}
/* Sparkline */
html.theme-light .sparkline-bar-wrap{background:var(--bg-4)}
html.theme-light .sparkline-label{color:var(--text-5)}
/* Slowest / Flaky headers */
html.theme-light .slowest-header span:first-child{color:var(--text-2)}
html.theme-light .slowest-header,html.theme-light .flaky-header{border-color:var(--border)}
/* Test list toolbar */
html.theme-light .search-box{background:var(--bg-3);border-color:var(--border);color:var(--text)}
html.theme-light .search-box::placeholder{color:var(--text-5)}
html.theme-light .action-btn{background:var(--bg-3);border-color:var(--border);color:var(--text-3)}
html.theme-light .action-btn:hover{background:var(--bg-hover);color:var(--text)}
html.theme-light .fchip{background:var(--bg-3);border-color:var(--border);color:var(--text-3)}
html.theme-light .fchip.all.active  {background:#dbeafe;color:#1d4ed8;border-color:#60a5fa}
html.theme-light .fchip.pass.active {background:#dcfce7;color:#166534;border-color:#4ade80}
html.theme-light .fchip.fail.active {background:#fee2e2;color:#991b1b;border-color:#f87171}
html.theme-light .fchip.flaky.active{background:#fef3c7;color:#92400e;border-color:#fbbf24}
html.theme-light .fchip.skip.active {background:#fef9c3;color:#854d0e;border-color:#fde047}
html.theme-light .fchip.retry.active{background:#f3e8ff;color:#6b21a8;border-color:#c084fc}
/* File blocks */
/* Tests window & sidebar */
html.theme-light .tests-window{border-top:1px solid var(--border)}
html.theme-light .tests-sidebar{background:var(--bg-3);border-color:var(--border)}
html.theme-light .tests-panel{background:var(--bg)}
html.theme-light .sb-all{color:var(--text-3)}
html.theme-light .sb-all:hover,html.theme-light .sb-all.sb-active{background:#dbeafe;color:#1d4ed8}
html.theme-light .sb-all-count{background:var(--bg-4);color:var(--text-4)}
html.theme-light .sb-all.sb-active .sb-all-count{background:#bfdbfe;color:#1d4ed8}
html.theme-light .sb-folder-hdr{color:var(--text-5)}
html.theme-light .sb-folder-hdr:hover{background:var(--bg-hover);color:var(--text-3)}
html.theme-light .sb-folder.open>.sb-folder-hdr{background:#eff6ff;color:#1d4ed8;border-left-color:#3b82f6}
html.theme-light .sb-fold-count{background:var(--bg-4);color:var(--text-4)}
html.theme-light .sb-folder.open>.sb-folder-hdr .sb-fold-count{background:#bfdbfe;color:#1d4ed8}
html.theme-light .sb-caret{color:var(--text-5)}
html.theme-light .sb-divider{background:var(--border)}
html.theme-light .sb-folder-files{border-left-color:var(--border)}
html.theme-light .sb-file-name{color:var(--text-3)}
html.theme-light .sb-file:hover .sb-file-name{color:var(--text-2)}
html.theme-light .sb-file.sb-active .sb-file-name{color:#1d4ed8}
html.theme-light .sb-file:hover{background:var(--bg-hover)}
html.theme-light .sb-file.sb-active{background:#dbeafe}
html.theme-light .sb-file-bar{background:#e2e8f0}
html.theme-light .sb-badge.pass{background:#dcfce7;color:#166534}
html.theme-light .sb-badge.fail{background:#fee2e2;color:#991b1b}
html.theme-light .tests-toolbar{background:var(--bg-3);border-color:var(--border)}
html.theme-light .cat-sec-hdr{border-color:var(--border)}
html.theme-light .cat-sec-label{color:var(--text)}
html.theme-light .cat-sec-stats{color:var(--text-4)}
html.theme-light .file-header:hover{background:var(--bg-hover)}
html.theme-light .file-name{color:var(--text-2)}
html.theme-light .file-sub{color:var(--text-4)}
html.theme-light .caret{color:var(--text-3)}
html.theme-light .caret{color:var(--text-4)}
html.theme-light .test-file{background:var(--bg-3);border-color:var(--border);color:var(--text-4)}
html.theme-light .suite-header-row td{background:var(--bg-3);border-color:var(--border-2)}
html.theme-light .suite-name{color:#0ea5e9}
/* Test rows */
html.theme-light .test-row td{color:var(--text-2);border-color:var(--border-2)}
html.theme-light .test-row:hover td{background:var(--bg-hover)}
html.theme-light .test-row.fail{background:#fef2f2;border-left-color:#ef4444}
html.theme-light .test-row.flaky-row{background:#fffbeb}
html.theme-light .section-label{color:var(--text-4);border-color:var(--border)}
html.theme-light .flaky-count{color:#92400e}
html.theme-light .err-preview{color:#b91c1c}
html.theme-light .step-err-detail pre{background:var(--bg-4);color:#b91c1c}
html.theme-light .step-err-detail summary{color:#d97706}
html.theme-light .step-err-short{color:#b91c1c}
html.theme-light .title{color:var(--text-2)}
html.theme-light .dur{color:var(--text-4)}
html.theme-light .test-ts{color:var(--text-4)}
/* Detail panels */
html.theme-light .detail-panel{background:var(--bg-3);border-color:var(--border)}
html.theme-light .detail-err pre,
html.theme-light .step-err-detail pre{background:var(--bg-4)}
html.theme-light .retry-row{border-color:var(--border-2)}
/* Failure detail panel — light mode */
html.theme-light .fd-panel{background:#fff8f8;border-color:#ef444430}
html.theme-light .fd-assertion-ctx{background:#f0f4ff;border-color:#c7d7f5}
html.theme-light .fd-assertion-call{color:#2563eb}
html.theme-light .fd-locator-line code{color:#1d4ed8}
html.theme-light .fd-locator-label{color:#64748b}
html.theme-light .fd-call-log-pre{color:#475569 !important;background:#f8fafc !important;border-color:#e2e8f0 !important}
html.theme-light .fd-expected{background:#f0fdf4;border-color:#4ade8060}
html.theme-light .fd-actual  {background:#fff1f2;border-color:#ef444460}
html.theme-light .fd-diff-val{color:#0f172a}
html.theme-light .fd-error-msg{background:#fff1f2;color:#991b1b;border-color:#ef444430}
html.theme-light .fd-collapsible{border-color:var(--border)}
html.theme-light .fd-collapsible>summary{background:var(--bg-3);color:var(--text-3)}
html.theme-light .fd-collapsible>summary:hover{background:var(--bg-hover)}
html.theme-light .fd-collapsible[open]>summary{background:var(--bg-2)}
html.theme-light .fd-stack,html.theme-light .fd-logs{background:var(--bg-3);color:var(--text-3)}
html.theme-light .cause-app   {background:#fee2e2;color:#991b1b;border-color:#ef444430}
html.theme-light .cause-script{background:#dbeafe;color:#1d4ed8;border-color:#3b82f630}
html.theme-light .cause-env   {background:#fefce8;color:#854d0e;border-color:#f59e0b30}
/* Recommendation panel — light mode */
html.theme-light .rec-panel{border-width:1px}
html.theme-light .rec-dev {background:#f0fdf4;border-color:#16a34a30}
html.theme-light .rec-qa  {background:#eff6ff;border-color:#3b82f630}
html.theme-light .rec-ops {background:#fefce8;border-color:#f59e0b30}
html.theme-light .rec-label{color:#94a3b8}
html.theme-light .rec-dev  .rec-type-badge{color:#15803d}
html.theme-light .rec-qa   .rec-type-badge{color:#1d4ed8}
html.theme-light .rec-ops  .rec-type-badge{color:#b45309}
html.theme-light .rec-body{color:#0f172a}
html.theme-light .rec-detail{color:#475569}
html.theme-light .rec-btn-copy{background:#dbeafe;color:#1d4ed8;border-color:#3b82f640}
html.theme-light .rec-btn-copy.copied{background:#dcfce7;color:#15803d;border-color:#16a34a40}
html.theme-light .rec-btn-mark{background:#f1f5f9;color:#64748b;border-color:#e2e8f0}
html.theme-light .rec-btn-mark.active{background:#dbeafe;color:#1d4ed8;border-color:#3b82f650}
html.theme-light .retry-attempt,html.theme-light .retry-dur,html.theme-light .retry-ts{color:var(--text-4)}
html.theme-light .retry-status{color:var(--text-2)}
html.theme-light .step-title{color:var(--text-3)}
html.theme-light .step-dur,html.theme-light .no-steps{color:var(--text-4)}
/* Catalog */
html.theme-light .catalog-title{color:var(--text)}
html.theme-light .catalog-meta{color:var(--text-4)}
html.theme-light .inv-filter-wrap{background:var(--bg-2);border-color:var(--border)}
html.theme-light .inv-filter-label{color:var(--text-4)}
html.theme-light .inv-search{background:var(--bg-3);border-color:var(--border);color:var(--text)}
html.theme-light .inv-search::placeholder{color:var(--text-5)}
html.theme-light .inv-th{background:var(--bg-3);border-color:var(--border);color:var(--text-4)}
html.theme-light .inv-table tbody tr{border-color:var(--border-2)}
html.theme-light .inv-table tbody tr:hover td{background:var(--bg-hover)}
html.theme-light .inv-table td{color:var(--text-2)}
html.theme-light .inv-name{color:var(--text)}
html.theme-light .inv-entities{color:var(--text-4)}
html.theme-light .inv-more{background:var(--bg-4);color:var(--text-4)}
/* File block header tags (pass/fail/skip/flaky) */
html.theme-light .tag.pass{background:#dcfce7;color:#166534}
html.theme-light .tag.fail{background:#fee2e2;color:#991b1b}
html.theme-light .tag.skip{background:#fef9c3;color:#854d0e}
html.theme-light .tag.flaky{background:#fef3c7;color:#92400e;border-color:#fbbf24}
html.theme-light .tag-dd-btn{background:var(--bg-3);border-color:var(--border);color:var(--text-3)}
html.theme-light .tag-dd-panel{background:var(--bg-2);border-color:var(--border)}
html.theme-light .tag-dd-inner{background:var(--bg-2)}
html.theme-light .tag-dd-footer{border-color:var(--border)}
html.theme-light .tag-dd-clear{border-color:var(--border);color:var(--text-4)}
html.theme-light .tag-dd-clear:hover{border-color:var(--text-3);color:var(--text)}
/* Catalog — type filter buttons */
html.theme-light .inv-badge.file{background:#dbeafe;color:#1d4ed8;border-color:#93c5fd}
html.theme-light .inv-badge.api{background:#ede9fe;color:#6d28d9;border-color:#c4b5fd}
html.theme-light .inv-badge.all{background:#f1f5f9;color:#475569;border-color:#cbd5e1}
html.theme-light .inv-badge:hover{filter:brightness(1.05)}
html.theme-light .inv-badge.file.active{background:#bfdbfe;color:#1e40af;border-color:#3b82f6;box-shadow:0 0 0 2px #3b82f640}
html.theme-light .inv-badge.api.active{background:#ddd6fe;color:#5b21b6;border-color:#8b5cf6;box-shadow:0 0 0 2px #8b5cf640}
html.theme-light .inv-badge.all.active{background:#e2e8f0;color:#334155;border-color:#64748b;box-shadow:0 0 0 2px #64748b40}
html.theme-light .inv-badge.cat.active{filter:none;box-shadow:0 0 0 2px currentColor}
/* Catalog — type badges inside table rows */
html.theme-light .inv-type.file{background:#dbeafe;color:#1d4ed8}
html.theme-light .inv-type.api{background:#ede9fe;color:#6d28d9}
/* Catalog — pricing badges */
html.theme-light .cat-pricing-free{background:#dcfce7;color:#166534}
html.theme-light .cat-pricing-paid{background:#dbeafe;color:#1d4ed8}
html.theme-light .cat-pricing-one-time{background:#dbeafe;color:#1e40af}
html.theme-light .cat-pricing-subscription{background:#f3e8ff;color:#6b21a8}
html.theme-light .cat-pricing-custom{background:#fff7ed;color:#c2410c}
/* Catalog — tag pills in table rows */
html.theme-light .cat-tag.tg-ecom{background:#dbeafe;color:#1e40af;border-color:#93c5fd}
html.theme-light .cat-tag.tg-pos{background:#dcfce7;color:#166534;border-color:#86efac}
html.theme-light .cat-tag.tg-acc{background:#fef9c3;color:#854d0e;border-color:#fde047}
html.theme-light .cat-tag.tg-crm{background:#f3e8ff;color:#6b21a8;border-color:#d8b4fe}
html.theme-light .cat-tag.tg-mig{background:#e2e8f0;color:#334155;border-color:#94a3b8}
html.theme-light .cat-tag.tg-other{background:#f1f5f9;color:#475569;border-color:#94a3b8}
/* Catalog — dropdown tag pills in light mode */
html.theme-light .inv-badge.cat.tg-ecom{background:#dbeafe;color:#1e40af;border-color:#93c5fd}
html.theme-light .inv-badge.cat.tg-pos{background:#dcfce7;color:#166534;border-color:#86efac}
html.theme-light .inv-badge.cat.tg-acc{background:#fef9c3;color:#854d0e;border-color:#fde047}
html.theme-light .inv-badge.cat.tg-crm{background:#f3e8ff;color:#6b21a8;border-color:#d8b4fe}
html.theme-light .inv-badge.cat.tg-mig{background:#e2e8f0;color:#334155;border-color:#94a3b8}
html.theme-light .inv-badge.cat.tg-other{background:#f1f5f9;color:#475569;border-color:#94a3b8}
/* Catalog — dropdown group labels */
html.theme-light .tag-dd-group-label.tg-ecom{background:#dbeafe;color:#1e40af}
html.theme-light .tag-dd-group-label.tg-pos{background:#dcfce7;color:#166534}
html.theme-light .tag-dd-group-label.tg-acc{background:#fef9c3;color:#854d0e}
html.theme-light .tag-dd-group-label.tg-crm{background:#f3e8ff;color:#6b21a8}
html.theme-light .tag-dd-group-label.tg-mig{background:#e2e8f0;color:#334155}
html.theme-light .tag-dd-group-label.tg-other{background:#f1f5f9;color:#475569}
/* Compare tab */
html.theme-light .cmp-section-title{background:var(--bg-3);border-color:var(--border);color:var(--text-2)}
html.theme-light .cmp-empty{color:var(--text-4)}
html.theme-light .cmp-run-badge{border-color:var(--border)}
html.theme-light .prev-badge{background:var(--bg-3)}
html.theme-light .curr-badge{background:var(--bg-2)}
html.theme-light .cmp-run-label{color:var(--text-4)}
html.theme-light .cmp-run-date{color:var(--text-2)}
html.theme-light .cmp-run-branch{color:var(--text-4)}
html.theme-light .cmp-table thead tr{background:var(--bg-3);border-color:var(--border)}
html.theme-light .cmp-table thead th{color:var(--text-4)}
html.theme-light .cmp-row{border-color:var(--border-2)}
html.theme-light .cmp-row:hover td{background:var(--bg-hover)}
html.theme-light .cmp-label{color:var(--text-3)}
html.theme-light .cmp-prev-val{color:var(--text-4)}
html.theme-light .cmp-arrow-cell{color:var(--border)}
html.theme-light .cmp-curr-val{color:var(--text)}
html.theme-light .cmp-same{color:var(--text-4)}
/* History table */
html.theme-light .hist-table thead tr{background:var(--bg-3);border-color:var(--border)}
html.theme-light .hist-table thead th{color:var(--text-4)}
html.theme-light .hist-row{border-color:var(--border-2)}
html.theme-light .hist-row:hover td{background:var(--bg-hover)}
html.theme-light .hist-current{background:#dbeafe}
html.theme-light .hist-current:hover td{background:#bfdbfe}
html.theme-light .hist-date{color:var(--text-2)}
html.theme-light .hist-time{color:var(--text-4)}
html.theme-light .hist-branch,html.theme-light .hist-dur{color:var(--text-4)}
html.theme-light .hist-bar-wrap{background:var(--bg-4)}
html.theme-light .hist-current-badge{background:#1e3a5f;color:#7dd3fc}
/* Flaky block */
html.theme-light .flaky-section{background:#fffbeb;border-color:#fcd34d}
html.theme-light .flaky-table tr{border-color:#fef3c7}
html.theme-light .flaky-table tr:hover td{background:#fef9e7}
html.theme-light .flaky-table td{color:var(--text-2)}
html.theme-light .flaky-title{color:#92400e}
/* Slowest block */
html.theme-light .slowest-header{border-color:var(--border)}
html.theme-light .slowest-meta{color:var(--text-4)}
html.theme-light .slow-table tr{border-color:var(--border-2)}
html.theme-light .slow-table tr:hover td{background:var(--bg-hover)}
html.theme-light .slow-table td{color:var(--text-2)}
html.theme-light .slow-title{color:var(--text-2)}
html.theme-light .slow-bar-wrap{background:var(--bg-4)}
/* Trace cards */
html.theme-light .trace-card{background:var(--bg-3);border-color:var(--border)}
html.theme-light .trace-label{color:var(--text-2)}
html.theme-light .trace-copy{background:var(--bg-2);border-color:var(--border);color:var(--text-3)}
html.theme-light .trace-copy:hover{border-color:#38bdf8;color:#38bdf8}
/* Inventory section (file assist) */
html.theme-light .inventory-section{background:var(--bg-2);border-color:var(--border)}
html.theme-light .inventory-header:hover{background:var(--bg-hover)}
html.theme-light .inventory-title{color:var(--text-2)}
/* Context bar code badges */
html.theme-light .ctx-item code{background:var(--bg-4);color:#0ea5e9}
/* Gate verdict white text fix */
html.theme-light .gate-incomplete .gate-verdict{color:var(--text-3)}
/* Compare empty state */
html.theme-light .cmp-empty{color:var(--text-4)}
/* Arrow cell in cmp table */
html.theme-light .cmp-arrow-cell{color:var(--text-5)}
</style>
</head>
<body>

<!-- ── Top header ──────────────────────────────────────────────────────────── -->
<div class="header">
  <h1>🧪 Test Dashboard</h1>
  <div style="display:flex;align-items:center;gap:14px">
    <span class="run-at">Last run: ${runAt}</span>
    <div class="theme-dd-wrap" id="theme-dd-wrap">
      <button class="theme-btn" id="theme-btn" onclick="toggleThemeDd()">
        <span id="theme-btn-icon">🌙</span>
        <span id="theme-btn-label">Dark</span>
        <span class="theme-arrow">▾</span>
      </button>
      <div class="theme-dd-panel" id="theme-dd-panel">
        <div class="theme-opt" onclick="setTheme('dark')"  data-theme="dark">  <span class="theme-opt-icon">🌙</span> Dark</div>
        <div class="theme-opt" onclick="setTheme('light')" data-theme="light"> <span class="theme-opt-icon">☀️</span> Light</div>
        <div class="theme-opt" onclick="setTheme('system')" data-theme="system"><span class="theme-opt-icon">💻</span> System</div>
      </div>
    </div>
  </div>
</div>

<!-- ── Tab navigation ─────────────────────────────────────────────────────── -->
<nav class="tab-nav">
  <button class="tab-btn${defaultTab === 'summary' ? ' active' : ''}" id="tab-summary" onclick="switchTab('summary')" aria-label="Summary tab">
    📊 Summary
  </button>
  <button class="tab-btn${defaultTab === 'tests' ? ' active' : ''}" id="tab-tests" onclick="switchTab('tests')" aria-label="Tests tab">
    🧪 Tests <span class="tab-badge${failed > 0 ? ' fail-badge' : ''}" id="badge-tests">${total}</span>
  </button>
  ${catalogCount > 0 ? `<button class="tab-btn" id="tab-catalog" onclick="switchTab('catalog')" aria-label="Catalog tab">
    📋 Catalog <span class="tab-badge">${catalogCount}</span>
  </button>` : ''}
  <button class="tab-btn" id="tab-compare" onclick="switchTab('compare')" aria-label="Compare tab">
    🔀 Compare ${prevRun ? `<span class="tab-badge">${historyRaw.length + 1} runs</span>` : ''}
  </button>
</nav>

<!-- ══ Tab 1: Summary ═════════════════════════════════════════════════════════ -->
<div class="tab-pane${defaultTab === 'summary' ? ' active' : ''}" id="pane-summary">
  ${buildContextBar()}
  ${buildReleaseGate()}

  <div class="stats">
    <div class="stat pass"     onclick="goToFilter('passed')"  title="Show passed tests">
      <div class="num">${passed}</div><div class="lbl">✅ Passed</div>
    </div>
    <div class="stat fail"     onclick="goToFilter('failed')"  title="Show failed tests">
      <div class="num">${failed}</div><div class="lbl">❌ Failed</div>
    </div>
    <div class="stat flaky-stat" onclick="goToFilter('flaky')" title="Show flaky tests">
      <div class="num">${flaky}</div><div class="lbl">⚠️ Flaky</div>
    </div>
    <div class="stat skip"     onclick="goToFilter('skipped')" title="Show skipped tests">
      <div class="num">${skipped}</div><div class="lbl">⏭ Skipped</div>
    </div>
    <div class="stat retry"    onclick="goToFilter('retried')" title="Show retried tests">
      <div class="num">${retried}</div><div class="lbl">🔁 Retried</div>
    </div>
    <div class="stat dur"><div class="num">${dur}</div><div class="lbl">⏱ Duration</div></div>
    <div class="stat total"    onclick="goToFilter('all')"     title="Show all tests">
      <div class="num">${total}</div><div class="lbl">📋 Total</div></div>
  </div>

  <div class="progress-wrap">
    <div class="progress-row">
      <div class="progress-left">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="progress-label">
          ${pct}% passed (${passed}/${total})
          ${countGap > 0 ? `&nbsp;·&nbsp;<span class="count-warn">⚠ ${countGap} fewer tests than baseline (${histMax})</span>` : ''}
          ${flaky  > 0 ? `&nbsp;·&nbsp;<span class="flaky-note">${flaky} needed retries</span>` : ''}
          ${trendHtml ? `&nbsp;·&nbsp;${trendHtml}` : ''}
        </div>
      </div>
      ${buildSparkline()}
    </div>
  </div>

  ${buildCategoryBlock()}
  <div class="summary-grid">
    ${buildSlowestBlock()}
    ${buildFlakyBlock()}
  </div>
</div>

<!-- ══ Tab 2: Tests ═══════════════════════════════════════════════════════════ -->
<div class="tab-pane${defaultTab === 'tests' ? ' active' : ''}" id="pane-tests">
  <div class="tests-toolbar">
    <div class="toolbar-search">
      <input class="search-box" id="search-box" type="text" placeholder="🔍 Search tests…" oninput="applyFilter()" aria-label="Search tests"/>
    </div>
    <div class="filter-chips">
      <button class="fchip all active" data-status="all"     onclick="filter('all')">All <em>${total}</em></button>
      <button class="fchip pass"        data-status="passed"  onclick="filter('passed')">✅ Passed <em>${passed}</em></button>
      <button class="fchip fail"        data-status="failed"  onclick="filter('failed')">❌ Failed <em>${failed}</em></button>
      <button class="fchip flaky"       data-status="flaky"   onclick="filter('flaky')">⚠️ Flaky <em>${flaky}</em></button>
      <button class="fchip skip"        data-status="skipped" onclick="filter('skipped')">⏭ Skipped <em>${skipped}</em></button>
      <button class="fchip retry"       data-status="retried" onclick="filter('retried')">🔁 Retried <em>${retried}</em></button>
    </div>
    <div class="toolbar-actions">
      ${failed > 0 ? `<button class="action-btn action-btn-jump" onclick="jumpToFailures()">⬇ Failures</button>` : ''}
      <button class="action-btn" onclick="expandAllFailed()">Expand failures</button>
      <button class="action-btn" onclick="collapseAll()">Collapse all</button>
    </div>
  </div>
  <div class="tests-window">
    <div class="tests-sidebar" id="tests-sidebar">${sidebarHtml}</div>
    <div class="tests-panel" id="tests-panel">
      <div class="blocks" id="blocks">
        ${fileBlocks}
        <div class="no-results" id="no-results" style="display:none">No tests match this filter.</div>
      </div>
    </div>
  </div>
</div>

<!-- ══ Tab 3: Catalog ═════════════════════════════════════════════════════════ -->
${catalogCount > 0 ? `<div class="tab-pane" id="pane-catalog">
  <div class="catalog-wrap">
    ${buildCatalogContent()}
  </div>
</div>` : ''}

<!-- ══ Tab 4: Compare ════════════════════════════════════════════════════════ -->
<div class="tab-pane" id="pane-compare">
  ${buildCompareTab()}
</div>

<script>
const testData = ${JSON.stringify(testData)};
let activeFilter = null;
let filePrefixFilter = null;

// ── Tab switching ────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const btn  = document.getElementById('tab-' + name);
  const pane = document.getElementById('pane-' + name);
  if (btn)  btn.classList.add('active');
  if (pane) pane.classList.add('active');
  try { history.replaceState(null, '', '#' + name); } catch {}
  // Clicking Summary clears any active test filter
  if (name === 'summary') clearFilter();
}

function clearFilter() {
  activeFilter = null;
  filePrefixFilter = null;
  document.querySelectorAll('.fchip').forEach(c => c.classList.remove('active'));
  const allChip = document.querySelector('.fchip.all');
  if (allChip) allChip.classList.add('active');
  applyFilter();
}

function filter(status) {
  if (status === 'all') { clearFilter(); return; }
  // Toggle off if same chip clicked again
  if (activeFilter === status) { clearFilter(); return; }
  activeFilter = status;
  document.querySelectorAll('.fchip').forEach(c => c.classList.remove('active'));
  const chip = document.querySelector('.fchip[data-status="' + status + '"]');
  if (chip) chip.classList.add('active');
  applyFilter();
}

function applyFilter() {
  const query = (document.getElementById('search-box')?.value || '').toLowerCase().trim();
  let anyVisible = false;
  document.querySelectorAll('.file-block').forEach(block => {
    let blockHasVisible = false;
    block.querySelectorAll('.test-row').forEach(row => {
      const status  = row.dataset.status;
      const isFlaky = row.dataset.flaky === 'true';
      const id      = parseInt(row.dataset.id);
      const td      = testData.find(t => t.id === id);
      const title   = row.dataset.title || '';
      let show = true;
      if (activeFilter === 'passed')  show = status === 'passed';
      if (activeFilter === 'failed')  show = status === 'failed' || status === 'timedOut';
      if (activeFilter === 'flaky')   show = isFlaky;
      if (activeFilter === 'skipped') show = status === 'skipped';
      if (activeFilter === 'retried') show = td && (td.retry || 0) > 0;
      if (show && filePrefixFilter) show = (row.dataset.file || '').startsWith(filePrefixFilter);
      if (show && query) show = title.includes(query);
      row.classList.toggle('hidden', !show);
      const detail = document.getElementById('detail-' + id);
      if (detail && !show) detail.style.display = 'none';
      if (show) blockHasVisible = true;
    });
    block.classList.toggle('hidden', !blockHasVisible);
    if (blockHasVisible) anyVisible = true;
  });
  document.getElementById('no-results').style.display = anyVisible ? 'none' : 'block';
}

function toggleDetail(id) {
  const detail = document.getElementById('detail-' + id);
  if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
}

function toggleFile(header) {
  const table  = header.nextElementSibling;
  const hidden = table.classList.toggle('hidden');
  header.classList.toggle('collapsed', hidden);
}

function expandAllFailed() {
  document.querySelectorAll('.file-block.has-fail').forEach(block => {
    block.querySelector('.file-header').classList.remove('collapsed');
    block.querySelector('.test-table').classList.remove('hidden');
  });
  document.querySelectorAll('.test-row.fail').forEach(row => {
    if (!row.classList.contains('hidden')) {
      const detail = document.getElementById('detail-' + row.dataset.id);
      if (detail) detail.style.display = '';
    }
  });
}

function collapseAll() {
  document.querySelectorAll('.file-block').forEach(block => {
    block.querySelector('.file-header').classList.add('collapsed');
    block.querySelector('.test-table').classList.add('hidden');
  });
  document.querySelectorAll('.detail-row').forEach(row => { row.style.display = 'none'; });
}

// ── Catalog filter ───────────────────────────────────────────────────────────
let activeInvFilter = 'all';
let activeInvQuery  = '';
let activeInvTag    = '';

function toggleTagDropdown() {
  const btn   = document.getElementById('tag-dd-btn');
  const panel = document.getElementById('tag-dd-panel');
  const open  = panel.classList.toggle('open');
  btn.classList.toggle('open', open);
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  const wrap = document.getElementById('tag-dd-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('tag-dd-panel')?.classList.remove('open');
    document.getElementById('tag-dd-btn')?.classList.remove('open');
  }
});

function clearTagFilter() {
  activeInvTag = '';
  document.querySelectorAll('.inv-badge.cat').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tag-dd-btn');
  btn?.classList.remove('has-active');
  document.getElementById('tag-dd-label').textContent = 'Tags';
  applyInvFilter();
}

function filterInv(type, el) {
  activeInvFilter = type;
  activeInvTag    = '';
  document.querySelectorAll('.inv-badge:not(.cat)').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.inv-badge.cat').forEach(b => b.classList.remove('active'));
  document.getElementById('tag-dd-btn')?.classList.remove('has-active');
  document.getElementById('tag-dd-label').textContent = 'Tags';
  if (el) el.classList.add('active');
  applyInvFilter();
}

function filterInvTag(tag, el) {
  if (activeInvTag === tag) {
    activeInvTag = '';
    el.classList.remove('active');
    document.getElementById('tag-dd-btn')?.classList.remove('has-active');
    document.getElementById('tag-dd-label').textContent = 'Tags';
  } else {
    document.querySelectorAll('.inv-badge.cat').forEach(b => b.classList.remove('active'));
    activeInvTag = tag;
    if (el) el.classList.add('active');
    const btn = document.getElementById('tag-dd-btn');
    btn?.classList.add('has-active');
    document.getElementById('tag-dd-label').textContent = tag;
  }
  // close panel after selection
  document.getElementById('tag-dd-panel')?.classList.remove('open');
  document.getElementById('tag-dd-btn')?.classList.remove('open');
  applyInvFilter();
}

function searchInv(q) {
  activeInvQuery = q.toLowerCase().trim();
  applyInvFilter();
}

function applyInvFilter() {
  document.querySelectorAll('.inv-row').forEach(row => {
    const typeMatch  = activeInvFilter === 'all' || row.dataset.type === activeInvFilter;
    const titleMatch = !activeInvQuery  || (row.dataset.title || '').includes(activeInvQuery);
    const tagMatch   = !activeInvTag    || (row.dataset.title || '').includes(activeInvTag);
    row.classList.toggle('hidden', !typeMatch || !titleMatch || !tagMatch);
  });
}

// ── Jump to failures ─────────────────────────────────────────────────────────
const firstFail = document.querySelector('.file-block.has-fail');
if (firstFail) firstFail.id = 'first-failure';

// ── Sidebar navigation ────────────────────────────────────────────────────────
function sbSetActive(el) {
  document.querySelectorAll('.sb-all,.sb-folder-hdr,.sb-file').forEach(e => e.classList.remove('sb-active'));
  if (el) el.classList.add('sb-active');
}

// ── Failure recommendation actions ────────────────────────────────────────────
function copyFailureDetails(b64, btn) {
  let text = '';
  try {
    // UTF-8 safe decode: Node encodes as UTF-8, browser atob returns binary string
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const d = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    const lines = ['=== TEST FAILURE REPORT ==='];
    if (d.title)    lines.push('Test:     ' + d.title);
    if (d.expected) lines.push('Expected: ' + d.expected);
    if (d.actual)   lines.push('Actual:   ' + d.actual);
    if (d.error)    lines.push('\\nError:\\n' + d.error);
    if (d.rec)      lines.push('\\nRecommendation:\\n' + d.rec);
    text = lines.join('\\n');
  } catch (e) { text = '(could not parse failure data)'; }

  const flash = (ok) => {
    const orig = btn.innerHTML;
    btn.innerHTML = ok ? '✅ Copied!' : '⚠️ Copy failed';
    btn.classList.toggle('copied', ok);
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2500);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => flash(true)).catch(() => fallbackCopy(text, btn, flash));
  } else {
    fallbackCopy(text, btn, flash);
  }
}

function copyTracePath(path, btn) {
  const done = () => { btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = 'Copy path', 1500); };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(path).then(done).catch(() => { fallbackCopy(path, btn, ok => ok && done()); });
  } else {
    fallbackCopy(path, btn, ok => ok && done());
  }
}

function fallbackCopy(text, btn, flash) {
  // textarea trick — works on http:// and file:// where clipboard API is unavailable
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); flash(true); } catch (e) { flash(false); }
  document.body.removeChild(ta);
}

function markOverride(btn, type) {
  // Toggle active state — only one mark active at a time per panel
  const panel = btn.closest('.rec-panel');
  if (!panel) return;
  const already = btn.classList.contains('active');
  panel.querySelectorAll('.rec-btn-mark').forEach(b => b.classList.remove('active'));
  if (!already) btn.classList.add('active');
}

function sbToggleCat(folderId, hdrEl) {
  const folder = document.getElementById(folderId);
  if (!folder) return;
  const files = folder.querySelector('.sb-folder-files');
  const caret = hdrEl.querySelector('.sb-caret');
  const isOpen = folder.classList.toggle('open');
  if (files) files.style.display = isOpen ? 'block' : 'none';
  if (caret) caret.style.transform = isOpen ? 'rotate(90deg)' : '';
}

function sbSelectFile(file, el) {
  sbSetActive(el);
  // Open parent folder if it's collapsed
  const folder = el.closest('.sb-folder');
  if (folder && !folder.classList.contains('open')) {
    sbToggleCat(folder.id, folder.querySelector('.sb-folder-hdr'));
  }
  const panel = document.getElementById('tests-panel');
  const block = document.querySelector('.file-block[data-file="' + file + '"]');
  if (!block || !panel) return;
  // Always show this block regardless of any active filter
  block.closest('.cat-sec')?.classList.remove('hidden');
  block.classList.remove('hidden');
  block.querySelector('.file-header')?.classList.remove('collapsed');
  block.querySelector('.test-table')?.classList.remove('hidden');
  // Unhide all test rows in this block so it isn't empty
  block.querySelectorAll('.test-row').forEach(r => r.classList.remove('hidden'));
  // Scroll after reflow so getBoundingClientRect() is accurate
  requestAnimationFrame(() => {
    const panelTop = panel.getBoundingClientRect().top;
    const blockTop = block.getBoundingClientRect().top;
    panel.scrollTop += (blockTop - panelTop) - 12;
  });
}

function sbSelectCat(prefix, el) {
  sbSetActive(el);
  const panel = document.getElementById('tests-panel');
  const sec = document.querySelector('.cat-sec[data-cat-prefix="' + prefix + '"]');
  if (!sec || !panel) return;
  const panelTop = panel.getBoundingClientRect().top;
  const secTop   = sec.getBoundingClientRect().top;
  panel.scrollTop += (secTop - panelTop) - 12;
}

function sbClearSelect() {
  sbSetActive(document.getElementById('sb-all'));
  document.querySelectorAll('.file-block,.cat-sec').forEach(b => b.classList.remove('hidden'));
  applyFilter();
  document.getElementById('tests-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function jumpToFailures() {
  const el = document.getElementById('first-failure') || document.querySelector('.file-block.has-fail');
  if (el) {
    el.querySelector('.file-header').classList.remove('collapsed');
    el.querySelector('.test-table').classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ── Navigation helpers (Summary → Tests) ─────────────────────────────────────
function goToTest(id) {
  if (id < 0) return;
  switchTab('tests');
  clearFilter();
  setTimeout(() => {
    const row = document.querySelector('.test-row[data-id="' + id + '"]');
    if (!row) return;
    const fb = row.closest('.file-block');
    if (fb) {
      fb.querySelector('.file-header').classList.remove('collapsed');
      fb.querySelector('.test-table').classList.remove('hidden');
    }
    const panel2 = document.getElementById('tests-panel');
    if (panel2) {
      const pt = panel2.getBoundingClientRect().top;
      const rt = row.getBoundingClientRect().top;
      panel2.scrollTop += (rt - pt) - 80;
    } else { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    const detail = document.getElementById('detail-' + id);
    if (detail && detail.style.display === 'none') toggleDetail(id);
    row.classList.add('test-highlight');
    setTimeout(() => row.classList.remove('test-highlight'), 2000);
  }, 60);
}

function goToFilter(status) {
  switchTab('tests');
  setTimeout(() => {
    if (status === 'all') clearFilter();
    else filter(status);
    document.getElementById('blocks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

function goToCategory(prefix) {
  switchTab('tests');
  setTimeout(() => {
    clearFilter();
    filePrefixFilter = prefix;
    applyFilter();
    document.getElementById('blocks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const THEME_ICONS = { dark:'🌙', light:'☀️', system:'💻' };
const THEME_LABELS = { dark:'Dark', light:'Light', system:'System' };

function applyTheme(pref) {
  const isDark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('theme-light', !isDark);
  document.getElementById('theme-btn-icon').textContent  = THEME_ICONS[pref];
  document.getElementById('theme-btn-label').textContent = THEME_LABELS[pref];
  document.querySelectorAll('.theme-opt').forEach(o => o.classList.toggle('active', o.dataset.theme === pref));
}

function setTheme(pref) {
  localStorage.setItem('dash-theme', pref);
  applyTheme(pref);
  document.getElementById('theme-dd-panel').classList.remove('open');
}

function toggleThemeDd() {
  document.getElementById('theme-dd-panel').classList.toggle('open');
}

document.addEventListener('click', e => {
  if (!document.getElementById('theme-dd-wrap')?.contains(e.target))
    document.getElementById('theme-dd-panel')?.classList.remove('open');
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('dash-theme') === 'system') applyTheme('system');
});

// ── Init: URL hash tab + auto-collapse skipped ───────────────────────────────
(function init() {
  const hash = location.hash.replace('#', '');
  if (['summary', 'tests', 'catalog'].includes(hash)) switchTab(hash);

  // Apply saved theme
  applyTheme(localStorage.getItem('dash-theme') || 'dark');

  document.querySelectorAll('.file-block').forEach(block => {
    const rows = block.querySelectorAll('.test-row');
    if ([...rows].every(r => r.classList.contains('skip'))) {
      block.querySelector('.file-header').classList.add('collapsed');
      block.querySelector('.test-table').classList.add('hidden');
    }
  });
})();
</script>
</body>
</html>`;

fs.writeFileSync(OUT_HTML, html);
console.log(`\n📊 Dashboard → ${OUT_HTML}`);

// ── Append run to history ─────────────────────────────────────────────────────
const historyEntry = {
  date:     new Date().toISOString(),
  passed, failed, skipped, flaky, total, pct,
  duration: stats.duration || 0,
  branch:   ctx.branch || '',
};
const updatedHistory = [...historyRaw, historyEntry].slice(-HISTORY_LIMIT);
fs.writeFileSync(HISTORY_JSON, JSON.stringify(updatedHistory, null, 2));
console.log(`📈 History → ${HISTORY_JSON} (${updatedHistory.length} run${updatedHistory.length !== 1 ? 's' : ''} recorded)`);

try {
  const open = process.platform === 'darwin' ? 'open'
             : process.platform === 'win32'  ? 'start'
             : 'xdg-open';
  execSync(`${open} "${OUT_HTML}"`);
} catch {}
