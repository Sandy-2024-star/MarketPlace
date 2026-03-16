// helpers/ShopifySSO.js
//
// All Shopify SSO operations for "Shopify as target" flows.
//
// Method execution sequence: 1 → 2 → 3 → 5 → 6 → 4 → 7
//
//   1. login()              — authenticate at accounts.shopify.com
//   2. navigateToAdmin()    — land on admin store list
//   3. createStore()        — create a dev store named after the source
//   5. navigateSSOUrl()     — hit SSO OAuth URL → Shopify store picker
//   6. navigateMarketplace()— land on shopify.flow.linktoany.com/listings
//   4. selectStore()        — pick the target store from Flow's store list
//   7. saveSession()        — persist storageState with metadata to disk
//
// Entry point: ensureOnMarketplace(page, context, opts)
//   Runs the full sequence. After this, page is on /listings?merchantType=sso
//   ready for any source migration spec to continue.
//
// Usage:
//   const sso = new ShopifySSO(page, context);
//   await sso.ensureOnMarketplace({
//     username:   process.env.SHOPIFY_USERNAME,
//     password:   process.env.SHOPIFY_PASSWORD,
//     storeName:  'Square Store',          // name for the new dev store
//     shopHandle: 'square-store-8921',     // handle to select in Flow
//     ssoUrl:     process.env.SHOPIFY_SSO_URL,
//     flowUrl:    process.env.SHOPIFY_FLOW_URL,
//   });

const path = require('path');
const fs   = require('fs');

const SESSION_FILE    = path.resolve(__dirname, '../tests/UI/auth/.shopify-session.json');
const SESSION_VERSION = 2;
const DEV_STORES_URL  = `https://dev.shopify.com/dashboard/${process.env.SHOPIFY_ORG_ID || '209827653'}/stores`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pollUrl(page, check, label, maxMs = 120000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try { if (check(page.url())) return page.url(); } catch (_) {}
    await sleep(1500);
  }
  throw new Error(`Timeout waiting for ${label}. Last: ${page.url()}`);
}

class ShopifySSO {
  constructor(page, context) {
    this.page    = page;
    this.context = context;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Method 1 — Login at accounts.shopify.com
  // ─────────────────────────────────────────────────────────────────────────
  async login(username, password) {
    console.log('[SSO:1] Login →', username);
    await this.page.goto('https://accounts.shopify.com/login').catch(() => {});
    await sleep(3000);
    await this._waitVerifyClear(30000);

    const emailInput    = this.page.locator('input[type="email"]');
    const passwordInput = this.page.locator('input[type="password"]');
    const continueBtn   = this.page.locator('button').filter({ hasText: /continue|next/i }).first();
    const loginBtn      = this.page.locator('button[type="submit"], button:has-text("Log in")').first();

    // "Choose an account" shortcut
    const accountBtn = this.page.locator(`[role="button"]:has-text("${username}"), li:has-text("${username}")`);
    if (await this.page.getByText('Choose an account').isVisible({ timeout: 3000 }).catch(() => false) &&
        await accountBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  [SSO:1] Choosing account from list');
      await accountBtn.click();
      await sleep(1500);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) { console.log(`  [SSO:1] Retry ${attempt + 1}/3`); await sleep(1000); }

      const onEmail = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (!onEmail) break;

      await emailInput.fill('');
      await emailInput.fill(username);
      await sleep(400);
      await continueBtn.click();
      await sleep(2000);
      await this._waitVerifyClear(90000);

      // Bounced back — retry
      if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        const v = await emailInput.inputValue().catch(() => '');
        if (!v || v !== username) continue;
      }

      // Combined form (email + password visible together)
      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('  [SSO:1] Combined form — filling password');
        if (!await emailInput.inputValue().catch(() => '')) await emailInput.fill(username);
        await passwordInput.fill(password);
        await this.page.locator('button').filter({ hasText: /continue with email|log in/i }).first().click();
        await sleep(2000);
        await this._waitVerifyClear(90000);
        break;
      }

      // 2-step: password on separate screen
      if (await passwordInput.isVisible({ timeout: 15000 }).catch(() => false)) {
        console.log('  [SSO:1] Password step');
        await passwordInput.fill(password);
        await loginBtn.click();
        await sleep(2000);
        await this._waitVerifyClear(90000);
        break;
      }
    }

    // Fallback
    if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordInput.fill(password);
      await loginBtn.click();
    }

    await pollUrl(this.page,
      url => url.includes('accounts.shopify.com/accounts/') ||
             url.includes('accounts.shopify.com/select')    ||
             url.includes('admin.shopify.com'),
      'post-login URL', 60000
    );
    console.log('  [SSO:1] ✓ Logged in:', this.page.url());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Method 2 — Navigate to Shopify admin store list
  // ─────────────────────────────────────────────────────────────────────────
  async navigateToAdmin() {
    console.log('[SSO:2] Navigating to admin store list...');
    await this.page.goto('https://accounts.shopify.com/store-login?no_redirect=true').catch(() => {});
    await this._waitVerifyClear(30000);
    await sleep(2000);

    const accountLink = this.page.locator('a[href*="/select?rid"]').first();
    if (await accountLink.isVisible({ timeout: 8000 }).catch(() => false)) {
      await accountLink.click();
      await sleep(4000);
      await this._waitVerifyClear(30000);
    }
    console.log('  [SSO:2] ✓ Admin URL:', this.page.url());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Method 3 — Create a dev store named after the migration source
  // ─────────────────────────────────────────────────────────────────────────
  async createStore(storeName) {
    console.log(`[SSO:3] Creating dev store: "${storeName}"...`);
    await this.page.goto(DEV_STORES_URL).catch(() => {});
    await this._waitVerifyClear(30000);
    await sleep(3000);

    // Click "Create store" / "Add store" button
    const createBtn = this.page.getByRole('button', { name: /create store|add store|new store/i }).first();
    if (!await createBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      console.log('  [SSO:3] "Create store" button not found — screenshot saved');
      await this.page.screenshot({ path: 'test-results/sso-create-store.png', fullPage: true }).catch(() => {});
      throw new Error('[SSO:3] Could not find "Create store" button');
    }
    await createBtn.click();
    await sleep(2000);

    // Fill store name
    const nameInput = this.page.locator('input[name="storeName"], input[placeholder*="store name" i], input[id*="name" i]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill(storeName);
    console.log(`  [SSO:3] Filled store name: "${storeName}"`);

    // Submit form
    const submitBtn = this.page.getByRole('button', { name: /create|save|submit|next/i }).last();
    await submitBtn.click();
    await sleep(5000);
    await this._waitVerifyClear(30000);

    // Wait until the new store appears in the list
    await pollUrl(this.page,
      url => url.includes('dev.shopify.com') || url.includes('admin.shopify.com') || url.includes('myshopify.com'),
      'post-create redirect', 60000
    );
    console.log('  [SSO:3] ✓ Store created. URL:', this.page.url());
    await this.page.screenshot({ path: 'test-results/sso-after-create.png', fullPage: true }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Method 5 — Navigate to the SSO OAuth URL (→ Shopify store picker)
  // ─────────────────────────────────────────────────────────────────────────
  async navigateSSOUrl(ssoUrl) {
    console.log('[SSO:5] Navigating to SSO URL...');
    await this.page.goto(ssoUrl).catch(() => {});
    await sleep(5000);
    await this._waitVerifyClear(60000);
    console.log('  [SSO:5] ✓ SSO URL resolved:', this.page.url());
    await this.page.screenshot({ path: 'test-results/sso-store-picker.png', fullPage: true }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Method 6 — Navigate to SSO marketplace (shopify.flow.linktoany.com)
  // ─────────────────────────────────────────────────────────────────────────
  async navigateMarketplace(flowUrl) {
    console.log('[SSO:6] Navigating to SSO marketplace...');
    await this.page.goto(flowUrl).catch(() => {});
    await sleep(4000);

    // May redirect to auth/login if session not yet established
    const url = this.page.url();
    if (url.includes('/auth/login') || url.includes('/auth/sso')) {
      console.log('  [SSO:6] Auth redirect — waiting for resolution...');
      await pollUrl(this.page,
        u => u.includes('shopify.flow.linktoany.com') && !u.includes('/auth/'),
        'marketplace/listings', 60000
      );
    }
    console.log('  [SSO:6] ✓ Marketplace URL:', this.page.url());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Method 4 — Select a store from Flow's store list
  // ─────────────────────────────────────────────────────────────────────────
  async selectStore(shopHandle) {
    console.log(`[SSO:4] Selecting store: ${shopHandle}...`);
    const storeLink = this.page.locator(`a[href*="/store/${shopHandle}"]`).first();
    const visible = await storeLink.waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true).catch(() => false);

    if (!visible) {
      await this.page.screenshot({ path: 'test-results/sso-select-store.png', fullPage: true }).catch(() => {});
      throw new Error(`[SSO:4] Store link not found for handle: ${shopHandle}`);
    }

    await storeLink.click();
    await pollUrl(this.page,
      url => url.includes('shopify.flow.linktoany.com/listings'),
      'shopify.flow.linktoany.com/listings', 30000
    );
    await sleep(2000);
    console.log('  [SSO:4] ✓ Landed on:', this.page.url());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Method 7 — Save session (storageState + meta)
  // ─────────────────────────────────────────────────────────────────────────
  async saveSession(shopHandle = null) {
    console.log('[SSO:7] Saving session...');
    const rawState = await this.context.storageState();
    const sessionData = {
      meta: {
        capturedAt:  new Date().toISOString(),
        shopifyUser: process.env.SHOPIFY_USERNAME,
        shopHandle:  shopHandle,
        checkpoint:  shopHandle ? 'post-store' : 'post-login',
        version:     SESSION_VERSION,
      },
      ...rawState,
    };
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
    const size = fs.statSync(SESSION_FILE).size;
    console.log(`  [SSO:7] ✓ Saved ${size} bytes → ${SESSION_FILE}`);
    console.log(`           checkpoint: ${sessionData.meta.checkpoint}, capturedAt: ${sessionData.meta.capturedAt}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ensureOnMarketplace — main orchestrator (sequence: 1→2→3→5→6→4→7)
  //
  // opts: { username, password, storeName, shopHandle, ssoUrl, flowUrl,
  //         skipCreateStore? }
  //   skipCreateStore: true  → skips step 3 (store already exists)
  // ─────────────────────────────────────────────────────────────────────────
  async ensureOnMarketplace(opts) {
    const {
      username,
      password,
      storeName,
      shopHandle,
      ssoUrl,
      flowUrl,
      skipCreateStore = false,
    } = opts;

    await this.login(username, password);           // 1
    await this.navigateToAdmin();                   // 2
    if (!skipCreateStore) {
      await this.createStore(storeName);            // 3
    }
    await this.navigateSSOUrl(ssoUrl);              // 5
    await this.navigateMarketplace(flowUrl);        // 6
    await this.selectStore(shopHandle);             // 4
    await this.saveSession(shopHandle);             // 7
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: poll until Cloudflare verify= clears
  // ─────────────────────────────────────────────────────────────────────────
  async _waitVerifyClear(maxMs = 90000) {
    if (!this.page.url().includes('verify=')) return;
    console.log('  [cf] verify= challenge — waiting...');
    const deadline = Date.now() + maxMs;
    while (this.page.url().includes('verify=') && Date.now() < deadline) {
      await sleep(1500);
    }
    console.log('  [cf] Resolved →', this.page.url());
    await sleep(500);
  }
}

module.exports = { ShopifySSO };
