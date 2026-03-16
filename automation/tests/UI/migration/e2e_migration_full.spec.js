// E2E Full Migration — Shopify to Lightspeed Retail (X-Series) — 3 data types (linkprod03)
//
// Full 5-step wizard flow:
//   1. Select → Customers + Products + Sales History
//   2. Upload → customers_export.csv, products_export.csv, orders_export.csv
//   3. Connect → linkprod03 (full OAuth: store URL → login → approve)
//   4. Settings → 2 sub-steps (payment methods → default tax)
//   5. Review → Start Migration
//
// Requires .env: BASE_URL, USERNAME, PASSWORD, LSR_DOMAIN_FULL, LSR_EMAIL, LSR_PASSWORD
// Run with: npx playwright test tests/UI/migration/e2e_migration_full.spec.js --headed

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage = require('../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../pages/MigrationDetailPage');
const MigrationWizardPage = require('../../../pages/MigrationWizardPage');
const config = require('../../../utils/config');
const path = require('path');

const CARD_TITLE   = 'Shopify to Lightspeed Retail';
const DOMAIN       = process.env.LSR_DOMAIN_FULL || 'linkprod03';
const LSR_EMAIL    = process.env.LSR_EMAIL        || config.username;
const LSR_PASSWORD = process.env.LSR_PASSWORD     || config.password;

const CUSTOMERS_CSV    = path.resolve(__dirname, '../../../fixtures/data/customers_export.csv');
const PRODUCTS_CSV     = path.resolve(__dirname, '../../../fixtures/data/products_export.csv');
const ORDERS_CSV       = path.resolve(__dirname, '../../../fixtures/data/orders_export.csv');

test('E2E – Full migration – Customers + Products + Sales History (linkprod03)', async ({ page }) => {
  test.setTimeout(600000);

  // Navigate to listing
  const mp = new MarketplacePage(page);
  await mp.openCard(CARD_TITLE);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  await detail.clickGetStarted();

  const wizard = new MigrationWizardPage(page);
  await wizard.waitForLoaded();

  // Step 1 — Select 3 data types
  console.log('[e2e-full] Step 1 — Selecting Customers + Products + Sales History...');
  await wizard.selectDataTypes(['Customers', 'Products', 'Sales History']);
  await expect(wizard.continueButton).toBeEnabled({ timeout: 10000 });
  await wizard.goToStep2();

  // Step 2 — Upload 3 CSV files
  console.log('[e2e-full] Step 2 — Uploading 3 CSV files...');
  await expect(wizard.step2FileHeading).toBeVisible({ timeout: 15000 });
  await wizard.uploadFileForType('Customers',     CUSTOMERS_CSV);
  await wizard.uploadFileForType('Products',      PRODUCTS_CSV);
  await wizard.uploadFileForType('Sales History', ORDERS_CSV);

  // Wait for all files to process
  await expect(wizard.continueButton).toBeEnabled({ timeout: 180000 });
  await wizard.continueButton.click();
  await page.waitForLoadState('networkidle').catch(() => {});

  // Step 3 — Connect destination account (full OAuth)
  console.log('[e2e-full] Step 3 — Connecting destination (full OAuth)...');
  await expect(wizard.step3ConnectHeading).toBeVisible({ timeout: 15000 });
  await wizard.connectDestinationAccount(DOMAIN, LSR_EMAIL, LSR_PASSWORD);
  await expect(wizard.continueButton).toBeEnabled({ timeout: 30000 });
  await wizard.continueButton.click();
  await page.waitForLoadState('networkidle').catch(() => {});

  // Step 4 — Configure settings (2 sub-steps)
  console.log('[e2e-full] Step 4 — Configuring settings...');
  await expect(wizard.step4SettingsHeading).toBeVisible({ timeout: 20000 });
  await wizard.configureSettings();
  await expect(wizard.continueButton).toBeEnabled({ timeout: 30000 });
  await wizard.continueButton.click();
  await page.waitForLoadState('networkidle').catch(() => {});

  // Step 5 — Review and Start Migration
  console.log('[e2e-full] Step 5 — Starting migration...');
  await expect(wizard.step5ReviewHeading).toBeVisible({ timeout: 20000 });
  await expect(wizard.startMigrationButton).toBeEnabled({ timeout: 10000 });
  await wizard.startMigrationButton.click();

  await page.waitForTimeout(3000);
  const url = page.url();
  console.log('[e2e-full] ✓ Migration launched. URL:', url);
  expect(url).toMatch(/migration|project|listing/i);
});
