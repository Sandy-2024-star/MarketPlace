// Automated session capture.
//
// Key insight from network probe: hCaptcha IS auto-solved by stealth plugin.
// The token is placed in h-captcha-response before we type.
// Fix: wait for hCaptcha token to be populated FIRST, then fill password
// and submit immediately (before token expires ~2min).
//
// Usage: node scripts/capture_session.js
//
// Saved to: tests/UI/auth/.shopify-session.json
//   { meta: { capturedAt, shopifyUser, shopHandle: null, checkpoint: 'post-login', version: 2 }, cookies, origins }

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const fs   = require('fs');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

const SESSION_FILE    = path.resolve(__dirname, '../tests/UI/auth/.shopify-session.json');
const SESSION_VERSION = 2;
const USERNAME        = process.env.SHOPIFY_USERNAME;
const PASSWORD        = process.env.SHOPIFY_PASSWORD;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pollUrl(page, check, label, maxMs = 120000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try { if (check(page.url())) return page.url(); } catch (_) {}
    await sleep(1500);
  }
  throw new Error(`Timeout: ${label}. Last: ${page.url()}`);
}

async function waitVerifyClear(page, maxMs = 90000) {
  if (!page.url().includes('verify=')) return;
  console.log('  [cf] verify= — waiting...');
  const deadline = Date.now() + maxMs;
  while (page.url().includes('verify=') && Date.now() < deadline) await sleep(1500);
  console.log('  [cf] Resolved →', page.url());
  await sleep(500);
}

/** Poll until h-captcha-response hidden input has a non-empty value. */
async function waitForCaptchaToken(page, maxMs = 90000) {
  console.log('  [hcaptcha] Waiting for token...');
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const val = await page.locator('input[name="h-captcha-response"]').first().inputValue();
      if (val && val.length > 10) {
        console.log('  [hcaptcha] Token ready (len=' + val.length + ')');
        return val;
      }
    } catch (_) {}
    await sleep(800);
  }
  console.log('  [hcaptcha] Token not found — proceeding anyway');
  return null;
}

async function main() {
  if (!USERNAME || !PASSWORD) {
    console.error('SHOPIFY_USERNAME and SHOPIFY_PASSWORD must be set in .env');
    process.exit(1);
  }

  console.log('=== Shopify Session Capture (automated) ===');
  console.log('Account:', USERNAME, '\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    // ── 1. Navigate to login ─────────────────────────────────────────────────
    console.log('[1] Navigating to login...');
    await page.goto('https://accounts.shopify.com/login').catch(() => {});
    await waitVerifyClear(page, 30000);

    // ── 2. Fill email → wait for hCaptcha on email form → click Continue ────────
    // Manual network trace: lookup POST always includes a solved h-captcha-response.
    // We must wait for the token on the email form BEFORE clicking Continue.
    for (let attempt = 0; attempt < 3; attempt++) {
      const emailInput = page.locator('input[type="email"]').first();
      const onEmail    = await emailInput.isVisible({ timeout: 8000 }).catch(() => false);
      if (!onEmail) break;

      if (attempt > 0) console.log(`  [retry] attempt ${attempt + 1}/3`);
      console.log('[2] Filling email...');
      await emailInput.fill(USERNAME);

      // Wait for hCaptcha to solve on the email/lookup form before submitting
      console.log('  Waiting for email-form hCaptcha...');
      await waitForCaptchaToken(page, 60000);

      const continueBtn = page.locator('button').filter({ hasText: /continue|next/i }).first();
      await continueBtn.click();
      await waitVerifyClear(page, 90000);

      // If bounced back to empty email — retry
      const stillEmail = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);
      if (stillEmail) {
        const val = await emailInput.inputValue().catch(() => '');
        if (!val || val !== USERNAME) continue;
      }
      break;
    }

    // ── 3. Wait for password form ─────────────────────────────────────────────
    console.log('[3] Waiting for password form...');
    const passwordInput = page.locator('input[type="password"]').first();
    const pwdVisible = await passwordInput.waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true).catch(() => false);

    if (!pwdVisible) {
      await page.screenshot({ path: 'test-results/capture-no-pwd.png', fullPage: true }).catch(() => {});
      throw new Error('Password input never appeared. URL: ' + page.url());
    }
    console.log('  Password form visible. URL:', page.url());

    // ── 4. Wait for password-form hCaptcha, then submit immediately ──────────
    console.log('  Waiting for password-form hCaptcha...');
    await waitForCaptchaToken(page, 60000);

    console.log('[4] Filling password and submitting...');
    await passwordInput.fill(PASSWORD);
    await sleep(200);
    await passwordInput.press('Enter');
    await sleep(3000);
    console.log('  After submit URL:', page.url());

    // If verify= again, wait
    await waitVerifyClear(page, 60000);

    // ── 5. Wait for post-login URL ───────────────────────────────────────────
    // Manual flow: login POST 302s back to login?rid= (session cookies set),
    // then browser follows to admin/dashboard. Accept any URL off login/lookup.
    console.log('[5] Waiting for post-login redirect...');
    await pollUrl(page,
      url => !url.includes('accounts.shopify.com/login') &&
             !url.includes('accounts.shopify.com/lookup') &&
             url.startsWith('https://') &&
             url.includes('.shopify.com'),
      'post-login URL', 90000
    );
    console.log('  ✓ Logged in:', page.url());

    // ── 6. Save session ───────────────────────────────────────────────────────
    console.log('\n[6] Saving session...');
    const rawState    = await context.storageState();
    const sessionData = {
      meta: {
        capturedAt:  new Date().toISOString(),
        shopifyUser: USERNAME,
        shopHandle:  null,
        checkpoint:  'post-login',
        version:     SESSION_VERSION,
      },
      ...rawState,
    };
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
    const size = fs.statSync(SESSION_FILE).size;
    console.log(`  ✓ Saved ${size} bytes → ${SESSION_FILE}`);
    console.log(`  capturedAt: ${sessionData.meta.capturedAt}`);
    console.log('\n✓ Done! Run: npx playwright test tests/e2e_square_shopify_v2.spec.js --headed --retries=0');

  } catch (err) {
    console.error('\n✗ Failed:', err.message);
    await page.screenshot({ path: 'test-results/capture-error.png', fullPage: true }).catch(() => {});
    console.error('  Screenshot → test-results/capture-error.png');
  } finally {
    await browser.close();
  }
}

main();
