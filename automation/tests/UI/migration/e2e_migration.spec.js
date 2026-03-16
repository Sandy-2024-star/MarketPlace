// E2E Migration — Shopify to Lightspeed Retail (X-Series) — Customers only (linkprod01)
//
// Full 5-step wizard flow:
//   1. Select → Customers
//   2. Upload → customers_export.csv
//   3. Connect → linkprod01 (existing or new OAuth)
//   4. Settings → auto-configure
//   5. Review → Start Migration
//
// Requires .env: BASE_URL, USERNAME, PASSWORD, LSR_DOMAIN, LSR_EMAIL, LSR_PASSWORD
// Run with: npx playwright test tests/UI/migration/e2e_migration.spec.js --headed

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage = require('../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../pages/MigrationDetailPage');
const MigrationWizardPage = require('../../../pages/MigrationWizardPage');
const config = require('../../../utils/config');
const path = require('path');

const CARD_TITLE   = 'Shopify to Lightspeed Retail';
const DOMAIN       = process.env.LSR_DOMAIN   || 'linkprod01';
const LSR_EMAIL    = process.env.LSR_EMAIL    || config.username;
const LSR_PASSWORD = process.env.LSR_PASSWORD || config.password;
const CSV_FILE     = path.resolve(__dirname, '../../../fixtures/data/customers_export.csv');

test('E2E – Shopify to Lightspeed Retail (X-Series) – Customers migration', async ({ page }) => {
  test.setTimeout(300000);

  // Navigate to listing
  const mp = new MarketplacePage(page);
  await mp.openCard(CARD_TITLE);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  await detail.clickGetStarted();

  const wizard = new MigrationWizardPage(page);
  await wizard.waitForLoaded();

  // Step 1 — Select Customers
  console.log('[e2e] Step 1 — Selecting Customers...');
  await wizard.selectDataTypes(['Customers']);
  await expect(wizard.continueButton).toBeEnabled({ timeout: 10000 });
  await wizard.goToStep2();

  // Step 2 — Upload customers CSV
  console.log('[e2e] Step 2 — Uploading customers_export.csv...');
  await expect(wizard.step2FileHeading).toBeVisible({ timeout: 15000 });
  await wizard.uploadFileAndConfirm(CSV_FILE);
  await expect(wizard.continueButton).toBeEnabled({ timeout: 120000 });
  await wizard.goToStep2(); // advances to step 3

  // Step 3 — Connect destination account
  console.log('[e2e] Step 3 — Connecting destination...');
  await expect(wizard.step3ConnectHeading).toBeVisible({ timeout: 15000 });
  await wizard.connectDestinationAccount(DOMAIN, LSR_EMAIL, LSR_PASSWORD);
  await expect(wizard.continueButton).toBeEnabled({ timeout: 30000 });
  await wizard.continueButton.click();
  await page.waitForLoadState('networkidle').catch(() => {});

  // Step 4 — Configure settings
  console.log('[e2e] Step 4 — Configuring settings...');
  await expect(wizard.step4SettingsHeading).toBeVisible({ timeout: 20000 });
  await wizard.configureSettings();
  await expect(wizard.continueButton).toBeEnabled({ timeout: 30000 });
  await wizard.continueButton.click();
  await page.waitForLoadState('networkidle').catch(() => {});

  // Step 5 — Review and Start Migration
  console.log('[e2e] Step 5 — Starting migration...');
  await expect(wizard.step5ReviewHeading).toBeVisible({ timeout: 20000 });
  await expect(wizard.startMigrationButton).toBeEnabled({ timeout: 10000 });
  await wizard.startMigrationButton.click();

  // Confirm migration launched
  await page.waitForTimeout(3000);
  const url = page.url();
  console.log('[e2e] ✓ Migration launched. URL:', url);
  expect(url).toMatch(/migration|project|listing/i);
});
