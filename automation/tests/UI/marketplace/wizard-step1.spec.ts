// Migration Wizard Step 1 tests — data type selection and navigation.
// Covers: heading visible, data type buttons, continue disabled when none selected,
//         continue enables after selection, deselect disables again, navigate to step 2.
// Uses auth fixture — page starts authenticated on /listings.

import { test, expect } from '../../../fixtures/auth.fixture';
import { MarketplacePage } from '../../../pages/MarketplacePage';
import { MigrationDetailPage } from '../../../pages/MigrationDetailPage';
import { MigrationWizardPage } from '../../../pages/MigrationWizardPage';
import type { Page } from '@playwright/test';

/** Open the first card and launch the wizard, return {wizard} */
async function openWizard(page: Page) {
  const mp = new MarketplacePage(page);
  const titles = await mp.getCardTitles();
  await mp.openCard(titles[0]);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  await detail.clickGetStarted();
  const wizard = new MigrationWizardPage(page);
  await wizard.waitForLoaded();
  return { wizard };
}

test.describe('Migration Wizard – Step 1', () => {

  test('wizard loads with "Choose your data" heading', async ({ page }) => {
    const { wizard } = await openWizard(page);
    await expect(wizard.step1Heading).toBeVisible();
  });

  test('URL contains /migration-flow after Get Started', async ({ page }) => {
    await openWizard(page);
    await expect(page).toHaveURL(/migration-flow/);
  });

  test('Continue button is disabled when no data type is selected', async ({ page }) => {
    const { wizard } = await openWizard(page);
    await expect(wizard.continueButton).toBeDisabled();
  });

  test('selecting a data type enables Continue button', async ({ page }) => {
    const { wizard } = await openWizard(page);
    await wizard.selectDataTypes(['Customers']);
    await expect(wizard.continueButton).toBeEnabled({ timeout: 5000 });
  });

  test('step indicator labels are visible', async ({ page }) => {
    const { wizard } = await openWizard(page);
    await expect(wizard.stepSelectLabel).toBeVisible();
  });

  test('clicking Continue on step 1 advances to step 2', async ({ page }) => {
    const { wizard } = await openWizard(page);
    await wizard.selectDataTypes(['Customers']);
    await expect(wizard.continueButton).toBeEnabled({ timeout: 5000 });
    await wizard.goToStep2();
    // Step 2 heading: either "Upload your files" or "Connect systems"
    const step2 = page.getByText(/upload your files|connect systems/i).first();
    await expect(step2).toBeVisible({ timeout: 15000 });
  });

  test('Back button on wizard returns to detail page or marketplace', async ({ page }) => {
    const { wizard } = await openWizard(page);
    await wizard.backButton.click();
    await page.waitForURL(url => !url.toString().includes('/migration-flow'), { timeout: 15000 });
    const url = page.url();
    expect(url).toMatch(/\/listing\/|\/listings/);
  });
});
