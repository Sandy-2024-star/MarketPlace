// Page Object Model – Shopify Login
// URL: https://accounts.shopify.com/login

import path from 'path';
import fs from 'fs';
import type { Page, Locator } from '@playwright/test';

const SESSION_FILE = path.resolve(__dirname, '../../tests/UI/auth/.shopify-session.json');

export class ShopifyLoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly continueButton: Locator;
  readonly loginButton: Locator;
  readonly captchaText: Locator;
  readonly turnstile: Locator;

  constructor(page: Page) {
    this.page           = page;
    this.emailInput     = page.locator('input[type="email"]');
    this.passwordInput  = page.locator('input[type="password"]');
    this.continueButton = page.getByRole('button', { name: /continue|next/i });
    this.loginButton    = page.locator('button[type="submit"], button:has-text("Log in")');
    this.captchaText    = page.getByText(/Verify you are human/i);
    this.turnstile      = page.locator('#turnstile-wrapper');
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async handleCaptcha(): Promise<void> {
    if (await this.captchaText.isVisible() || await this.turnstile.isVisible()) {
      console.log('CAPTCHA detected, waiting for manual resolution...');
      await this.emailInput.waitFor({ state: 'visible', timeout: 60000 });
    }
  }

  async waitForVerifyClear(maxMs = 90000): Promise<void> {
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

  async login(username: string, password: string): Promise<void> {
    const accountSelector    = this.page.locator(`[role="button"]:has-text("${username}"), li:has-text("${username}")`);
    const chooseAccountTitle = this.page.getByText('Choose an account');

    await Promise.race([
      chooseAccountTitle.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      this.emailInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
    ]);

    if (await chooseAccountTitle.isVisible() && await accountSelector.isVisible()) {
      await accountSelector.click();
      await this.page.waitForTimeout(1000);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        console.log(`  [login] Retry ${attempt + 1}/3 — back on email page after verify=`);
        await this.page.waitForTimeout(1000);
      }

      const onEmail = await this.emailInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (!onEmail) break;

      await this.emailInput.fill('');
      await this.emailInput.fill(username);
      await this.page.waitForTimeout(500);
      await this.continueButton.click();
      await this.page.waitForTimeout(2000);
      await this.waitForVerifyClear(90000);

      if (await this.emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        const emailVal = await this.emailInput.inputValue().catch(() => '');
        if (!emailVal || emailVal !== username) continue;
      }

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

        if (await this.emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          const emailVal2 = await this.emailInput.inputValue().catch(() => '');
          if (!emailVal2 || emailVal2 !== username) continue;
        }
        return;
      }

      if (await this.passwordInput.isVisible({ timeout: 15000 }).catch(() => false)) {
        await this.passwordInput.fill(password);
        await this.loginButton.click();
        await this.page.waitForTimeout(2000);
        await this.waitForVerifyClear(90000);
        return;
      }
    }

    if (await this.passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.passwordInput.fill(password);
      await this.loginButton.click();
    }
  }

  async ssoSetup(username: string, password: string, ssoUrl: string, shopHandle: string): Promise<void> {
    console.log('[sso] Step 1 — Login at accounts.shopify.com...');
    await this.navigate(process.env.SHOPIFY_URL || 'https://accounts.shopify.com/login');
    await this.page.waitForTimeout(1500);
    await this.handleCaptcha();
    await this.login(username, password);
    await this.page.waitForTimeout(2000);
    console.log('[sso] Post-login URL:', this.page.url());

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

    console.log('[sso] Step 3 — Navigating to SSO URL...');
    await this.page.goto(ssoUrl);
    await this.waitForVerifyClear(30000);
    await this.page.waitForTimeout(5000);
    console.log('[sso] SSO URL resolved to:', this.page.url());

    console.log(`[sso] Step 4 — Selecting store: ${shopHandle}...`);
    const storeLink = this.page.locator(`a[href*="/store/${shopHandle}"]`).first();
    await storeLink.waitFor({ state: 'visible', timeout: 15000 });
    await storeLink.click();

    await this.page.waitForURL(/shopify\.flow\.linktoany\.com/, { timeout: 30000 });
    await this.page.waitForTimeout(3000);
    console.log('[sso] Landed on:', this.page.url());

    console.log('[sso] Step 5 — Saving session...');
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    await this.page.context().storageState({ path: SESSION_FILE });
    const size = fs.statSync(SESSION_FILE).size;
    console.log(`[sso] Saved ${size} bytes → ${SESSION_FILE}`);
    console.log('[sso] ✓ SSO setup complete.');
  }

  async waitForOAuthRedirect(timeout = 30000): Promise<void> {
    await this.page.waitForURL(/admin\.shopify\.com/, { timeout });
  }
}
