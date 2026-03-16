// File Assist page tests — sidebar tab within /listings
//
// File Assist is a tab-based view that stays at /listings. It provides
// file management support for migration workflows.
//
// Covers: navigation, page load, heading visibility, sidebar state,
//         interactive content, return to marketplace.
//
// Uses auth fixture — page starts authenticated on /listings.

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage = require('../../../pages/MarketplacePage');

test.describe('File Assist', () => {

  test('File Assist nav button is visible in sidebar', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await expect(mp.navFileAssist).toBeVisible();
  });

  test('clicking File Assist loads the section with a heading', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToFileAssist();
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 15000 });
  });

  test('URL stays at /listings after navigating to File Assist', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToFileAssist();
    await expect(page).toHaveURL(/\/listings/);
  });

  test('File Assist section contains at least one interactive element', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToFileAssist();
    await page.waitForTimeout(1000);
    const hasInteractive =
      await page.locator('button').first().isVisible({ timeout: 5000 }).catch(() => false) ||
      await page.locator('input').first().isVisible({ timeout: 3000 }).catch(() => false) ||
      await page.locator('[role="button"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasInteractive, 'File Assist should show at least one interactive element').toBe(true);
  });

  test('sidebar nav buttons remain visible from File Assist', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToFileAssist();
    await expect(mp.navMarketplace).toBeVisible();
    await expect(mp.navMyProjects).toBeVisible();
    await expect(mp.navFileAssist).toBeVisible();
  });

  test('Marketplace nav link returns to marketplace from File Assist', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToFileAssist();
    await mp.navMarketplace.click();
    await mp.waitForLoaded();
    await expect(mp.heading).toBeVisible();
    await expect(page.locator('h3').first()).toBeVisible();
  });

  test('page does not crash on File Assist — no JS errors thrown', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    const mp = new MarketplacePage(page);
    await mp.goToFileAssist();
    await page.waitForTimeout(1500);
    expect(errors, `JS errors on File Assist: ${errors.join('; ')}`).toHaveLength(0);
  });

});
