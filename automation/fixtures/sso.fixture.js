// Playwright fixture for all Shopify SSO tests.
//
// Session loading priority:
//   1. SHOPIFY_SESSION_B64 env var (CI) — base64-encoded session JSON injected as a secret
//   2. tests/auth/.shopify-session.json on disk (local dev)
//   3. No session — throws with instructions (prevents silent failures)
//
// Session format (v2):
//   { meta: { capturedAt, shopifyUser, shopHandle, checkpoint, version }, cookies, origins }
//
//   checkpoint = 'post-login'  → saved after login (store-agnostic, reusable)
//   checkpoint = 'post-store'  → saved after landing on /listings for a specific store
//
// Session age check:
//   Sessions older than SESSION_MAX_AGE_DAYS (default 7) emit a warning.
//   Run capture_session.js again to refresh.
//
// Local dev:
//   node tests/auth/capture_session.js     ← saves post-login session
//   npx playwright test tests/e2e_square_shopify_v2.spec.js --headed
//
// CI setup:
//   1. Run capture_session.js locally, then:
//      node -e "console.log(Buffer.from(require('fs').readFileSync('tests/auth/.shopify-session.json')).toString('base64'))"
//   2. Store output as CI secret: SHOPIFY_SESSION_B64
//   3. Refresh when tests start failing with auth errors (session expired)

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { test: base, expect } = require('@playwright/test');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path    = require('path');
const fs      = require('fs');

chromium.use(stealth);

const SESSION_FILE         = path.resolve(__dirname, 'tests/UI/auth/.shopify-session.json');
const SESSION_MAX_AGE_DAYS = parseInt(process.env.SHOPIFY_SESSION_MAX_AGE_DAYS || '7', 10);

/**
 * Resolve session file from CI env var or disk.
 * Returns the parsed session object, or null if not available.
 * Logs checkpoint, age, and staleness warnings.
 */
function resolveSession() {
  // CI: decode base64 secret → write to disk
  if (process.env.SHOPIFY_SESSION_B64) {
    const json = Buffer.from(process.env.SHOPIFY_SESSION_B64, 'base64').toString('utf8');
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, json);
    console.log('[sso] Session written from SHOPIFY_SESSION_B64 (CI mode)');
    return JSON.parse(json);
  }

  // Local: check for file on disk
  if (!fs.existsSync(SESSION_FILE)) {
    console.log('[sso] No session file found.');
    console.log('[sso] Run: node tests/auth/capture_session.js');
    return null;
  }

  let session;
  try {
    session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch (e) {
    console.log('[sso] Session file is malformed — re-run: node tests/auth/capture_session.js');
    return null;
  }

  // Log session metadata
  const meta = session.meta || {};
  if (meta.capturedAt) {
    const ageMs    = Date.now() - new Date(meta.capturedAt).getTime();
    const ageHours = Math.round(ageMs / 3600000);
    const ageDays  = (ageMs / 86400000).toFixed(1);
    const maxMs    = SESSION_MAX_AGE_DAYS * 24 * 3600000;

    console.log(`[sso] Session loaded → checkpoint=${meta.checkpoint || 'unknown'}, age=${ageHours}h (${ageDays}d)`);

    if (ageMs > maxMs) {
      console.warn(`[sso] ⚠ Session is ${ageDays} days old (max ${SESSION_MAX_AGE_DAYS}d). Consider refreshing.`);
      console.warn('[sso]   Run: node tests/auth/capture_session.js');
    }
  } else {
    // v1 session (no meta) — still usable but recommend upgrade
    console.log('[sso] Session loaded (v1 — no metadata). Run capture_session.js to upgrade.');
  }

  return session;
}

const test = base.extend({
  browser: [async ({}, use) => {
    const isHeaded = process.env.HEADED !== 'false';
    const browser  = await chromium.launch({ headless: !isHeaded });
    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],

  page: async ({ browser }, use) => {
    const session = resolveSession();

    // Always write session to file before creating context (CI path already wrote it above)
    const contextOpts = session ? { storageState: SESSION_FILE } : {};
    const context = await browser.newContext(contextOpts);
    const page    = await context.newPage();
    await use(page);
    await context.close();
  },
});

module.exports = { test, expect };
