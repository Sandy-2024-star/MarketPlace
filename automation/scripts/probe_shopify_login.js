// Probe: Shopify login with full network observation
// Usage: node tests/probe_shopify_login.js
//
// Logs every request/response during login so we can see exactly
// what Cloudflare / Shopify is doing to block or redirect us.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

const USERNAME = process.env.SHOPIFY_USERNAME;
const PASSWORD = process.env.SHOPIFY_PASSWORD;
const sleep    = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('=== Shopify Login Probe ===');
  console.log('Username:', USERNAME);
  console.log('Observing network + page state...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // ── Network observer ───────────────────────────────────────────────────────
  const interesting = /shopify|cloudflare|turnstile|hcaptcha|verify/i;

  page.on('request', req => {
    if (interesting.test(req.url())) {
      console.log(`[REQ]  ${req.method()} ${req.url().substring(0, 120)}`);
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (!interesting.test(url)) return;
    const status = res.status();
    const loc    = res.headers()['location'] || '';
    const flag   = status >= 300 ? ` → ${loc.substring(0, 80)}` : '';
    console.log(`[RES]  ${status} ${url.substring(0, 120)}${flag}`);
  });

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log(`\n[NAV]  ${frame.url()}`);
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[JS-ERR] ${msg.text().substring(0, 100)}`);
    }
  });

  try {
    // ── Step 1: Navigate ───────────────────────────────────────────────────
    console.log('\n── Step 1: goto accounts.shopify.com/login ──');
    await page.goto('https://accounts.shopify.com/login');
    await sleep(4000);
    console.log('URL after goto:', page.url());
    await page.screenshot({ path: 'test-results/probe-1-after-goto.png', fullPage: true });

    // ── Step 2: Fill email ─────────────────────────────────────────────────
    console.log('\n── Step 2: fill email ──');
    const emailInput = page.locator('input[type="email"]').first();
    const emailVisible = await emailInput.isVisible({ timeout: 8000 }).catch(() => false);
    console.log('Email input visible:', emailVisible);

    if (emailVisible) {
      await emailInput.fill(USERNAME);
      await sleep(500);
      console.log('Email filled. URL:', page.url());
      await page.screenshot({ path: 'test-results/probe-2-email-filled.png', fullPage: true });

      // ── Step 3: Click Continue ───────────────────────────────────────────
      console.log('\n── Step 3: click Continue ──');
      const continueBtn = page.locator('button').filter({ hasText: /continue|next/i }).first();
      const btnText = await continueBtn.textContent().catch(() => '?');
      console.log('Continue button text:', btnText?.trim());
      await continueBtn.click();
      await sleep(3000);
      console.log('URL after Continue:', page.url());
      await page.screenshot({ path: 'test-results/probe-3-after-continue.png', fullPage: true });

      // Wait for verify= if present
      if (page.url().includes('verify=')) {
        console.log('\n[CF] verify= detected — waiting up to 90s...');
        const deadline = Date.now() + 90000;
        while (page.url().includes('verify=') && Date.now() < deadline) {
          await sleep(1500);
        }
        console.log('[CF] After verify= clear. URL:', page.url());
        await page.screenshot({ path: 'test-results/probe-3b-after-verify.png', fullPage: true });
      }
    }

    // ── Step 4: Check what's on screen ────────────────────────────────────
    console.log('\n── Step 4: page state ──');
    console.log('URL:', page.url());

    const pwdInput   = page.locator('input[type="password"]').first();
    const pwdVisible = await pwdInput.isVisible({ timeout: 5000 }).catch(() => false);
    const emailAgain = await emailInput.isVisible({ timeout: 1000 }).catch(() => false);

    console.log('Password input visible:', pwdVisible);
    console.log('Email input still visible:', emailAgain);

    // Dump all inputs
    const inputs = await page.locator('input').all();
    console.log(`\nAll inputs on page (${inputs.length}):`);
    for (const inp of inputs) {
      const type  = await inp.getAttribute('type').catch(() => '?');
      const name  = await inp.getAttribute('name').catch(() => '?');
      const id    = await inp.getAttribute('id').catch(() => '?');
      const value = await inp.inputValue().catch(() => '?');
      console.log(`  type=${type} name=${name} id=${id} value=${value.substring(0, 30)}`);
    }

    // Dump all buttons
    const buttons = await page.locator('button').all();
    console.log(`\nAll buttons on page (${buttons.length}):`);
    for (const btn of buttons) {
      const txt  = await btn.textContent().catch(() => '?');
      const type = await btn.getAttribute('type').catch(() => '?');
      const vis  = await btn.isVisible().catch(() => false);
      if (vis) console.log(`  [visible] type=${type} text="${txt?.trim()}"`);
    }

    // ── Step 5: Fill password if visible ──────────────────────────────────
    if (pwdVisible) {
      console.log('\n── Step 5: fill password ──');

      // Fill slowly, character by character (human-like)
      await pwdInput.click();
      await sleep(300);
      for (const ch of PASSWORD) {
        await page.keyboard.type(ch, { delay: 80 });
      }
      await sleep(500);
      console.log('Password typed (char-by-char)');
      await page.screenshot({ path: 'test-results/probe-4-password-filled.png', fullPage: true });

      // ── Step 6: Submit ───────────────────────────────────────────────────
      console.log('\n── Step 6: click Log in ──');
      const loginBtn = page.locator('button[type="submit"]').first();
      const loginBtnText = await loginBtn.textContent().catch(() => '?');
      console.log('Submit button text:', loginBtnText?.trim());

      await loginBtn.click();
      await sleep(3000);
      console.log('URL after submit:', page.url());
      await page.screenshot({ path: 'test-results/probe-5-after-submit.png', fullPage: true });

      // Wait for verify= if present again
      if (page.url().includes('verify=')) {
        console.log('\n[CF] 2nd verify= detected — waiting 90s...');
        const deadline = Date.now() + 90000;
        while (page.url().includes('verify=') && Date.now() < deadline) {
          await sleep(1500);
        }
        console.log('[CF] After 2nd verify= clear. URL:', page.url());
        await page.screenshot({ path: 'test-results/probe-5b-after-verify2.png', fullPage: true });
      }

      // Wait for post-login URL
      console.log('\n── Step 7: waiting for post-login URL (30s) ──');
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const url = page.url();
        if (url.includes('accounts.shopify.com/accounts/') ||
            url.includes('accounts.shopify.com/select')    ||
            url.includes('admin.shopify.com')) {
          console.log('✓ LOGIN SUCCESS:', url);
          await page.screenshot({ path: 'test-results/probe-6-logged-in.png', fullPage: true });
          break;
        }
        await sleep(1500);
      }

      console.log('Final URL:', page.url());
    }

    console.log('\n── Probe complete. Browser stays open for 15s for manual inspection ──');
    console.log('Screenshots saved to test-results/probe-*.png');
    await sleep(15000);

  } catch (err) {
    console.error('\n✗ Error:', err.message);
    await page.screenshot({ path: 'test-results/probe-error.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
