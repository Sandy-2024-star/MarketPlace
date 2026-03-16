// UI tests for Migration Wizard Step 3 — "Connect destination".
//
// Flow to reach step 3 (file-based):
//   listing → Get Started → Step 1 (select Customers) → Step 2 (upload CSV) → Step 3
//
// Uses test.step() within a single upload so the CSV is processed only once,
// then all step-3 assertions run against that same page state.
// Serial mode ensures tests don't race on shared wizard state.

const { test, expect } = require('@playwright/test');
const path = require('path');
test.use({ storageState: path.resolve(__dirname, '../../../test-results/storageState.json') });

const MarketplacePage     = require('../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../pages/MigrationDetailPage');
const MigrationWizardPage = require('../../../pages/MigrationWizardPage');
const config              = require('../../../utils/config');

// File-based migration that has a Connect destination step (Step 3)
const FILE_BASED_CARD = 'Adobe Commerce to Shopify';
const CUSTOMERS_CSV   = path.resolve(__dirname, '../../../fixtures/data/customers_export.csv');

async function loginAndLoad(page) {
  await page.goto(config.baseURL + '/listings', { waitUntil: 'domcontentloaded' });
  await new MarketplacePage(page).waitForLoaded();
}

async function openCardAndGetStarted(page, cardTitle) {
  const mp = new MarketplacePage(page);
  await mp.openCard(cardTitle);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  await detail.clickGetStarted();
  const wizard = new MigrationWizardPage(page);
  await wizard.waitForLoaded();
  return wizard;
}

/** Navigate through Steps 1 → 2 → 3 using the fixture CSV. */
async function navigateToStep3(page) {
  await loginAndLoad(page);
  const wizard = await openCardAndGetStarted(page, FILE_BASED_CARD);
  await wizard.customersButton.click();
  await wizard.goToStep2();
  await wizard.uploadFileAndConfirm(CUSTOMERS_CSV);
  await wizard.continueButton.click();
  await wizard.step3ConnectHeading.waitFor({ state: 'visible', timeout: 30000 });
  console.log('[test] ✓ On Step 3');
  return wizard;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Migration Wizard – Step 3 (Connect destination)', () => {
  test.describe.configure({ mode: 'serial' });

  // Single upload, all structural assertions as named test.step()s.
  test('Connect destination UI elements', async ({ page }) => {
    const wizard = await navigateToStep3(page);

    await test.step('"Connect destination" heading is visible', async () => {
      await expect(wizard.step3ConnectHeading).toBeVisible();
    });

    await test.step('destination input (shop or domainprefix) is present', async () => {
      const hasShop   = await wizard.shopDestinationInput.isVisible({ timeout: 3000 }).catch(() => false);
      const hasDomain = await wizard.domainPrefixInput.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasShop || hasDomain).toBe(true);
    });

    await test.step('Connect Account button is visible', async () => {
      await expect(wizard.connectAccountBtn).toBeVisible();
    });

    await test.step('Continue is disabled before connecting', async () => {
      await expect(wizard.continueButton).toBeDisabled();
    });

    await test.step('Back button is visible', async () => {
      await expect(wizard.backButton).toBeVisible();
    });

    await test.step('step indicator still shows 4 steps', async () => {
      await expect(wizard.stepSelectLabel).toBeVisible();
      await expect(wizard.stepUploadLabel).toBeVisible();
      await expect(wizard.stepConnectLabel).toBeVisible();
      await expect(wizard.stepReviewLabel).toBeVisible();
    });
  });

  // Separate test: Back navigation (needs its own upload).
  test('Back button on step 3 returns to step 2', async ({ page }) => {
    const wizard = await navigateToStep3(page);
    await wizard.backButton.click();
    await expect(wizard.step2FileHeading).toBeVisible({ timeout: 10000 });
  });
});
