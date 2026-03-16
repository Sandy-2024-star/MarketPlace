'use strict';
// QA Analytics — Playwright Custom Reporter
//
// Streams test results to the QA Analytics API in real-time.
// Zero changes to existing automation code — add to playwright.config.js reporter array.
//
// Usage (in playwright.config.js):
//   reporter: [
//     ['list'],
//     ['json', { outputFile: 'test-results/results.json' }],
//     [require.resolve('../qa-analytics/integrations/playwright-reporter'), {
//       apiUrl:  'http://localhost:4000',
//       suiteId: 'migration-ui',
//       branch:  process.env.BRANCH || 'main',
//       token:   process.env.QA_TOKEN,
//     }],
//   ],

const https = require('https');
const http  = require('http');

class QAAnalyticsReporter {
  constructor(options = {}) {
    this.apiUrl   = (options.apiUrl  || 'http://localhost:4000').replace(/\/$/, '');
    this.suiteId  = options.suiteId  || 'default';
    this.branch   = options.branch   || process.env.BRANCH || 'main';
    this.commitSha = options.commitSha || process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || '';
    this.token    = options.token    || process.env.QA_TOKEN || '';
    this.dryRun   = options.dryRun   === true;

    this._results   = [];
    this._startedAt = new Date().toISOString();
    this._startMs   = Date.now();
  }

  // ── Playwright reporter lifecycle ──────────────────────────────────────────

  onBegin(config, suite) {
    this._totalTests = suite.allTests().length;
    console.log(`\n[qa-analytics] Reporter active — suite: ${this.suiteId} | tests: ${this._totalTests}`);
  }

  onTestEnd(test, result) {
    const status = this._mapStatus(result.status, result.retry);
    const error  = result.errors?.[0];

    // Collect screenshot, video, trace, and custom attachment paths
    const artifacts = (result.attachments || [])
      .filter(a => a.path || a.body)
      .map(a => ({
        name:        a.name,
        contentType: a.contentType,
        path:        a.path ? a.path.replace(process.cwd(), '') : null,
      }));

    this._results.push({
      testId:       this._stableId(test),
      testName:     test.titlePath().join(' > '),
      filePath:     test.location?.file?.replace(process.cwd(), '') || '',
      tags:         test.tags || [],
      status,
      durationMs:   result.duration,
      retryCount:   result.retry,
      errorMessage: error?.message?.slice(0, 1000) || '',
      stackTrace:   error?.stack?.slice(0, 3000)   || '',
      startedAt:    new Date(Date.now() - result.duration).toISOString(),
      finishedAt:   new Date().toISOString(),
      artifacts,
    });
  }

  async onEnd(result) {
    const durationMs   = Date.now() - this._startMs;
    const passed       = this._results.filter(r => r.status === 'passed').length;
    const failed       = this._results.filter(r => r.status === 'failed').length;
    const skipped      = this._results.filter(r => r.status === 'skipped').length;
    const flaky        = this._results.filter(r => r.status === 'flaky').length;
    const overallStatus = failed > 0 ? 'failed' : 'passed';

    const payload = {
      suiteId: this.suiteId,
      run: {
        branch:       this.branch,
        commitSha:    this.commitSha,
        triggeredBy:  process.env.CI ? 'ci' : 'manual',
        status:       overallStatus,
        startedAt:    this._startedAt,
        finishedAt:   new Date().toISOString(),
        durationMs,
        total:        this._results.length,
        passed, failed, skipped, flaky,
      },
      results: this._results,
    };

    if (this.dryRun) {
      console.log(`[qa-analytics] DRY RUN — would POST ${this._results.length} results`);
      return;
    }

    try {
      const response = await this._post('/api/runs/ingest', payload);
      console.log(`[qa-analytics] ✓ Ingested run #${response.runNumber} — status: ${overallStatus}`);
    } catch (err) {
      console.error(`[qa-analytics] ✗ Ingest failed: ${err.message}`);
      console.error(`[qa-analytics]   API: ${this.apiUrl}/api/runs/ingest`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _mapStatus(playwrightStatus, retry) {
    if (playwrightStatus === 'passed' && retry > 0) return 'flaky';
    if (playwrightStatus === 'passed')   return 'passed';
    if (playwrightStatus === 'failed')   return 'failed';
    if (playwrightStatus === 'timedOut') return 'failed';
    if (playwrightStatus === 'skipped')  return 'skipped';
    return 'failed';
  }

  _stableId(test) {
    // Deterministic ID from file + title — same test = same ID across runs
    const key = `${test.location?.file || ''}::${test.titlePath().join('::')}`;
    const hash = require('crypto').createHash('md5').update(key).digest('hex').slice(0, 12);
    return `test_${hash}`;
  }

  _post(path, body) {
    return new Promise((resolve, reject) => {
      const data    = JSON.stringify(body);
      const url     = new URL(this.apiUrl + path);
      const isHttps = url.protocol === 'https:';
      const lib     = isHttps ? https : http;

      const req = lib.request({
        hostname: url.hostname,
        port:     url.port || (isHttps ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
        },
      }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          } else {
            try { resolve(JSON.parse(body)); } catch { resolve(body); }
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = QAAnalyticsReporter;
