// UI tests for the Migration Wizard (/migration-flow).
// Covers: step 1 data selection, both File-based and API-based step 2, back navigation,
// migration type badges, and Watch Demo button on card detail pages.
//
// Run serially — wizard tests are stateful and heavy; parallel runs overload the test app.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'path';
// Reuse auth state saved by global-setup — skips per-test login (~3s saved per test)
test.use({ storageState: path.resolve(__dirname, '../../../test-results/storageState.json') });
import { MarketplacePage } from '../../../pages/MarketplacePage';
import { MigrationDetailPage } from '../../../pages/MigrationDetailPage';
import { MigrationWizardPage } from '../../../pages/MigrationWizardPage';
import config from '../../../utils/config';

// Known cards by migration type (validated via probe)
const FILE_BASED_CARD = 'Adobe Commerce to Shopify';
const API_BASED_CARD  = 'BigCommerce to Shopify';

async function loginAndLoad(page: Page) {
  // Auth already loaded via storageState — navigate to listings.
  // Use domcontentloaded (not 'load') so we don't block on slow assets;
  // MarketplacePage.waitForLoaded() handles waiting for actual content.
  const url = config.baseURL + '/listings';
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (err) {
    console.warn('[test] Initial navigation failed, retrying once:', (err as Error).message);
    await page.waitForTimeout(3000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  await new MarketplacePage(page).waitForLoaded();
  console.log('[test] ✓ On listings. URL:', page.url());
}

async function openCardAndGetStarted(page: Page, cardTitle: string) {
  console.log(`[test] Opening "${cardTitle}"...`);
  const mp = new MarketplacePage(page);
  await mp.openCard(cardTitle);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  await detail.clickGetStarted();
  const wizard = new MigrationWizardPage(page);
  await wizard.waitForLoaded();
  console.log('[test] ✓ Wizard ready');
  return wizard;
}

test.describe('Migration Wizard – Step 1 (Choose your data)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
  });

  test('should show step indicator with 4 steps', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
    await expect(wizard.stepSelectLabel).toBeVisible();
    await expect(wizard.stepUploadLabel).toBeVisible();
    await expect(wizard.stepConnectLabel).toBeVisible();
    await expect(wizard.stepReviewLabel).toBeVisible();
  });

  test('should show "Choose your data" heading on step 1', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
    await expect(wizard.step1Heading).toBeVisible();
  });

  test('should disable Continue button when no data type is selected', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
    await expect(wizard.continueButton).toBeDisabled();
  });

  test('should enable Continue after selecting Customers', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
    await wizard.customersButton.click();
    await expect(wizard.continueButton).toBeEnabled();
  });

  test('should support multi-select of data types', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
    await wizard.selectDataTypes(['Customers', 'Products']);
    await expect(wizard.continueButton).toBeEnabled();
  });

  test('should navigate back from step 1', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
    await wizard.backButton.click();
    // Should return to card detail
    await expect(page).toHaveURL(/\/listing\//);
  });
});

test.describe('Migration Wizard – Step 2 File-based (Upload your files)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
  });

  test('should show "Upload your files" heading on step 2 for File-based migration', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
    await wizard.customersButton.click();
    await wizard.goToStep2();
    await expect(wizard.step2FileHeading).toBeVisible();
  });

  test('should show file input and Upload button on step 2 for File-based migration', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
    await wizard.customersButton.click();
    await wizard.goToStep2();
    await expect(wizard.tutorialFileInput.or(wizard.uploadButton)).toBeAttached();
    await expect(wizard.uploadButton).toBeVisible();
  });

  test('should keep Continue disabled on step 2 until file is uploaded', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
    await wizard.customersButton.click();
    await wizard.goToStep2();
    await expect(wizard.continueButton).toBeDisabled();
  });
});

test.describe('Migration Wizard – Step 2 API-based (Connect systems)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
  });

  test('should show "Connect systems" heading on step 2 for API migration', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, API_BASED_CARD);
    await wizard.customersButton.click();
    await wizard.goToStep2();
    await expect(wizard.step2ApiHeading).toBeVisible();
  });

  test('should show connection credential inputs on step 2 for API migration', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, API_BASED_CARD);
    await wizard.customersButton.click();
    await wizard.goToStep2();
    await expect(wizard.storeHashInput).toBeVisible();
    await expect(wizard.accessTokenInput).toBeVisible();
  });

  test('should show Connect Account button on step 2 for API migration', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, API_BASED_CARD);
    await wizard.customersButton.click();
    await wizard.goToStep2();
    await expect(wizard.connectAccountBtn).toBeVisible();
  });

  test('should keep Continue disabled on step 2 until connected', async ({ page }) => {
    const wizard = await openCardAndGetStarted(page, API_BASED_CARD);
    await wizard.customersButton.click();
    await wizard.goToStep2();
    await expect(wizard.continueButton).toBeDisabled();
  });
});

test.describe('Migration Detail Page – Type badges & actions', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
  });

  test('should show "File Based" badge on Adobe Commerce to Shopify detail', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.openCard(FILE_BASED_CARD);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    await expect(detail.migrationTypeBadge).toContainText('File Based');
  });

  test('should show "API" badge on BigCommerce to Shopify detail', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.openCard(API_BASED_CARD);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    await expect(detail.migrationTypeBadge).toContainText('API');
  });

  test('should show Watch Demo Video button on card detail', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.openCard(API_BASED_CARD);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    await expect(detail.watchDemoButton).toBeVisible();
  });
});
