'use strict';
// Slack Alert Sender
// Sends Block Kit messages via Slack Incoming Webhooks.
// No SDK required — pure HTTPS POST.

const https = require('https');
const http  = require('http');
const { TEMPLATES } = require('./templates');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4000';

/**
 * Send a Slack alert.
 * @param {string} webhookUrl   — Slack Incoming Webhook URL
 * @param {object} payload      — Block Kit payload from TEMPLATES
 * @returns {Promise<number>}   — HTTP status code
 */
function sendAlert(webhookUrl, payload) {
  if (!webhookUrl) {
    console.warn('[slack] No SLACK_WEBHOOK configured — alert skipped');
    return Promise.resolve(0);
  }

  return new Promise((resolve, reject) => {
    const body   = JSON.stringify(payload);
    const parsed = new URL(webhookUrl);
    const lib    = parsed.protocol === 'https:' ? https : http;

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          console.error(`[slack] Alert failed — HTTP ${res.statusCode}: ${buf.slice(0, 200)}`);
          reject(new Error(`Slack HTTP ${res.statusCode}`));
        } else {
          console.log(`[slack] ✓ Alert sent — HTTP ${res.statusCode}`);
          resolve(res.statusCode);
        }
      });
    });

    req.on('error', err => {
      console.error(`[slack] Request error: ${err.message}`);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

async function alertSuiteFailure(run, gate) {
  const webhook = process.env.SLACK_WEBHOOK;
  return sendAlert(webhook, TEMPLATES.suiteFailure(run, gate, DASHBOARD_URL));
}

async function alertFlakyTests(tests) {
  const webhook = process.env.SLACK_WEBHOOK;
  if (!tests || tests.length === 0) return;
  return sendAlert(webhook, TEMPLATES.flakyAlert(tests, DASHBOARD_URL));
}

async function alertReleaseGate(status, run) {
  const webhook = process.env.SLACK_WEBHOOK;
  return sendAlert(webhook, TEMPLATES.releaseGate(status, run, DASHBOARD_URL));
}

async function alertNewCluster(cluster) {
  const webhook = process.env.SLACK_WEBHOOK;
  return sendAlert(webhook, TEMPLATES.newCluster(cluster, DASHBOARD_URL));
}

module.exports = {
  sendAlert,
  alertSuiteFailure,
  alertFlakyTests,
  alertReleaseGate,
  alertNewCluster,
  TEMPLATES,
};
