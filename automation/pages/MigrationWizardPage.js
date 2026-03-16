// Page Object Model – Migration Wizard
// URL: /migration-flow  (reached via Get Started from a card detail page)
//
// Generic wizard (e.g. BigCommerce/Adobe Commerce to Shopify) — 4 steps:
//   1-Select → 2-Upload|Connect → 3-Connect → 4-Review
//
// Shopify to Lightspeed Retail (X-Series) — 5 steps:
//   1-Select → 2-Upload → 3-Connect → 4-Settings → 5-Review
//
// Step 2 (File-based) flow:
//   Click "Upload" button → tutorial popup opens ("Export <Type>")
//   → check the checkbox → set file via getByLabel('Upload CSV')
//   → popup closes → "Confirm Files & Start Processing" appears
//   → click it → wait for processing → Continue enables
//
// Step 2 (API-based) flow:
//   storeHash + accessToken inputs → Connect Account → Continue enables
//
// Selectors validated against live app.

class MigrationWizardPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Step indicator labels (always visible)
    this.stepSelectLabel  = page.getByText('Select', { exact: true });
    this.stepUploadLabel  = page.getByText('Upload', { exact: true });
    this.stepConnectLabel = page.getByText('Connect', { exact: true });
    this.stepReviewLabel  = page.getByText('Review', { exact: true });

    // Step 1 — "Choose your data"
    this.step1Heading     = page.getByText('Choose your data', { exact: true });
    // Use 'Continue' strictly — the resume modal has "Continue from Step 2" which is distinct
    this.continueButton   = page.getByRole('button', { name: 'Continue', exact: true });
    // 'Back' appears in both top nav and wizard footer; last() is the wizard footer Back
    this.backButton       = page.getByRole('button', { name: 'Back' }).last();

    // Step 1 data-type buttons (button text contains the label)
    this.customersButton      = page.locator('button').filter({ hasText: 'Customers' }).first();
    this.productsButton       = page.locator('button').filter({ hasText: 'Products' }).first();
    this.ordersButton         = page.locator('button').filter({ hasText: 'Orders' }).first();
    this.categoriesButton     = page.locator('button').filter({ hasText: 'Categories' }).first();
    this.salesHistoryButton   = page.locator('button').filter({ hasText: 'Sales History' }).first();
    this.inventoryButton      = page.locator('button').filter({ hasText: 'Inventory' }).first();

    // Step 2 (File-based) — "Upload your files"
    this.step2FileHeading  = page.getByText('Upload your files', { exact: true });
    // "Upload" button triggers the tutorial popup
    this.uploadButton      = page.getByRole('button', { name: 'Upload', exact: true });

    // Tutorial popup (appears after clicking "Upload")
    //   Heading: "Export <DataType>" + "Step-by-Step Instructions"
    //   Checkbox confirms instructions have been read
    //   File input labeled "Upload CSV" (id=tutorial-file-upload)
    this.tutorialCheckbox   = page.locator('input[type="checkbox"]').first();
    this.tutorialFileInput  = page.getByLabel('Upload CSV');
    this.closePopupButton   = page.getByRole('button', { name: 'Close', exact: true });

    // After popup closes: processing button appears on the main step
    this.confirmFilesButton = page.getByRole('button', { name: /confirm files & start processing/i });

    // Step 2 (API-based) — "Connect systems"
    // Source: storeHash + accessToken (e.g. BigCommerce)
    // Destination: shop (e.g. Shopify store domain — confirmed via probe)
    this.step2ApiHeading    = page.getByText('Connect systems', { exact: true });
    this.storeHashInput     = page.getByPlaceholder('storeHash');
    this.accessTokenInput   = page.getByPlaceholder('accessToken');
    this.shopInput          = page.getByPlaceholder('shop');
    this.connectAccountBtn  = page.getByRole('button', { name: /connect account/i }).first();

    // Step 3 — "Connect destination"
    // File-based: input placeholder = "Enter shop" (Shopify OAuth)
    // LSR wizard:  input placeholder = "Enter domainprefix"
    this.step3ConnectHeading    = page.getByText('Connect destination', { exact: true });
    this.shopDestinationInput   = page.getByPlaceholder('Enter shop');
    this.domainPrefixInput      = page.getByPlaceholder('Enter domainprefix');
    // Previously-connected account card (click to select before Continue enables)
    this.connectedAccountCard   = page.locator('button').filter({ hasText: /Connected/ }).first();
    this.connectNewButton       = page.getByRole('button', { name: /connect new/i });

    // Step 4 — "Configure settings" (LSR wizard) or "Validate" (API-based wizard)
    this.step4SettingsHeading      = page.getByText('Configure settings', { exact: true });
    this.step4ValidateHeading      = page.getByText('Validate', { exact: true });
    this.taxMappingSelect          = page.locator('select').first();
    this.saveConfigButton          = page.getByRole('button', { name: /save configuration/i });
    this.configCompleteHeading     = page.getByText('Configuration Complete', { exact: true });

    // Step 5 — "Ready for launch"
    this.step5ReviewHeading        = page.getByText('Ready for launch', { exact: true });
    this.migrationNameInput        = page.locator('input[type="text"]').filter({ hasNotText: '' }).last();
    this.startMigrationButton      = page.getByRole('button', { name: /start migration/i });

    // "Resume Migration?" modal — appears when a previous migration was saved
    this.startFreshButton        = page.getByRole('button', { name: /start fresh/i });
    this.continueFromStepButton  = page.getByRole('button', { name: /continue from step/i });
  }

  /**
   * Wait for the wizard to be ready.
   * Sequence: white spinner overlay → (DOM reset) → optional "Resume Migration?" modal → step 1
   * Automatically dismisses the resume modal (clicks Start Fresh) if it appears.
   */
  async waitForLoaded() {
    console.log('[wizard] Waiting for page load...');
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.locator('div.fixed.inset-0.bg-white').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    if (await this.startFreshButton.isVisible({ timeout: 4000 }).catch(() => false)) {
      console.log('[wizard] Resume modal detected — clicking Start Fresh');
      await this.startFreshButton.click();
      await this.page.waitForTimeout(800);
    }
    await this.step1Heading.waitFor({ state: 'visible', timeout: 20000 });
    console.log('[wizard] ✓ Ready — URL:', this.page.url());
  }

  /**
   * Select one or more data types on Step 1.
   * @param {string[]} types  e.g. ['Customers', 'Orders']
   */
  async selectDataTypes(types) {
    console.log('[wizard] Step 1 — Selecting data types:', types.join(', '));
    for (const type of types) {
      const btn = this.page.locator('button').filter({ hasText: type }).first();
      const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      if (visible) {
        await btn.click();
        await this.page.waitForTimeout(200);
        console.log('[wizard]   ✓ Selected:', type);
      } else {
        console.log('[wizard]   ✗ Not found (skip):', type);
      }
    }
    const enabled = await this.continueButton.isEnabled({ timeout: 2000 }).catch(() => false);
    console.log('[wizard] Step 1 — Continue enabled:', enabled);
  }

  /** Proceed to Step 2 (Continue must already be enabled) */
  async goToStep2() {
    console.log('[wizard] Step 1 → Step 2 — clicking Continue...');
    await this.continueButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(500);
    console.log('[wizard] ✓ On Step 2. URL:', this.page.url());
  }

  /**
   * Upload a single file for a specific data type (multi-type Step 2).
   * New UI: Upload button opens native file chooser directly (no popup/checkbox).
   * @param {string} type      e.g. 'Customers', 'Products', 'Sales History'
   * @param {string} filePath  Absolute path to the CSV/Excel file
   */
  async uploadFileForType(type, filePath) {
    const path = require('path');
    const fs   = require('fs');
    const size = fs.existsSync(filePath) ? `${(fs.statSync(filePath).size / 1024).toFixed(1)} KB` : 'not found';
    console.log(`[wizard] Uploading ${type} — ${path.basename(filePath)} (${size})`);

    const section = this.page.locator('div').filter({
      hasText: new RegExp(type, 'i'),
      has: this.page.getByRole('button', { name: 'Upload', exact: true }),
    }).last();

    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser', { timeout: 10000 }),
      section.getByRole('button', { name: 'Upload', exact: true }).click(),
    ]);
    await fileChooser.setFiles(filePath);
    await this.page.waitForTimeout(1500);
    console.log(`[wizard] ✓ ${type} file set`);
  }

  /**
   * Full Step 2 file upload flow (single data type).
   * New UI: Upload button → file chooser → "Confirm Files & Start Processing" → wait for Continue.
   * @param {string} filePath  Absolute path to the CSV/Excel file
   */
  async uploadFileAndConfirm(filePath) {
    const path = require('path');
    const fs   = require('fs');
    const size = fs.existsSync(filePath) ? `${(fs.statSync(filePath).size / 1024).toFixed(1)} KB` : 'not found';
    console.log(`[wizard] Uploading file — ${path.basename(filePath)} (${size})`);

    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser', { timeout: 10000 }),
      this.uploadButton.click(),
    ]);
    await fileChooser.setFiles(filePath);
    await this.page.waitForTimeout(1500);

    await this.confirmFilesButton.waitFor({ state: 'visible', timeout: 10000 });
    await this.confirmFilesButton.click();
    console.log('[wizard] File submitted — polling for processing...');

    for (let i = 0; i < 18; i++) {
      if (await this.continueButton.isEnabled({ timeout: 1000 }).catch(() => false)) break;
      console.log(`[wizard]   Processing... ${(i + 1) * 5}s`);
      await this.page.waitForTimeout(5000);
    }
    const ready = await this.continueButton.isEnabled({ timeout: 1000 }).catch(() => false);
    console.log('[wizard] ✓ File processing done — Continue enabled:', ready);
  }

  /**
   * Step 3 — Connect destination account.
   * Three cases:
   *   A) Continue already enabled → skip
   *   B) Previously-connected account card → click to select
   *   C) No connected account → OAuth: fill domain → popup → login → Approve
   * @param {string} domainPrefix  e.g. 'linkprod01'
   * @param {string} email
   * @param {string} password
   */
  async connectDestinationAccount(domainPrefix, email, password) {
    console.log(`[wizard] Step 3 — Connecting destination: ${domainPrefix}`);

    // Case A: already connected and selected
    if (await this.continueButton.isEnabled({ timeout: 2000 }).catch(() => false)) {
      console.log('[wizard] Step 3 — Already connected (Continue enabled), skipping');
      return;
    }

    // Case B: previously-connected account card for THIS domainPrefix is present
    const accountCard = this.page.locator('button').filter({ hasText: new RegExp(domainPrefix, 'i') }).first();
    if (await accountCard.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      console.log(`[wizard] Step 3 — Found existing account card for "${domainPrefix}", selecting...`);
      await accountCard.click();
      await this.page.waitForTimeout(500);
      if (await this.continueButton.isEnabled({ timeout: 5000 }).catch(() => false)) {
        console.log('[wizard] ✓ Step 3 — Account selected, Continue enabled');
        return;
      }
    }

    // Case C: OAuth flow
    console.log(`[wizard] Step 3 — No existing account, starting OAuth for ${domainPrefix}...`);
    await this.connectNewButton.click();
    await this.domainPrefixInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.domainPrefixInput.fill(domainPrefix);
    await this.page.waitForTimeout(300);

    console.log('[wizard] Step 3 — Opening OAuth popup...');
    const [popup] = await Promise.all([
      this.page.waitForEvent('popup'),
      this.connectAccountBtn.click(),
    ]);
    console.log('[wizard] Step 3 — Popup URL:', popup.url());

    await popup.waitForLoadState('domcontentloaded').catch(() => {});

    const waitVisible = (loc, ms) =>
      loc.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);

    // Store URL step
    const storeUrlInput = popup.getByPlaceholder('Enter your store URL');
    if (await waitVisible(storeUrlInput, 10000)) {
      console.log('[wizard] Step 3 — Filling store URL:', domainPrefix);
      await storeUrlInput.fill(domainPrefix);
      await popup.getByRole('button', { name: 'Next' }).click();
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.waitForTimeout(1500);
    }

    // Login step
    const usernameInput = popup.getByPlaceholder('Enter your username');
    if (await waitVisible(usernameInput, 8000)) {
      console.log('[wizard] Step 3 — Logging in as:', email);
      await usernameInput.fill(email);
      await popup.getByPlaceholder('Enter your password').fill(password);
      await popup.getByRole('button', { name: 'Log in' }).click();
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.waitForTimeout(2000);

      const checklistCard = popup.locator('text=Settings checklist').locator('../..');
      const checklistClose = checklistCard.locator('button').last();
      if (await waitVisible(checklistClose, 5000)) {
        console.log('[wizard] Step 3 — Dismissing Settings checklist overlay');
        await checklistClose.click();
        await popup.waitForTimeout(500);
      }
    }

    // Approve
    const approveBtn = popup.getByRole('button', { name: 'Approve installation' });
    if (await waitVisible(approveBtn, 15000)) {
      console.log('[wizard] Step 3 — Approving OAuth installation...');
      await approveBtn.scrollIntoViewIfNeeded();
      await popup.waitForTimeout(500);
      await approveBtn.click();
      await popup.waitForTimeout(2000);
    } else {
      console.log('[wizard] Step 3 — No Approve button found. Popup URL:', popup.url());
    }

    if (!popup.isClosed()) {
      console.log('[wizard] Step 3 — Waiting for popup to close...');
      await popup.waitForEvent('close', { timeout: 60000 });
    }
    console.log('[wizard] ✓ Step 3 — OAuth popup closed');
    await this.page.waitForTimeout(3000);
  }

  /**
   * Step 4 — Configure settings.
   * Handles 1 or more sub-steps; maps unmapped selects, clicks inner Continue or Save Configuration.
   */
  async configureSettings() {
    console.log('[wizard] Step 4 — Configuring settings...');
    await this.page.waitForFunction(
      () => !document.body.innerText.includes('Checking configuration steps'),
      { timeout: 30000 }
    ).catch(() => {});
    await this.page.waitForTimeout(500);

    for (let subStep = 0; subStep < 10; subStep++) {
      console.log(`[wizard] Step 4 — Sub-step ${subStep + 1}...`);

      // Map each unmapped <select>
      const selects = await this.page.locator('select').all();
      for (const sel of selects) {
        const val = await sel.inputValue();
        if (!val) {
          const opts = await sel.locator('option').all();
          for (const opt of opts) {
            const text  = (await opt.textContent() || '').trim();
            const value = await opt.getAttribute('value');
            if (value && text && !text.toLowerCase().includes('select')) {
              console.log(`[wizard]   Mapped select → "${text}"`);
              await sel.selectOption(value);
              await this.page.waitForTimeout(300);
              break;
            }
          }
        }
      }

      // Save Configuration on final sub-step
      if (await this.saveConfigButton.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
        console.log('[wizard] Step 4 — Clicking Save Configuration...');
        await this.saveConfigButton.click();
        await this.configCompleteHeading.waitFor({ state: 'visible', timeout: 10000 });
        console.log('[wizard] ✓ Step 4 — Configuration saved');
        return;
      }

      // Inner sub-step Continue (not the wizard footer one)
      let clicked = false;
      for (const btn of await this.page.locator('button').all()) {
        const text    = (await btn.textContent().catch(() => '')).trim();
        const enabled = await btn.isEnabled().catch(() => false);
        const visible = await btn.isVisible().catch(() => false);
        if (!enabled || !visible || !/continue/i.test(text)) continue;
        if (text === 'Continue') continue; // skip wizard footer
        console.log(`[wizard]   Clicking inner Continue: "${text}"`);
        await btn.click();
        await this.page.waitForTimeout(1000);
        clicked = true;
        break;
      }
      if (!clicked) {
        console.log('[wizard] Step 4 — No inner Continue found, exiting sub-step loop');
        break;
      }
    }
  }
}

module.exports = MigrationWizardPage;
