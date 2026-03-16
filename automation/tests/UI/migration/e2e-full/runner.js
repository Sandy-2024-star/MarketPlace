// Generic E2E Migration Runner
//
// Orchestrates a full wizard run for any migration in migrations.config.js.
// Branch logic at Step 2 and Step 3 is driven by config.type + config.targetType.
//
// Supported today:
//   Phase 1 — type: 'file' + targetType: 'lsr'                          → fully functional
//   Phase 2 — type: 'file' + targetType: 'shopify'                      → fully functional
//   Phase 3 — type: 'file' + targetType: clover|qbo|xero|hubspot|salesforce → generic OAuth handler
//   Phase 4 — type: 'api'  + sourceType: bigcommerce|clover|cin7omni|stripe  → credential inputs
//                           + sourceType: hubspot|qbo|xero|salesforce|square|dynamics|zohocrm → OAuth popup
//                           + targetType: cin7core|chargebee                 → credential inputs
//
// BLOCKED (lsr-series sources fail Cloudflare verification — skip in config)
//
// Usage:
//   const { runE2eMigration } = require('./runner');
//   await runE2eMigration(page, migrationConfig);

const path = require('path');
const MigrationDetailPage  = require('../../../../pages/MigrationDetailPage');
const MigrationWizardPage  = require('../../../../pages/MigrationWizardPage');
const { ShopifyLoginPage } = require('../../../../pages/ShopifyLoginPage');
const config_utils         = require('../../../../utils/config');
const { withRetry }        = require('../../../../utils/retry');

// ─── Env credentials per target type ────────────────────────────────────────

const CREDS = {
  // ── Destinations (Phase 1-3) ──────────────────────────────────────────────
  lsr: {
    domain:   process.env.LSR_DOMAIN    || 'linkprod01',
    email:    process.env.LSR_EMAIL     || process.env.USERNAME,
    password: process.env.LSR_PASSWORD  || process.env.PASSWORD,
  },
  shopify: {
    shop:     process.env.SHOPIFY_SHOP,
    email:    process.env.SHOPIFY_USERNAME,
    password: process.env.SHOPIFY_PASSWORD,
  },
  clover: {
    email:    process.env.CLOVER_EMAIL,
    password: process.env.CLOVER_PASSWORD,
  },
  qbo: {
    email:    process.env.QBO_EMAIL,
    password: process.env.QBO_PASSWORD,
  },
  xero: {
    email:    process.env.XERO_EMAIL,
    password: process.env.XERO_PASSWORD,
  },
  hubspot: {
    email:    process.env.HUBSPOT_EMAIL,
    password: process.env.HUBSPOT_PASSWORD,
  },
  salesforce: {
    email:    process.env.SALESFORCE_EMAIL,
    password: process.env.SALESFORCE_PASSWORD,
  },

  // ── API Sources (Phase 4) ─────────────────────────────────────────────────
  bigcommerce: {
    storeHash:    process.env.BIGCOMMERCE_STORE_HASH,
    accessToken:  process.env.BIGCOMMERCE_ACCESS_TOKEN,
  },
  // Clover as source uses merchant ID + API token (different from Clover as destination)
  'clover-src': {
    merchantId:   process.env.CLOVER_MERCHANT_ID,
    accessToken:  process.env.CLOVER_ACCESS_TOKEN,
  },
  cin7omni: {
    username:     process.env.CIN7OMNI_USERNAME,
    password:     process.env.CIN7OMNI_PASSWORD,
  },
  cin7core: {
    username:     process.env.CIN7CORE_USERNAME,
    password:     process.env.CIN7CORE_PASSWORD,
  },
  stripe: {
    apiKey:       process.env.STRIPE_API_KEY,
  },
  chargebee: {
    site:         process.env.CHARGEBEE_SITE,
    apiKey:       process.env.CHARGEBEE_API_KEY,
  },
  // OAuth-based API sources — reuse email/password from matching target CREDS
  // (same account used for both source connect and destination connect)
  square:      { email: process.env.SQUARE_EMAIL,     password: process.env.SQUARE_PASSWORD },
  dynamics:    { email: process.env.DYNAMICS_EMAIL,   password: process.env.DYNAMICS_PASSWORD },
  zohocrm:     { email: process.env.ZOHOCRM_EMAIL,    password: process.env.ZOHOCRM_PASSWORD },
  // hubspot / qbo / xero / salesforce as SOURCE re-use the same CREDS as destination above
};

// ─── Step detection helpers ──────────────────────────────────────────────────

/**
 * After clicking Continue, wait to see which wizard step appears next.
 * Returns one of: 'upload' | 'connect-source' | 'connect-dest' | 'settings' | 'review' | 'unknown'
 */
async function detectNextStep(page, wizard) {
  const TIMEOUT = 20000;
  const checks = [
    { key: 'review',         loc: wizard.step5ReviewHeading },
    { key: 'settings',       loc: wizard.step4SettingsHeading },
    { key: 'connect-dest',   loc: wizard.step3ConnectHeading },
    { key: 'connect-source', loc: wizard.step2ApiHeading },
    { key: 'upload',         loc: wizard.step2FileHeading },
  ];

  // Race all heading locators
  const result = await Promise.race(
    checks.map(({ key, loc }) =>
      loc.waitFor({ state: 'visible', timeout: TIMEOUT })
        .then(() => key)
        .catch(() => null)
    )
  ).catch(() => null);

  const found = result || 'unknown';
  console.log(`[runner] Detected step: ${found}`);
  return found;
}

// ─── Step 2 handlers ─────────────────────────────────────────────────────────

/**
 * File-based Step 2: upload CSV files for each selected data type.
 * Single-type → uploadFileAndConfirm; multi-type → uploadFileForType per entry.
 */
async function handleFileUpload(page, wizard, config) {
  console.log(`[runner] Step 2 — File upload (${config.dataTypes.length} type(s))`);
  await wizard.step2FileHeading.waitFor({ state: 'visible', timeout: 20000 });

  if (config.dataTypes.length === 1) {
    const [type] = config.dataTypes;
    const filePath = config.csvFiles[type];
    if (!filePath) throw new Error(`[runner] No CSV mapped for type "${type}"`);
    await wizard.uploadFileAndConfirm(filePath);
  } else {
    // Multi-type: set each file via file chooser, then click Confirm once after all are set.
    // Use /^(Upload|Browse)$/i so we handle both button labels (varies by migration).
    for (const type of config.dataTypes) {
      const filePath = config.csvFiles[type];
      if (!filePath) {
        console.log(`[runner]   ⚠ No CSV for "${type}" — skipping`);
        continue;
      }
      const fs   = require('fs');
      const path = require('path');
      const size = fs.existsSync(filePath) ? `${(fs.statSync(filePath).size / 1024).toFixed(1)} KB` : 'not found';
      console.log(`[runner]   Uploading ${type} — ${path.basename(filePath)} (${size})`);

      // Strategy 1: find a section with an Upload button and use the filechooser event
      // (works for QB POS / Shopify style where button name is "Upload").
      // Strategy 2: find <input type="file"> by index position (works for GreenLine POS
      // where sections use a native "Choose File" input + decorative "Browse" label).
      //
      // Try the section+filechooser approach first; if no matching section found, fall
      // back to nth file input indexed by data type order.

      const typeIndex = config.dataTypes.indexOf(type);
      const sectionWithUpload = page.locator('div').filter({
        hasText: new RegExp(type, 'i'),
        has: page.getByRole('button', { name: /^Upload$/i }),
      }).last();
      const hasUploadBtn = await sectionWithUpload.count().then(n => n > 0).catch(() => false);

      if (hasUploadBtn) {
        const uploadBtn = sectionWithUpload.getByRole('button', { name: /^Upload$/i }).first();
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          uploadBtn.click(),
        ]);
        await fileChooser.setFiles(filePath);
        console.log(`[runner]   ✓ ${type} file set (via Upload button)`);
      } else {
        // Native file input approach — input[type="file"] indexed by data type order
        const fileInputs = page.locator('input[type="file"]');
        const inputCount = await fileInputs.count();
        if (inputCount > typeIndex) {
          await fileInputs.nth(typeIndex).setInputFiles(filePath);
          console.log(`[runner]   ✓ ${type} file set (via input[${typeIndex}])`);
        } else {
          // Last resort: click any "Choose File" button in a section matching the type
          const section = page.locator('div').filter({ hasText: new RegExp(type, 'i') }).last();
          const chooseBtn = section.getByRole('button', { name: /choose file/i }).first();
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 10000 }),
            chooseBtn.click(),
          ]);
          await fileChooser.setFiles(filePath);
          console.log(`[runner]   ✓ ${type} file set (via Choose File button)`);
        }
      }
      await page.waitForTimeout(1000);
    }

    // Click "Confirm Files & Start Processing" once all files are staged
    const confirmVisible = await wizard.confirmFilesButton.isVisible({ timeout: 10000 }).catch(() => false);
    if (confirmVisible) {
      await wizard.confirmFilesButton.click();
      console.log('[runner] ✓ Confirm Files clicked — waiting for processing...');
    } else {
      console.log('[runner] ⚠ Confirm button not found — checking if Continue already enabled');
    }
  }

  // Wait for Continue to enable (all files processed)
  console.log('[runner] Waiting for all files to process...');
  for (let i = 0; i < 36; i++) {
    if (await wizard.continueButton.isEnabled({ timeout: 1000 }).catch(() => false)) break;
    console.log(`[runner]   Polling... ${(i + 1) * 5}s`);
    await page.waitForTimeout(5000);
  }

  await wizard.continueButton.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  // Wait for the upload heading to disappear so the SPA transition is complete
  // before detectNextStep races all headings (avoids false 'upload' detection).
  await wizard.step2FileHeading.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  console.log('[runner] ✓ Step 2 done — moved to step 3');
}

/**
 * Open an OAuth popup for a source system and complete login.
 * Shared by OAuth-based API sources (HubSpot, QBO, Xero, Salesforce, Square, Dynamics, ZohoCRM).
 */
async function connectOAuthSource(page, sourceType, email, password) {
  console.log(`[runner] Step 2 — OAuth source connect: ${sourceType}`);
  const waitVis = (loc, ms) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);

  const connectBtns = page.getByRole('button', { name: /connect account/i });
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    connectBtns.first().click(),
  ]);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  console.log(`[runner]   ${sourceType} popup URL: ${popup.url()}`);

  if (email && password) {
    const emailInput = popup.locator('input[type="email"]')
      .or(popup.locator('input[type="text"]').first()).first();
    if (await waitVis(emailInput, 10000)) {
      await emailInput.fill(email);
      const nextBtn = popup.getByRole('button', { name: /continue|next|sign in|log in/i }).first();
      if (await waitVis(nextBtn, 3000)) { await nextBtn.click(); await popup.waitForTimeout(1000); }
    }
    const passwordInput = popup.locator('input[type="password"]').first();
    if (await waitVis(passwordInput, 8000)) {
      await passwordInput.fill(password);
      const signInBtn = popup.getByRole('button', { name: /sign in|log in|continue/i }).first();
      if (await waitVis(signInBtn, 3000)) { await signInBtn.click(); await popup.waitForTimeout(2000); }
    }
  }

  const approveBtn = popup.getByRole('button', { name: /approve|allow|authorize|accept|grant/i }).first();
  if (await approveBtn.isVisible({ timeout: 12000 }).catch(() => false)) {
    await approveBtn.scrollIntoViewIfNeeded();
    await approveBtn.click();
    await popup.waitForTimeout(1500);
  }
  if (!popup.isClosed()) await popup.waitForEvent('close', { timeout: 60000 });
  console.log(`[runner]   ✓ ${sourceType} OAuth popup closed`);
  await page.waitForTimeout(1500);
}

/**
 * API-based Step 2: connect source (and possibly destination on the same screen).
 *
 * For most API-based migrations, BOTH source and destination credentials appear on
 * Step 2 ("Connect systems"). After connecting the source, this function checks for
 * a destination shop/domain input on the same screen and connects it too, so that
 * Continue becomes enabled before we proceed.
 */
async function handleSourceConnect(page, wizard, config) {
  console.log(`[runner] Step 2 — API connect (source: ${config.sourceType}, target: ${config.targetType})`);
  await wizard.step2ApiHeading.waitFor({ state: 'visible', timeout: 20000 });

  // ── Connect source ────────────────────────────────────────────────────────
  switch (config.sourceType) {

    case 'bigcommerce': {
      const { storeHash, accessToken } = CREDS.bigcommerce;
      if (!storeHash || !accessToken) throw new Error('[runner] Missing BIGCOMMERCE_STORE_HASH / BIGCOMMERCE_ACCESS_TOKEN');
      await wizard.storeHashInput.fill(storeHash);
      await wizard.accessTokenInput.fill(accessToken);
      await page.getByRole('button', { name: /connect account/i }).first().click();
      await page.waitForTimeout(1500);
      break;
    }

    case 'clover': {
      const { merchantId, accessToken } = CREDS['clover-src'];
      if (!merchantId || !accessToken) throw new Error('[runner] Missing CLOVER_MERCHANT_ID / CLOVER_ACCESS_TOKEN');
      // Clover uses merchantId + accessToken inputs (placeholder names may vary)
      const merchantInput = page.getByPlaceholder(/merchant.*id|merchantid/i)
        .or(page.getByPlaceholder('storeHash')).first();
      const tokenInput = page.getByPlaceholder(/access.*token|accessToken/i).first();
      await merchantInput.fill(merchantId);
      await tokenInput.fill(accessToken);
      await page.getByRole('button', { name: /connect account/i }).first().click();
      await page.waitForTimeout(1500);
      break;
    }

    case 'cin7omni': {
      const { username, password } = CREDS.cin7omni;
      if (!username || !password) throw new Error('[runner] Missing CIN7OMNI_USERNAME / CIN7OMNI_PASSWORD');
      const userInput = page.getByPlaceholder(/username|email/i).first();
      const passInput = page.locator('input[type="password"]').first();
      await userInput.fill(username);
      await passInput.fill(password);
      await page.getByRole('button', { name: /connect account/i }).first().click();
      await page.waitForTimeout(1500);
      break;
    }

    case 'stripe': {
      const { apiKey } = CREDS.stripe;
      if (!apiKey) throw new Error('[runner] Missing STRIPE_API_KEY');
      const keyInput = page.getByPlaceholder(/api.*key|apiKey|secret/i)
        .or(page.getByPlaceholder('accessToken')).first();
      await keyInput.fill(apiKey);
      await page.getByRole('button', { name: /connect account/i }).first().click();
      await page.waitForTimeout(1500);
      break;
    }

    // OAuth-based sources — open popup, login, approve
    case 'hubspot':
      await connectOAuthSource(page, 'hubspot', CREDS.hubspot.email, CREDS.hubspot.password);
      break;
    case 'qbo':
      await connectOAuthSource(page, 'qbo', CREDS.qbo.email, CREDS.qbo.password);
      break;
    case 'xero':
      await connectOAuthSource(page, 'xero', CREDS.xero.email, CREDS.xero.password);
      break;
    case 'salesforce':
      await connectOAuthSource(page, 'salesforce', CREDS.salesforce.email, CREDS.salesforce.password);
      break;
    case 'square':
      await connectOAuthSource(page, 'square', CREDS.square.email, CREDS.square.password);
      break;
    case 'dynamics':
      await connectOAuthSource(page, 'dynamics', CREDS.dynamics.email, CREDS.dynamics.password);
      break;
    case 'zohocrm':
      await connectOAuthSource(page, 'zohocrm', CREDS.zohocrm.email, CREDS.zohocrm.password);
      break;

    default:
      throw new Error(`[runner] Source type "${config.sourceType}" not yet implemented — add handler in runner.js`);
  }

  // ── Connect destination on same Step 2 screen (if present) ───────────────
  // For migrations like BigCommerce→Shopify the destination shop input is on Step 2.
  // Check for each known destination input and connect it.
  const shopInput = wizard.shopInput; // placeholder='shop'
  if (await shopInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    const shop = CREDS.shopify.shop;
    if (!shop) throw new Error('[runner] Missing SHOPIFY_SHOP for Step 2 destination');
    await shopInput.fill(shop);
    const allConnectBtns = page.getByRole('button', { name: /connect account/i });
    await allConnectBtns.last().click();
    await page.waitForTimeout(1500);
    console.log(`[runner]   ✓ Destination Shopify shop connected on Step 2`);
  }

  // ── Wait for Continue ─────────────────────────────────────────────────────
  console.log('[runner] Waiting for Step 2 Continue to enable...');
  for (let i = 0; i < 12; i++) {
    if (await wizard.continueButton.isEnabled({ timeout: 1000 }).catch(() => false)) break;
    await page.waitForTimeout(2500);
  }
  await wizard.continueButton.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await wizard.step2ApiHeading.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  console.log('[runner] ✓ Step 2 done — API connections complete');
}

// ─── Step 3 handlers ─────────────────────────────────────────────────────────

/**
 * Generic OAuth destination connect (Phase 3 targets: Clover, QBO, Xero, HubSpot, Salesforce).
 * These targets open an OAuth popup without a domain prefix input on the wizard side.
 * Flow:
 *   A) Continue already enabled → skip
 *   B) Existing account card → select
 *   C) Click Connect → popup → email → password → Approve
 * @param {string} targetType  used only for logging
 */
async function connectOAuthDestination(page, wizard, targetType, email, password) {
  console.log(`[runner] Step 3 — Connecting ${targetType} destination`);

  // Case A
  if (await wizard.continueButton.isEnabled({ timeout: 2000 }).catch(() => false)) {
    console.log('[runner] Step 3 — Already connected, skipping');
    return;
  }

  // Case B: existing account card (any button containing Connected or the email)
  const connectedCard = page.locator('button').filter({ hasText: /Connected/i }).first();
  if (await connectedCard.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    console.log(`[runner] Step 3 — Found existing ${targetType} account card, selecting...`);
    await connectedCard.click();
    await page.waitForTimeout(500);
    if (await wizard.continueButton.isEnabled({ timeout: 5000 }).catch(() => false)) {
      console.log(`[runner] ✓ Step 3 — ${targetType} account selected, Continue enabled`);
      return;
    }
  }

  // Case C: OAuth popup
  console.log(`[runner] Step 3 — No existing account, starting ${targetType} OAuth...`);
  const connectBtn = page.getByRole('button', { name: /connect account|connect/i }).first();
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    connectBtn.click(),
  ]);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  console.log(`[runner] Step 3 — ${targetType} popup URL: ${popup.url()}`);

  if (email && password) {
    const waitVis = (loc, ms) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);

    // Email / username step
    const emailInput = popup.locator('input[type="email"]')
      .or(popup.locator('input[type="text"]').first())
      .or(popup.getByPlaceholder(/email|username/i).first())
      .first();
    if (await waitVis(emailInput, 10000)) {
      await emailInput.fill(email);
      const nextBtn = popup.getByRole('button', { name: /continue|next|sign in|log in/i }).first();
      if (await waitVis(nextBtn, 3000)) {
        await nextBtn.click();
        await popup.waitForTimeout(1000);
      }
    }

    // Password step (may already be on same page or appear after email)
    const passwordInput = popup.locator('input[type="password"]').first();
    if (await waitVis(passwordInput, 8000)) {
      await passwordInput.fill(password);
      const signInBtn = popup.getByRole('button', { name: /sign in|log in|continue/i }).first();
      if (await waitVis(signInBtn, 3000)) {
        await signInBtn.click();
        await popup.waitForTimeout(2000);
      }
    }
  }

  // Approve / Allow / Install
  const approveBtn = popup.getByRole('button', { name: /approve|allow|install|authorize|accept/i }).first();
  if (await approveBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
    console.log(`[runner] Step 3 — Approving ${targetType} OAuth...`);
    await approveBtn.scrollIntoViewIfNeeded();
    await popup.waitForTimeout(300);
    await approveBtn.click();
    await popup.waitForTimeout(2000);
  } else {
    console.log(`[runner] Step 3 — No Approve button found. Popup URL: ${popup.url()}`);
  }

  if (!popup.isClosed()) {
    await popup.waitForEvent('close', { timeout: 60000 });
  }
  console.log(`[runner] ✓ Step 3 — ${targetType} OAuth popup closed`);
  await page.waitForTimeout(2000);
}

/**
 * Connect Shopify as destination (Step 3, file-based migrations).
 * Cases:
 *   A) Continue already enabled → skip
 *   B) Existing account card for this shop → select it
 *   C) OAuth flow: fill shop input → popup → Shopify login → Approve
 */
async function connectShopifyDestination(page, wizard, shop, email, password) {
  console.log(`[runner] Step 3 — Connecting Shopify destination: ${shop}`);

  // Case A: already connected and selected
  if (await wizard.continueButton.isEnabled({ timeout: 2000 }).catch(() => false)) {
    console.log('[runner] Step 3 — Already connected (Continue enabled), skipping');
    return;
  }

  // Case B: previously-connected account card
  const accountCard = page.locator('button').filter({ hasText: new RegExp(shop, 'i') }).first();
  if (await accountCard.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    console.log(`[runner] Step 3 — Found existing Shopify account card, selecting...`);
    await accountCard.click();
    await page.waitForTimeout(500);
    if (await wizard.continueButton.isEnabled({ timeout: 5000 }).catch(() => false)) {
      console.log('[runner] ✓ Step 3 — Shopify account selected, Continue enabled');
      return;
    }
  }

  // Case C: fill shop input + OAuth popup
  console.log(`[runner] Step 3 — No existing account, starting Shopify OAuth...`);
  const shopInput = wizard.shopDestinationInput;
  if (await shopInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await shopInput.fill(shop);
    await page.waitForTimeout(300);
  }

  const connectBtn = page.getByRole('button', { name: /connect account/i }).first();
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    connectBtn.click(),
  ]);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  console.log(`[runner] Step 3 — Shopify popup URL: ${popup.url()}`);

  if (email && password) {
    const shopifyLogin = new ShopifyLoginPage(popup);
    await shopifyLogin.login(email, password);
  }

  // Approve OAuth installation
  const approveBtn = popup.getByRole('button', { name: /install app|approve|authorize/i }).first();
  if (await approveBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
    console.log('[runner] Step 3 — Approving Shopify OAuth installation...');
    await approveBtn.scrollIntoViewIfNeeded();
    await popup.waitForTimeout(300);
    await approveBtn.click();
    await popup.waitForTimeout(2000);
  } else {
    console.log('[runner] Step 3 — No Approve button found. Popup URL:', popup.url());
  }

  if (!popup.isClosed()) {
    await popup.waitForEvent('close', { timeout: 60000 });
  }
  console.log('[runner] ✓ Step 3 — Shopify OAuth popup closed');
  await page.waitForTimeout(2000);
}

/**
 * Connect destination account.
 * Dispatches based on config.targetType.
 */
async function handleDestConnect(page, wizard, config) {
  console.log(`[runner] Step 3 — Destination connect (${config.targetType})`);

  switch (config.targetType) {
    case 'lsr': {
      const { domain, email, password } = CREDS.lsr;
      if (!domain || !email || !password) throw new Error('[runner] Missing LSR credentials in .env (LSR_DOMAIN, LSR_EMAIL, LSR_PASSWORD)');
      await wizard.connectDestinationAccount(domain, email, password);
      await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log('[runner] ✓ Step 3 done — LSR connected');
      break;
    }

    case 'shopify': {
      const { shop, email, password } = CREDS.shopify;
      if (!shop) throw new Error('[runner] Missing SHOPIFY_SHOP in .env');
      await connectShopifyDestination(page, wizard, shop, email, password);
      await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log('[runner] ✓ Step 3 done — Shopify connected');
      break;
    }

    case 'clover': {
      const { email, password } = CREDS.clover;
      if (!email) throw new Error('[runner] Missing CLOVER_EMAIL in .env');
      await connectOAuthDestination(page, wizard, 'clover', email, password);
      await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log('[runner] ✓ Step 3 done — Clover connected');
      break;
    }

    case 'qbo': {
      const { email, password } = CREDS.qbo;
      if (!email) throw new Error('[runner] Missing QBO_EMAIL in .env');
      await connectOAuthDestination(page, wizard, 'qbo', email, password);
      await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log('[runner] ✓ Step 3 done — QuickBooks Online connected');
      break;
    }

    case 'xero': {
      const { email, password } = CREDS.xero;
      if (!email) throw new Error('[runner] Missing XERO_EMAIL in .env');
      await connectOAuthDestination(page, wizard, 'xero', email, password);
      await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log('[runner] ✓ Step 3 done — Xero connected');
      break;
    }

    case 'hubspot': {
      const { email, password } = CREDS.hubspot;
      if (!email) throw new Error('[runner] Missing HUBSPOT_EMAIL in .env');
      await connectOAuthDestination(page, wizard, 'hubspot', email, password);
      await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log('[runner] ✓ Step 3 done — HubSpot connected');
      break;
    }

    case 'salesforce': {
      const { email, password } = CREDS.salesforce;
      if (!email) throw new Error('[runner] Missing SALESFORCE_EMAIL in .env');
      await connectOAuthDestination(page, wizard, 'salesforce', email, password);
      await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log('[runner] ✓ Step 3 done — Salesforce connected');
      break;
    }

    case 'cin7core': {
      const { username, password } = CREDS.cin7core;
      if (!username) throw new Error('[runner] Missing CIN7CORE_USERNAME in .env');
      await connectOAuthDestination(page, wizard, 'cin7core', username, password);
      await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log('[runner] ✓ Step 3 done — Cin7 Core connected');
      break;
    }

    case 'chargebee': {
      const { site, apiKey } = CREDS.chargebee;
      if (!site || !apiKey) throw new Error('[runner] Missing CHARGEBEE_SITE / CHARGEBEE_API_KEY in .env');
      // Chargebee Step 3 uses a site+apiKey form (not OAuth popup)
      const siteInput  = page.getByPlaceholder(/site|domain/i).or(page.getByPlaceholder('storeHash')).first();
      const keyInput   = page.getByPlaceholder(/api.*key|apiKey/i).or(page.getByPlaceholder('accessToken')).first();
      await siteInput.fill(site);
      await keyInput.fill(apiKey);
      await page.getByRole('button', { name: /connect account/i }).first().click();
      await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log('[runner] ✓ Step 3 done — Chargebee connected');
      break;
    }

    default:
      throw new Error(`[runner] Target type "${config.targetType}" not yet implemented — add handler in runner.js`);
  }
}

// ─── Settings handler ────────────────────────────────────────────────────────

/**
 * Handle the settings step if it appears, then advance.
 */
async function handleSettings(page, wizard) {
  console.log('[runner] Step — Configure settings');
  await wizard.configureSettings();
  await wizard.continueButton.waitFor({ state: 'visible', timeout: 30000 });
  await wizard.continueButton.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  console.log('[runner] ✓ Settings done');
}

// ─── Review handler ──────────────────────────────────────────────────────────

async function handleReview(page, wizard, dryRun = false) {
  await wizard.step5ReviewHeading.waitFor({ state: 'visible', timeout: 20000 });
  await wizard.startMigrationButton.waitFor({ state: 'visible', timeout: 10000 });

  if (dryRun) {
    console.log('[runner] DRY_RUN — review screen verified, NOT clicking Start Migration');
    return page.url();
  }

  console.log('[runner] Review step — starting migration...');
  await wizard.startMigrationButton.click();
  await page.waitForTimeout(3000);
  const url = page.url();
  console.log('[runner] ✓ Migration launched. URL:', url);
  return url;
}

// ─── Post-step routing loop ───────────────────────────────────────────────────

/**
 * After upload/source-connect, keep advancing through any settings steps
 * until we reach review. Handles 1-N settings sub-steps dynamically.
 */
async function advanceToReview(page, wizard) {
  for (let guard = 0; guard < 8; guard++) {
    const step = await detectNextStep(page, wizard);
    if (step === 'review') return;
    if (step === 'settings') {
      await handleSettings(page, wizard);
    } else if (step === 'connect-dest') {
      // Should have been handled already; surface the issue
      throw new Error('[runner] Unexpected connect-dest step in advanceToReview — check flow logic');
    } else {
      throw new Error(`[runner] Unexpected step "${step}" in advanceToReview — wizard may have changed`);
    }
  }
  throw new Error('[runner] advanceToReview guard exceeded — review step never appeared');
}

// ─── Main runner ─────────────────────────────────────────────────────────────

/**
 * Run a full E2E migration for the given config.
 * @param {import('@playwright/test').Page} page
 * @param {object} config  — one entry from migrations.config.js
 * @returns {string}  — final page URL after migration launched
 */
async function runE2eMigration(page, config) {
  const dryRun = !!process.env.DRY_RUN;
  const detail = new MigrationDetailPage(page);
  const wizard = new MigrationWizardPage(page);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[runner] Migration: ${config.card}`);
  console.log(`[runner] Type: ${config.type}  |  Target: ${config.targetType}${dryRun ? '  |  DRY_RUN=1' : ''}`);
  console.log(`${'─'.repeat(60)}`);

  // ── Navigate directly to the listing detail page by ID (avoids search/pagination) ──
  const listingURL = `${config_utils.baseURL}/listing/${config.id}`;
  console.log(`[runner] Navigating to: ${listingURL}`);
  await withRetry(() => page.goto(listingURL, { waitUntil: 'domcontentloaded' }), { label: listingURL });
  await detail.waitForLoaded();
  await detail.clickGetStarted();
  await wizard.waitForLoaded();

  // ── Step 1 — Select data types ──
  await wizard.selectDataTypes(config.dataTypes);
  // Poll until Continue enables (selectDataTypes already checks, but allow extra settling time)
  for (let i = 0; i < 10; i++) {
    if (await wizard.continueButton.isEnabled({ timeout: 1000 }).catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  await wizard.continueButton.click();
  await page.waitForLoadState('networkidle').catch(() => {});

  if (config.type === 'file') {

    // ── Step 2 — Upload files ──
    await handleFileUpload(page, wizard, config);

    // ── Step 3 — Connect destination ──
    const step3 = await detectNextStep(page, wizard);
    if (step3 === 'connect-dest') {
      await handleDestConnect(page, wizard, config);
    } else if (step3 === 'settings') {
      // Some file-based wizards go direct to settings (no dest connect step)
      await handleSettings(page, wizard);
    } else if (step3 !== 'review') {
      throw new Error(`[runner] Unexpected step after upload: "${step3}"`);
    }

  } else if (config.type === 'api') {

    // ── Step 2 — Connect source ──
    await handleSourceConnect(page, wizard, config);

    // ── Step 3 — could be settings or connect-dest, detect dynamically ──
    const step3 = await detectNextStep(page, wizard);
    if (step3 === 'connect-dest') {
      await handleDestConnect(page, wizard, config);
    } else if (step3 === 'settings') {
      await handleSettings(page, wizard);
    } else if (step3 !== 'review') {
      throw new Error(`[runner] Unexpected step after source connect: "${step3}"`);
    }

  } else {
    throw new Error(`[runner] Unknown migration type: "${config.type}"`);
  }

  // ── Remaining settings steps → review ──
  await advanceToReview(page, wizard);

  // ── Review → launch (or stop here in DRY_RUN) ──
  return await handleReview(page, wizard, dryRun);
}

module.exports = { runE2eMigration };
