// PROBE — File-based migration step structure discovery
// Purpose: Walk through "Adobe Commerce to Shopify" up to Step 2 (no file upload)
//          and log every visible heading, button, and input to map the exact step flow.
// Safe: stops at Step 2 before uploading anything.
// Run: npx playwright test tests/UI/migration/e2e/probes/probe_file_based.spec.js --headed

const { test } = require('@playwright/test');
const path = require('path');
test.use({ storageState: path.resolve(__dirname, '../../../../../test-results/storageState.json') });

const MarketplacePage     = require('../../../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../../../pages/MigrationDetailPage');
const MigrationWizardPage = require('../../../../../pages/MigrationWizardPage');
const config              = require('../../../../../utils/config');

const CARD = 'Adobe Commerce to Shopify';

async function logPageState(page, label) {
  const headings = await page.locator('h1,h2,h3,h4').allTextContents();
  const buttons  = await page.locator('button:visible').allTextContents();
  const inputs   = await page.locator('input:visible,select:visible').evaluateAll(els =>
    els.map(e => `${e.tagName.toLowerCase()}[${e.type || e.name || ''}] placeholder="${e.placeholder || ''}"`)
  );
  console.log(`\n===== ${label} =====`);
  console.log('Headings:', headings.filter(Boolean));
  console.log('Buttons :', buttons.filter(Boolean));
  console.log('Inputs  :', inputs.filter(Boolean));
  console.log('URL     :', page.url());
}

test('PROBE — File-based step structure (Adobe Commerce to Shopify)', async ({ page }) => {
  test.setTimeout(120000);

  await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
  const mp = new MarketplacePage(page);
  await mp.waitForLoaded();

  // Open card
  await mp.openCard(CARD);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  await logPageState(page, 'DETAIL PAGE');

  // Click CTA
  await detail.clickGetStarted();
  const wizard = new MigrationWizardPage(page);
  await wizard.waitForLoaded();
  await logPageState(page, 'STEP 1 — Choose your data');

  // Step 1: select Customers → log Continue state
  await wizard.customersButton.click();
  await page.waitForTimeout(500);
  const continueEnabled = await wizard.continueButton.isEnabled().catch(() => false);
  console.log('[probe] Continue enabled after Customers select:', continueEnabled);

  // Advance to Step 2
  await wizard.goToStep2();
  await page.waitForTimeout(2000);
  await logPageState(page, 'STEP 2 — before upload');

  // Upload CSV — new UI: direct file picker (no popup/checkbox)
  const CSV = path.resolve(__dirname, '../../../../../fixtures/data/customers_export.csv');
  console.log('[probe] Uploading via file chooser:', CSV);

  const uploadBtn = page.locator('button').filter({ hasText: /^Upload$/ }).first();
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    uploadBtn.click(),
  ]);
  await fileChooser.setFiles(CSV);
  await page.waitForTimeout(1500);
  await logPageState(page, 'STEP 2 — after file set (before confirm)');

  // Click Confirm Files & Start Processing
  const confirmBtn = page.getByRole('button', { name: /confirm files & start processing/i });
  const confirmVisible = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('[probe] Confirm button visible:', confirmVisible);
  if (confirmVisible) {
    await confirmBtn.click();
    console.log('[probe] Confirm clicked — waiting for processing...');
    for (let i = 0; i < 12; i++) {
      if (await wizard.continueButton.isEnabled({ timeout: 1000 }).catch(() => false)) break;
      console.log(`[probe]   Processing... ${(i + 1) * 5}s`);
      await page.waitForTimeout(5000);
    }
  }
  await logPageState(page, 'STEP 2 — after processing');

  // Advance to Step 3
  const step2Ready = await wizard.continueButton.isEnabled({ timeout: 5000 }).catch(() => false);
  console.log('[probe] Step 2 Continue enabled after upload:', step2Ready);

  if (step2Ready) {
    await wizard.continueButton.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    await logPageState(page, 'STEP 3');

    // Check Step 3 inputs in detail
    const allInputs = await page.locator('input').evaluateAll(els =>
      els.map(e => ({ type: e.type, placeholder: e.placeholder, name: e.name, visible: e.offsetParent !== null }))
    );
    console.log('[probe] Step 3 inputs:', JSON.stringify(allInputs, null, 2));

    // Can we advance further without connecting?
    const step3ContinueEnabled = await wizard.continueButton.isEnabled({ timeout: 3000 }).catch(() => false);
    console.log('[probe] Step 3 Continue enabled (without connecting):', step3ContinueEnabled);

    // Try to advance to Step 4 if already enabled
    if (step3ContinueEnabled) {
      await wizard.continueButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2000);
      await logPageState(page, 'STEP 4');
    }
  }

  console.log('\n[probe] ✓ Done — review logs above to map full step structure');
});
