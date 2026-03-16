// helpers/SourceConnector.js
//
// All source-side operations for migration wizard flows.
//
// Responsibilities:
//   1. searchTemplate(templateName)   — search marketplace for a template card
//   2. selectTemplate(templateName)   — click a template card → detail page
//   3. startWizard()                  — click "Get Started" on detail page
//   4. wizardStep1_selectData(types)  — Step 1: tick data type checkboxes
//   5. wizardStep2_connect(source, target, opts) — Step 2: connect source + target accounts
//   6. wizardStep3_validate()         — Step 3: wait for validation to pass
//   7. wizardStep4_settings()         — Step 4: configure settings
//   8. wizardStep5_review()           — Step 5: review summary
//   9. startMigration()               — click "Start Migration"
//
// Source-specific connect helpers (called by wizardStep2_connect):
//   _connectSquare(opts)  — fill accountId → Connect Account → Square OAuth popup
//   _connectShopify()     — SSO pre-authenticated; select from dropdown or popup auto-closes
//
// Usage (Square → Shopify):
//   const src = new SourceConnector(page);
//   await src.searchTemplate('Square to Shopify');
//   await src.selectTemplate('Square to Shopify');
//   await src.startWizard();
//   await src.wizardStep1_selectData(['Customers', 'Products', 'Inventory', 'Orders']);
//   await src.wizardStep2_connect('square', 'shopify', {
//     square: { accountId: process.env.SQUARE_ACCOUNT_ID, username: process.env.SQUARE_USERNAME, password: process.env.SQUARE_PASSWORD },
//   });
//   await src.wizardStep3_validate();
//   await src.wizardStep4_settings();
//   await src.wizardStep5_review();
//   await src.startMigration();

const sleep = ms => new Promise(r => setTimeout(r, ms));

class SourceConnector {
  constructor(page) {
    this.page = page;

    // Shared wizard elements
    this.continueBtn        = page.getByRole('button', { name: /^continue$/i }).first();
    this.startMigrationBtn  = page.getByRole('button', { name: /start migration/i }).first();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. searchTemplate — type in marketplace search box
  // ─────────────────────────────────────────────────────────────────────────
  async searchTemplate(templateName) {
    console.log(`[src:1] Searching template: "${templateName}"`);
    const searchBox = this.page.locator('input[type="search"], input[placeholder*="search" i]').first();
    await searchBox.waitFor({ state: 'visible', timeout: 15000 });
    await searchBox.fill(templateName);
    await sleep(800);
    console.log('  [src:1] ✓ Search submitted');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. selectTemplate — click matching card on marketplace listings
  // ─────────────────────────────────────────────────────────────────────────
  async selectTemplate(templateName) {
    console.log(`[src:2] Opening card: "${templateName}"`);
    const card = this.page
      .locator('[data-testid*="card"], .card, article, .migration-card')
      .filter({ hasText: templateName })
      .first();

    const visible = await card.waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true).catch(() => false);

    if (!visible) {
      // Fallback: any link/button containing the template name
      await this.page.getByRole('link', { name: templateName }).first().click();
    } else {
      await card.click();
    }

    await sleep(1500);
    console.log('  [src:2] ✓ Card opened. URL:', this.page.url());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. startWizard — click "Get Started" on the detail/landing page
  // ─────────────────────────────────────────────────────────────────────────
  async startWizard() {
    console.log('[src:3] Starting wizard...');
    const getStarted = this.page.getByRole('button', { name: /get started/i }).first();
    await getStarted.waitFor({ state: 'visible', timeout: 15000 });
    await getStarted.click();
    await sleep(1500);
    console.log('  [src:3] ✓ Wizard started. URL:', this.page.url());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. wizardStep1_selectData — tick data type checkboxes
  //    types: e.g. ['Customers', 'Products', 'Inventory', 'Orders']
  // ─────────────────────────────────────────────────────────────────────────
  async wizardStep1_selectData(types) {
    console.log('[src:4] Step 1 — Selecting data types:', types.join(', '));
    for (const type of types) {
      const btn = this.page.locator('button').filter({ hasText: type }).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await sleep(200);
        console.log(`  [src:4] Selected: ${type}`);
      } else {
        console.log(`  [src:4] Not found (skip): ${type}`);
      }
    }

    await this._clickContinue('Step 1 → 2');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. wizardStep2_connect — connect source + target systems
  //    source: 'square' | 'woocommerce' | ...
  //    target: 'shopify' (currently only supported target)
  //    opts:
  //      square: { accountId, username, password }
  // ─────────────────────────────────────────────────────────────────────────
  async wizardStep2_connect(source, target, opts = {}) {
    console.log(`[src:5] Step 2 — Connecting ${source} → ${target}...`);
    await this.page.waitForSelector('text=Connect systems', { timeout: 15000 });

    // ── Connect source ────────────────────────────────────────────────────
    if (source === 'square') {
      await this._connectSquare(opts.square || {});
    } else {
      console.log(`  [src:5] No connector implemented for source: ${source}`);
    }

    // ── Connect target ────────────────────────────────────────────────────
    if (target === 'shopify') {
      await this._connectShopify();
    } else {
      console.log(`  [src:5] No connector implemented for target: ${target}`);
    }

    // Wait for Continue to enable
    console.log('  [src:5] Waiting for Continue to enable...');
    for (let i = 0; i < 12; i++) {
      if (await this.continueBtn.isEnabled({ timeout: 2000 }).catch(() => false)) break;
      await sleep(3000);
    }

    await this._clickContinue('Step 2 → 3');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. wizardStep3_validate — wait for validation to pass, then continue
  // ─────────────────────────────────────────────────────────────────────────
  async wizardStep3_validate() {
    console.log('[src:6] Step 3 — Validating...');
    await sleep(3000);

    // Poll for Continue to enable (validation may take time)
    for (let i = 0; i < 20; i++) {
      if (await this.continueBtn.isEnabled({ timeout: 2000 }).catch(() => false)) break;
      console.log(`  [src:6] Waiting for validation... (${(i + 1) * 5}s)`);
      await sleep(5000);
    }

    await this._clickContinue('Step 3 → 4');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. wizardStep4_settings — configure settings, then continue
  // ─────────────────────────────────────────────────────────────────────────
  async wizardStep4_settings() {
    console.log('[src:7] Step 4 — Settings...');
    await sleep(1500);

    // Check if we jumped straight to Review (no settings sub-steps)
    const onReview = await this.page.getByRole('heading', { name: /review/i })
      .isVisible({ timeout: 2000 }).catch(() => false);
    if (onReview) {
      console.log('  [src:7] Already on Review — no settings sub-steps');
      return;
    }

    // Default: accept defaults, click Continue
    await this._clickContinue('Step 4 → 5');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. wizardStep5_review — confirm review page is visible
  // ─────────────────────────────────────────────────────────────────────────
  async wizardStep5_review() {
    console.log('[src:8] Step 5 — Review...');
    await this.page.getByRole('heading', { name: /review/i })
      .waitFor({ state: 'visible', timeout: 15000 });
    const body = (await this.page.locator('body').innerText()).substring(0, 600);
    console.log('  [src:8] Review summary:\n', body);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. startMigration — click "Start Migration" and confirm
  // ─────────────────────────────────────────────────────────────────────────
  async startMigration() {
    console.log('[src:9] Starting migration...');
    await this.startMigrationBtn.waitFor({ state: 'visible', timeout: 10000 });
    await this.startMigrationBtn.click();
    await sleep(5000);
    console.log('  [src:9] ✓ Migration started! URL:', this.page.url());
    const body = (await this.page.locator('body').innerText()).substring(0, 800);
    console.log('  Final page:\n', body);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _connectSquare — Square-specific Step 2 connector
  //   opts: { accountId, username, password }
  // ─────────────────────────────────────────────────────────────────────────
  async _connectSquare(opts) {
    const { accountId, username, password } = opts;
    console.log('  [src:sq] Connecting Square source...');

    const connectNewBtns = this.page.getByRole('button', { name: /connect new account/i });
    await connectNewBtns.first().click();
    await sleep(800);

    // Inline accountId input
    const accountIdInput = this.page.locator('input[placeholder="accountId"]').first();
    await accountIdInput.waitFor({ state: 'visible', timeout: 8000 });
    await accountIdInput.fill(accountId || username || '');
    console.log('  [src:sq] Filled accountId');

    // Click "Connect Account" → expect Square OAuth popup
    const connectBtn = this.page.getByRole('button', { name: 'Connect Account', exact: true }).first();
    const popupPromise = this.page.waitForEvent('popup', { timeout: 20000 }).catch(() => null);
    await connectBtn.click();
    await sleep(1000);

    const popup = await popupPromise;
    if (popup) {
      console.log('  [src:sq] Square OAuth popup:', popup.url());
      await this._doSquareOAuth(popup, username, password);
      if (!popup.isClosed()) {
        await popup.waitForEvent('close', { timeout: 60000 }).catch(() => {});
      }
      console.log('  [src:sq] ✓ Square popup closed');
    } else if (this.page.url().match(/squareup\.com|connect\.squareup\.com/)) {
      console.log('  [src:sq] Main page on Square OAuth');
      await this._doSquareOAuth(this.page, username, password);
      await this.page.waitForURL(/shopify\.flow\.linktoany\.com/, { timeout: 30000 });
    } else {
      console.log('  [src:sq] No popup detected. URL:', this.page.url());
    }

    await sleep(1500);
    await this.page.screenshot({ path: 'test-results/after-square-connect.png', fullPage: true }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _connectShopify — Shopify-specific Step 2 connector
  //   SSO session is pre-loaded — dropdown should auto-populate or popup
  //   auto-closes after Shopify auth resolves.
  // ─────────────────────────────────────────────────────────────────────────
  async _connectShopify() {
    console.log('  [src:sh] Connecting Shopify target (SSO pre-authenticated)...');

    // Try dropdown first
    const selects = await this.page.locator('select').all();
    for (const sel of [...selects].reverse()) {
      const options = await sel.locator('option').all();
      const labels  = await Promise.all(options.map(o => o.textContent()));
      const realIdx = labels.findIndex(l => l && !/select account/i.test(l));
      if (realIdx >= 0) {
        await sel.selectOption({ index: realIdx });
        console.log('  [src:sh] ✓ Selected Shopify from dropdown:', labels[realIdx]);
        return;
      }
    }

    // No dropdown value — click "+ Connect New Account" for Shopify
    const connectNewBtns = this.page.getByRole('button', { name: /connect new account/i });
    const allBtns = await connectNewBtns.all();
    const shopifyBtn = allBtns[allBtns.length - 1];

    if (shopifyBtn) {
      console.log('  [src:sh] Clicking Shopify Connect New Account...');
      const popupPromise = this.page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
      await shopifyBtn.click();
      await sleep(1000);
      const popup = await popupPromise;
      if (popup) {
        console.log('  [src:sh] Shopify popup URL:', popup.url());
        await popup.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
        await sleep(5000); // SSO session auto-authenticates
        console.log('  [src:sh] Shopify popup final URL:', popup.url());
        if (!popup.isClosed()) await popup.close().catch(() => {});
      }
    }

    await sleep(1500);
    await this.page.screenshot({ path: 'test-results/after-shopify-connect.png', fullPage: true }).catch(() => {});
    console.log('  [src:sh] ✓ Shopify connect done');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _doSquareOAuth — complete Square OAuth in any page/popup context
  // ─────────────────────────────────────────────────────────────────────────
  async _doSquareOAuth(ctx, username, password) {
    await ctx.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await sleep(1500);
    await ctx.screenshot({ path: 'test-results/sq-oauth-1.png' }).catch(() => {});

    const sqEmail = ctx.locator('input[type="email"], input[name="email"]').first();
    if (await sqEmail.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sqEmail.fill(username);
      await ctx.getByRole('button', { name: /next|continue|sign in/i }).first().click();
      await sleep(2000);
    }

    const sqPass = ctx.locator('input[type="password"]').first();
    if (await sqPass.isVisible({ timeout: 10000 }).catch(() => false)) {
      await sqPass.fill(password);
      await ctx.getByRole('button', { name: /sign in|log in|next|continue/i }).first().click();
      await sleep(3000);
    }

    // Business/team selector
    const bizBtn = ctx.locator('button, [role="option"]').filter({ hasText: /linktoany|business/i }).first();
    if (await bizBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bizBtn.click();
      await sleep(2000);
    }

    // Allow / Authorize
    const approveBtn = ctx.getByRole('button', { name: /allow|approve|authorize|grant/i }).first();
    if (await approveBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
      await ctx.screenshot({ path: 'test-results/sq-oauth-approve.png' }).catch(() => {});
      await approveBtn.click();
      await sleep(3000);
      console.log('  [src:sq] ✓ OAuth approved');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _clickContinue — click footer Continue button, wait for it to be enabled
  // ─────────────────────────────────────────────────────────────────────────
  async _clickContinue(label) {
    await this.continueBtn.waitFor({ state: 'visible', timeout: 10000 });
    // Wait for enabled state
    for (let i = 0; i < 10; i++) {
      if (await this.continueBtn.isEnabled({ timeout: 1000 }).catch(() => false)) break;
      await sleep(1000);
    }
    await this.continueBtn.click();
    await sleep(2000);
    console.log(`  [src] ✓ Continue clicked (${label})`);
  }
}

module.exports = { SourceConnector };
