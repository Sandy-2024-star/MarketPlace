// Page Object Model – Migration Wizard
// URL: /migration-flow  (reached via Get Started from a card detail page)

import path from 'path';
import fs from 'fs';
import type { Page, Locator } from '@playwright/test';

export class MigrationWizardPage {
  readonly page: Page;
  readonly stepSelectLabel: Locator;
  readonly stepUploadLabel: Locator;
  readonly stepConnectLabel: Locator;
  readonly stepReviewLabel: Locator;
  readonly step1Heading: Locator;
  readonly continueButton: Locator;
  readonly backButton: Locator;
  readonly customersButton: Locator;
  readonly productsButton: Locator;
  readonly ordersButton: Locator;
  readonly categoriesButton: Locator;
  readonly salesHistoryButton: Locator;
  readonly inventoryButton: Locator;
  readonly step2FileHeading: Locator;
  readonly uploadButton: Locator;
  readonly tutorialCheckbox: Locator;
  readonly tutorialFileInput: Locator;
  readonly closePopupButton: Locator;
  readonly confirmFilesButton: Locator;
  readonly step2ApiHeading: Locator;
  readonly storeHashInput: Locator;
  readonly accessTokenInput: Locator;
  readonly shopInput: Locator;
  readonly connectAccountBtn: Locator;
  readonly step3ConnectHeading: Locator;
  readonly shopDestinationInput: Locator;
  readonly domainPrefixInput: Locator;
  readonly connectedAccountCard: Locator;
  readonly connectNewButton: Locator;
  readonly step4SettingsHeading: Locator;
  readonly step4ValidateHeading: Locator;
  readonly taxMappingSelect: Locator;
  readonly saveConfigButton: Locator;
  readonly configCompleteHeading: Locator;
  readonly step5ReviewHeading: Locator;
  readonly migrationNameInput: Locator;
  readonly startMigrationButton: Locator;
  readonly startFreshButton: Locator;
  readonly continueFromStepButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.stepSelectLabel       = page.getByText('Select',  { exact: true });
    this.stepUploadLabel       = page.getByText('Upload',  { exact: true });
    this.stepConnectLabel      = page.getByText('Connect', { exact: true });
    this.stepReviewLabel       = page.getByText('Review',  { exact: true });
    this.step1Heading          = page.getByText('Choose your data', { exact: true });
    this.continueButton        = page.getByRole('button', { name: 'Continue', exact: true });
    this.backButton            = page.getByRole('button', { name: 'Back' }).last();
    this.customersButton       = page.locator('button').filter({ hasText: 'Customers' }).first();
    this.productsButton        = page.locator('button').filter({ hasText: 'Products' }).first();
    this.ordersButton          = page.locator('button').filter({ hasText: 'Orders' }).first();
    this.categoriesButton      = page.locator('button').filter({ hasText: 'Categories' }).first();
    this.salesHistoryButton    = page.locator('button').filter({ hasText: 'Sales History' }).first();
    this.inventoryButton       = page.locator('button').filter({ hasText: 'Inventory' }).first();
    this.step2FileHeading      = page.getByText('Upload your files', { exact: true });
    this.uploadButton          = page.getByRole('button', { name: 'Upload', exact: true });
    this.tutorialCheckbox      = page.locator('input[type="checkbox"]').first();
    this.tutorialFileInput     = page.getByLabel('Upload CSV');
    this.closePopupButton      = page.getByRole('button', { name: 'Close', exact: true });
    this.confirmFilesButton    = page.getByRole('button', { name: /confirm files & start processing/i });
    this.step2ApiHeading       = page.getByText('Connect systems', { exact: true });
    this.storeHashInput        = page.getByPlaceholder('storeHash');
    this.accessTokenInput      = page.getByPlaceholder('accessToken');
    this.shopInput             = page.getByPlaceholder('shop');
    this.connectAccountBtn     = page.getByRole('button', { name: /connect account/i }).first();
    this.step3ConnectHeading   = page.getByText('Connect destination', { exact: true });
    this.shopDestinationInput  = page.getByPlaceholder('Enter shop');
    this.domainPrefixInput     = page.getByPlaceholder('Enter domainprefix');
    this.connectedAccountCard  = page.locator('button').filter({ hasText: /Connected/ }).first();
    this.connectNewButton      = page.getByRole('button', { name: /connect new/i });
    this.step4SettingsHeading  = page.getByText('Configure settings', { exact: true });
    this.step4ValidateHeading  = page.getByText('Validate', { exact: true });
    this.taxMappingSelect      = page.locator('select').first();
    this.saveConfigButton      = page.getByRole('button', { name: /save configuration/i });
    this.configCompleteHeading = page.getByText('Configuration Complete', { exact: true });
    this.step5ReviewHeading    = page.getByText('Ready for launch', { exact: true });
    this.migrationNameInput    = page.locator('input[type="text"]').filter({ hasNotText: '' }).last();
    this.startMigrationButton  = page.getByRole('button', { name: /start migration/i });
    this.startFreshButton      = page.getByRole('button', { name: /start fresh/i });
    this.continueFromStepButton = page.getByRole('button', { name: /continue from step/i });
  }

  async waitForLoaded(): Promise<void> {
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

  async selectDataTypes(types: string[]): Promise<void> {
    console.log('[wizard] Step 1 — Selecting data types:', types.join(', '));
    for (const type of types) {
      const btn     = this.page.locator('button').filter({ hasText: type }).first();
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

  async goToStep2(): Promise<void> {
    console.log('[wizard] Step 1 → Step 2 — clicking Continue...');
    await this.continueButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(500);
    console.log('[wizard] ✓ On Step 2. URL:', this.page.url());
  }

  async uploadFileForType(type: string, filePath: string): Promise<void> {
    const size = fs.existsSync(filePath) ? `${(fs.statSync(filePath).size / 1024).toFixed(1)} KB` : 'not found';
    console.log(`[wizard] Uploading ${type} — ${path.basename(filePath)} (${size})`);

    const section = this.page.locator('div').filter({
      hasText: new RegExp(type, 'i'),
      has:     this.page.getByRole('button', { name: 'Upload', exact: true }),
    }).last();

    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser', { timeout: 10000 }),
      section.getByRole('button', { name: 'Upload', exact: true }).click(),
    ]);
    await fileChooser.setFiles(filePath);
    await this.page.waitForTimeout(1500);
    console.log(`[wizard] ✓ ${type} file set`);
  }

  async uploadFileAndConfirm(filePath: string): Promise<void> {
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

  async connectDestinationAccount(domainPrefix: string, email: string, password: string): Promise<void> {
    console.log(`[wizard] Step 3 — Connecting destination: ${domainPrefix}`);

    if (await this.continueButton.isEnabled({ timeout: 2000 }).catch(() => false)) {
      console.log('[wizard] Step 3 — Already connected (Continue enabled), skipping');
      return;
    }

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

    const waitVisible = (loc: Locator, ms: number) =>
      loc.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);

    const storeUrlInput = popup.getByPlaceholder('Enter your store URL');
    if (await waitVisible(storeUrlInput, 10000)) {
      console.log('[wizard] Step 3 — Filling store URL:', domainPrefix);
      await storeUrlInput.fill(domainPrefix);
      await popup.getByRole('button', { name: 'Next' }).click();
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.waitForTimeout(1500);
    }

    const usernameInput = popup.getByPlaceholder('Enter your username');
    if (await waitVisible(usernameInput, 8000)) {
      console.log('[wizard] Step 3 — Logging in as:', email);
      await usernameInput.fill(email);
      await popup.getByPlaceholder('Enter your password').fill(password);
      await popup.getByRole('button', { name: 'Log in' }).click();
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.waitForTimeout(2000);

      const checklistCard  = popup.locator('text=Settings checklist').locator('../..');
      const checklistClose = checklistCard.locator('button').last();
      if (await waitVisible(checklistClose, 5000)) {
        console.log('[wizard] Step 3 — Dismissing Settings checklist overlay');
        await checklistClose.click();
        await popup.waitForTimeout(500);
      }
    }

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

  async configureSettings(): Promise<void> {
    console.log('[wizard] Step 4 — Configuring settings...');
    await this.page.waitForFunction(
      () => !document.body.innerText.includes('Checking configuration steps'),
      { timeout: 30000 }
    ).catch(() => {});
    await this.page.waitForTimeout(500);

    for (let subStep = 0; subStep < 10; subStep++) {
      console.log(`[wizard] Step 4 — Sub-step ${subStep + 1}...`);

      const selects = await this.page.locator('select').all();
      for (const sel of selects) {
        const val = await sel.inputValue();
        if (!val) {
          const opts = await sel.locator('option').all();
          for (const opt of opts) {
            const text  = ((await opt.textContent()) ?? '').trim();
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

      if (await this.saveConfigButton.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
        console.log('[wizard] Step 4 — Clicking Save Configuration...');
        await this.saveConfigButton.click();
        await this.configCompleteHeading.waitFor({ state: 'visible', timeout: 10000 });
        console.log('[wizard] ✓ Step 4 — Configuration saved');
        return;
      }

      let clicked = false;
      for (const btn of await this.page.locator('button').all()) {
        const text    = ((await btn.textContent().catch(() => '')) ?? '').trim();
        const enabled = await btn.isEnabled().catch(() => false);
        const visible = await btn.isVisible().catch(() => false);
        if (!enabled || !visible || !/continue/i.test(text)) continue;
        if (text === 'Continue') continue;
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
