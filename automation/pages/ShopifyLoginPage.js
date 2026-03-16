// Page Object Model – Shopify Login
// URL: https://accounts.shopify.com/login  (or /lookup)
//
// 2-step login flow:
//   1. Email step  → fill email → Continue
//   2. Password step → fill password → Log in
//   After login → redirects to admin.shopify.com via OAuth callback
//
// SSO flow (all Shopify-as-target wizard connections):
//   1. Login at accounts.shopify.com
//   2. Navigate to SSO URL → store selector appears
//   3. Click target store → lands on shopify.flow.linktoany.com (Flow marketplace SSO)
//   4. Save storageState — subsequent runs skip login entirely
//
// Cloudflare verify= challenge — auto-polled until resolved (up to 90s per occurrence).
// Retry loop (up to 3x): if verify= brings browser back to email page, re-attempts.

const path = require('path');
const fs   = require('fs');

const SESSION_FILE = path.resolve(__dirname, '../../tests/UI/auth/.shopify-session.json');

class ShopifyLoginPage {
  constructor(page) {
    this.page = page;
    this.emailInput      = page.locator('input[type="email"]');
    this.passwordInput   = page.locator('input[type="password"]');
    this.continueButton  = page.getByRole('button', { name: /continue|next/i });
    this.loginButton     = page.locator('button[type="submit"], button:has-text("Log in")');
    this.captchaText     = page.getByText(/Verify you are human/i);
    this.turnstile       = page.locator('#turnstile-wrapper');
  }

  async navigate(url) {
    await this.page.goto(url);
  }

  /** If Cloudflare Turnstile CAPTCHA is present, wait for manual resolution. */
  async handleCaptcha() {
    if (await this.captchaText.isVisible() || await this.turnstile.isVisible()) {
      console.log('CAPTCHA detected, waiting for manual resolution...');
      await this.emailInput.waitFor({ state: 'visible', timeout: 60000 });
    }
  }

  /**
   * Poll until the current URL no longer contains 'verify=' (Cloudflare JS challenge).
   * The stealth plugin resolves the challenge automatically — this just waits for it.
   */
  async waitForVerifyClear(maxMs = 90000) {
    if (!this.page.url().includes('verify=')) return;
    console.log('  [verify=] Cloudflare challenge — waiting for resolution...');
    const deadline = Date.now() + maxMs;
    while (this.page.url().includes('verify=') && Date.now() < deadline) {
      await this.page.waitForTimeout(1500);
    }
    if (this.page.url().includes('verify=')) {
      console.log('  [verify=] Timed out — continuing');
    } else {
      console.log('  [verify=] Resolved →', this.page.url());
    }
    await this.page.waitForTimeout(500);
  }

  /**
   * Full Shopify login at accounts.shopify.com.
   * Retries up to 3x if Cloudflare verify= loops browser back to the email page.
   * @param {string} username  Email address
   * @param {string} password
   */
  async login(username, password) {
    const accountSelector    = this.page.locator(`[role="button"]:has-text("${username}"), li:has-text("${username}")`);
    const chooseAccountTitle = this.page.getByText('Choose an account');

    await Promise.race([
      chooseAccountTitle.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      this.emailInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
    ]);

    // "Choose an account" screen — select the matching account
    if (await chooseAccountTitle.isVisible() && await accountSelector.isVisible()) {
      await accountSelector.click();
      await this.page.waitForTimeout(1000);
    }

    // Retry loop: Cloudflare verify= may resolve back to the email page
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        console.log(`  [login] Retry ${attempt + 1}/3 — back on email page after verify=`);
        await this.page.waitForTimeout(1000);
      }

      const onEmail = await this.emailInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (!onEmail) break; // Already past email step

      // Fill email (clear first — may be pre-populated with wrong value after verify= return)
      await this.emailInput.fill('');
      await this.emailInput.fill(username);
      await this.page.waitForTimeout(500);

      // Click Continue
      await this.continueButton.click();
      await this.page.waitForTimeout(2000);

      // Wait for any Cloudflare verify= to clear
      await this.waitForVerifyClear(90000);

      // If looped back to empty email page — retry
      if (await this.emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        const emailVal = await this.emailInput.inputValue().catch(() => '');
        if (!emailVal || emailVal !== username) continue;
      }

      // Combined form: email + password both visible after verify= resolved
      const pwdVisible = await this.passwordInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (pwdVisible) {
        const emailVal = await this.emailInput.inputValue().catch(() => '');
        if (!emailVal) await this.emailInput.fill(username);
        console.log('  [login] Combined form — filling password');
        await this.passwordInput.fill(password);
        const submitBtn = this.page.getByRole('button', { name: /continue with email|log in/i }).first();
        await submitBtn.click();
        await this.page.waitForTimeout(2000);
        await this.waitForVerifyClear(90000);

        // If looped back — retry
        if (await this.emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          const emailVal2 = await this.emailInput.inputValue().catch(() => '');
          if (!emailVal2 || emailVal2 !== username) continue;
        }
        return;
      }

      // Password step (2-step flow)
      if (await this.passwordInput.isVisible({ timeout: 15000 }).catch(() => false)) {
        await this.passwordInput.fill(password);
        await this.loginButton.click();
        await this.page.waitForTimeout(2000);
        await this.waitForVerifyClear(90000);
        return;
      }
    }

    // Final fallback
    if (await this.passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.passwordInput.fill(password);
      await this.loginButton.click();
    }
  }

  /**
   * SSO flow — used for ALL Shopify-as-target wizard connections.
   *
   * Flow:
   *   1. Login at accounts.shopify.com
   *   2. Navigate to store-login → choose account
   *   3. Navigate to SSO OAuth URL (admin.shopify.com → Flow marketplace app)
   *   4. Select the target store
   *   5. Land on shopify.flow.linktoany.com — save session to disk
   *
   * Saved session: tests/auth/.shopify-session.json
   * Subsequent runs load the saved session and skip this entire flow.
   *
   * @param {string} username      Shopify email
   * @param {string} password      Shopify password
   * @param {string} ssoUrl        SHOPIFY_SSO_URL from .env
   * @param {string} shopHandle    e.g. 'square-store-8921'
   */
  async ssoSetup(username, password, ssoUrl, shopHandle) {
    // ── 1. Login ──────────────────────────────────────────────────────────────
    console.log('[sso] Step 1 — Login at accounts.shopify.com...');
    await this.navigate(process.env.SHOPIFY_URL || 'https://accounts.shopify.com/login');
    await this.page.waitForTimeout(1500);
    await this.handleCaptcha();
    await this.login(username, password);
    await this.page.waitForTimeout(2000);
    console.log('[sso] Post-login URL:', this.page.url());

    // ── 2. store-login → "Choose an account" ─────────────────────────────────
    console.log('[sso] Step 2 — Navigating to store-login...');
    await this.page.goto('https://accounts.shopify.com/store-login?no_redirect=true');
    await this.waitForVerifyClear(30000);
    await this.page.waitForTimeout(2000);

    const accountLink = this.page.locator('a[href*="/select?rid"]').first();
    if (await accountLink.isVisible({ timeout: 8000 }).catch(() => false)) {
      await accountLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForVerifyClear(30000);
      console.log('[sso] Store list URL:', this.page.url());
    }

    // ── 3. SSO OAuth URL ──────────────────────────────────────────────────────
    console.log('[sso] Step 3 — Navigating to SSO URL...');
    await this.page.goto(ssoUrl);
    await this.waitForVerifyClear(30000);
    await this.page.waitForTimeout(5000);
    console.log('[sso] SSO URL resolved to:', this.page.url());

    // ── 4. Select target store ────────────────────────────────────────────────
    console.log(`[sso] Step 4 — Selecting store: ${shopHandle}...`);
    const storeLink = this.page.locator(`a[href*="/store/${shopHandle}"]`).first();
    await storeLink.waitFor({ state: 'visible', timeout: 15000 });
    await storeLink.click();

    await this.page.waitForURL(/shopify\.flow\.linktoany\.com/, { timeout: 30000 });
    await this.page.waitForTimeout(3000);
    console.log('[sso] Landed on:', this.page.url());

    // ── 5. Save session ───────────────────────────────────────────────────────
    console.log('[sso] Step 5 — Saving session...');
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    await this.page.context().storageState({ path: SESSION_FILE });
    const size = fs.statSync(SESSION_FILE).size;
    console.log(`[sso] Saved ${size} bytes → ${SESSION_FILE}`);
    console.log('[sso] ✓ SSO setup complete.');
  }

  /**
   * Wait for post-login OAuth redirect to admin.shopify.com to complete.
   * @param {number} timeout  ms to wait (default 30s)
   */
  async waitForOAuthRedirect(timeout = 30000) {
    await this.page.waitForURL(/admin\.shopify\.com/, { timeout });
  }
}

module.exports = { ShopifyLoginPage };
