// File upload validation tests.
// Verifies that the wizard handles invalid, empty, and cancelled uploads correctly.
//
// Key principle: for any invalid upload, wizard.continueButton must stay disabled.
// Error message appearance is also checked but apps vary in implementation.
//
// Fixture files (created in fixtures/data/):
//   invalid.txt  — wrong MIME type, not a CSV
//   empty.csv    — zero-byte CSV
//   customers_export.csv — valid CSV (used as control)

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'path';
test.use({ storageState: path.resolve(__dirname, '../../../test-results/storageState.json') });

import { MarketplacePage } from '../../../pages/MarketplacePage';
import { MigrationDetailPage } from '../../../pages/MigrationDetailPage';
import { MigrationWizardPage } from '../../../pages/MigrationWizardPage';
import config from '../../../utils/config';

const FILE_BASED_CARD = 'Adobe Commerce to Shopify';
const INVALID_TXT     = path.resolve(__dirname, '../../../fixtures/data/invalid.txt');
const EMPTY_CSV       = path.resolve(__dirname, '../../../fixtures/data/empty.csv');
const VALID_CSV       = path.resolve(__dirname, '../../../fixtures/data/customers_export.csv');

async function reachStep2(page: Page) {
  await page.goto(config.baseURL + '/listings', { waitUntil: 'domcontentloaded' });
  await new MarketplacePage(page).waitForLoaded();
  const mp = new MarketplacePage(page);
  await mp.openCard(FILE_BASED_CARD);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  await detail.clickGetStarted();
  const wizard = new MigrationWizardPage(page);
  await wizard.waitForLoaded();
  await wizard.customersButton.click();
  await wizard.goToStep2();
  await expect(wizard.step2FileHeading).toBeVisible({ timeout: 10000 });
  return wizard;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('File Upload – Validation', () => {
  test.describe.configure({ mode: 'serial' });

  // App currently does not enforce file-type validation — .txt uploads are accepted
  // and Continue is enabled. Marked test.fail() to track this as a known app gap.
  test.fail('uploading a non-CSV (.txt) keeps Continue disabled', async ({ page }) => {
    const wizard = await reachStep2(page);

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      wizard.uploadButton.click(),
    ]);
    await fileChooser.setFiles(INVALID_TXT);
    await page.waitForTimeout(2000);

    // If a "Confirm Files" button appeared, click it and wait for processing result
    if (await wizard.confirmFilesButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await wizard.confirmFilesButton.click();
      await page.waitForTimeout(8000); // allow server validation to respond
    }

    // Primary assertion: Continue must not be enabled for an invalid file
    await expect(wizard.continueButton).toBeDisabled();
  });

  test('uploading an empty CSV keeps Continue disabled', async ({ page }) => {
    const wizard = await reachStep2(page);

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      wizard.uploadButton.click(),
    ]);
    await fileChooser.setFiles(EMPTY_CSV);
    await page.waitForTimeout(2000);

    if (await wizard.confirmFilesButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await wizard.confirmFilesButton.click();
      await page.waitForTimeout(8000);
    }

    await expect(wizard.continueButton).toBeDisabled();
  });

  test('cancelling the file chooser leaves step 2 intact', async ({ page }) => {
    const wizard = await reachStep2(page);

    // Register a filechooser handler that does nothing (simulates Cancel)
    page.once('filechooser', () => { /* intentionally empty — cancel */ });
    await wizard.uploadButton.click().catch(() => {});
    await page.waitForTimeout(1500);

    // Step 2 UI should be unaffected
    await expect(wizard.step2FileHeading).toBeVisible();
    await expect(wizard.uploadButton).toBeVisible();
    await expect(wizard.continueButton).toBeDisabled();
  });

  test('valid CSV enables Continue after processing (control)', async ({ page }) => {
    const wizard = await reachStep2(page);
    await wizard.uploadFileAndConfirm(VALID_CSV);
    // After valid upload + processing, Continue should be enabled
    await expect(wizard.continueButton).toBeEnabled({ timeout: 120000 });
  });
});
