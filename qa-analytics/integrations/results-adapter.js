#!/usr/bin/env node
'use strict';
// Results Adapter — reads the existing automation/test-results/results.json
// and pushes it to the QA Analytics API.
//
// Run: node qa-analytics/integrations/results-adapter.js
// Or:  node results-adapter.js --suite migration-ui --branch main

const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const https   = require('https');
const crypto  = require('crypto');

// ── Config from args / env ────────────────────────────────────────────────────

const args    = parseArgs(process.argv.slice(2));
const API_URL = (args.api || process.env.QA_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const SUITE   = args.suite  || process.env.QA_SUITE  || 'migration-ui';
const BRANCH  = args.branch || process.env.BRANCH    || 'main';
const TOKEN   = args.token  || process.env.QA_TOKEN  || '';

// Results file — default: ../../automation/test-results/results.json
const RESULTS_FILE = args.file
  || process.env.QA_RESULTS_FILE
  || path.resolve(__dirname, '../../automation/test-results/results.json');

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n[adapter] QA Analytics Results Adapter');
  console.log(`[adapter] Source : ${RESULTS_FILE}`);
  console.log(`[adapter] Target : ${API_URL}/api/runs/ingest`);
  console.log(`[adapter] Suite  : ${SUITE} | Branch: ${BRANCH}\n`);

  if (!fs.existsSync(RESULTS_FILE)) {
    console.error(`[adapter] ✗ Results file not found: ${RESULTS_FILE}`);
    console.error('[adapter]   Run tests first, or pass --file path/to/results.json');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));

  // Flatten Playwright JSON report format into our ingest format
  const { run, results } = transformPlaywrightReport(raw, BRANCH);

  console.log(`[adapter] Transforming ${results.length} test results...`);

  const payload = { suiteId: SUITE, run, results };

  try {
    const response = await post(`${API_URL}/api/runs/ingest`, payload, TOKEN);
    console.log(`[adapter] ✓ Ingested as run #${response.runNumber} (id: ${response.runId})`);
    console.log(`[adapter]   Status: ${response.status}`);
    console.log(`[adapter]   Dashboard: ${API_URL}\n`);
  } catch (err) {
    console.error(`[adapter] ✗ Ingest failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Transform Playwright JSON report → ingest format ─────────────────────────

function transformPlaywrightReport(report, branch) {
  const stats   = report.stats || {};
  const results = [];

  flattenSuites(report.suites || [], results);

  const startedAt  = stats.startTime  ? new Date(stats.startTime).toISOString()  : new Date().toISOString();
  const finishedAt = stats.endTime    ? new Date(stats.endTime).toISOString()     : new Date().toISOString();
  const durationMs = stats.duration   || 0;
  const total      = results.length;
  const passed     = results.filter(r => r.status === 'passed').length;
  const failed     = results.filter(r => r.status === 'failed').length;
  const skipped    = results.filter(r => r.status === 'skipped').length;
  const flaky      = results.filter(r => r.status === 'flaky').length;

  return {
    run: {
      branch,
      commitSha:   process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || '',
      triggeredBy: process.env.CI ? 'ci' : 'manual',
      status:      failed > 0 ? 'failed' : 'passed',
      startedAt, finishedAt, durationMs,
      total, passed, failed, skipped, flaky,
    },
    results,
  };
}

function flattenSuites(suites, out, filePath = '') {
  for (const suite of suites) {
    const fp = suite.file || filePath;
    if (suite.suites) flattenSuites(suite.suites, out, fp);

    for (const spec of (suite.specs || [])) {
      for (const test of (spec.tests || [])) {
        const result  = test.results?.[test.results.length - 1] || {};
        const retries = test.results?.length - 1 || 0;
        const error   = test.results?.find(r => r.status === 'failed')?.errors?.[0];

        const titleParts  = [...(spec.titlePath || []), spec.title].filter(Boolean);
        const testName    = titleParts.join(' > ');
        const testId      = stableId(fp, testName);
        const pwStatus    = result.status || 'skipped';
        const status      = pwStatus === 'passed' && retries > 0 ? 'flaky'
                          : pwStatus === 'timedOut' ? 'failed'
                          : pwStatus;

        out.push({
          testId,
          testName,
          filePath: fp.replace(process.cwd(), ''),
          tags:     spec.tags || [],
          status,
          durationMs:   result.duration || 0,
          retryCount:   retries,
          errorMessage: error?.message?.slice(0, 1000) || '',
          stackTrace:   error?.stack?.slice(0, 3000)   || '',
          startedAt:    result.startTime ? new Date(result.startTime).toISOString() : new Date().toISOString(),
          finishedAt:   new Date().toISOString(),
        });
      }
    }
  }
}

function stableId(filePath, testName) {
  const key  = `${filePath}::${testName}`;
  const hash = crypto.createHash('md5').update(key).digest('hex').slice(0, 12);
  return `test_${hash}`;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function post(url, body, token) {
  return new Promise((resolve, reject) => {
    const data    = JSON.stringify(body);
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const req     = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 300)}`));
        else { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

main().catch(err => { console.error(err); process.exit(1); });
