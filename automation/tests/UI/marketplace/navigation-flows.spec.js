// Navigation flow tests — browser history, deep links, sidebar nav, external links.
// Uses auth fixture — page starts authenticated on /listings.

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage     = require('../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../pages/MigrationDetailPage');

test.describe('Navigation Flows', () => {

  test('browser back from detail returns to marketplace', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    await expect(page).toHaveURL(/\/listing\//);
    await page.goBack();
    await expect(page).toHaveURL(/\/listings/);
    await expect(mp.heading).toBeVisible();
  });

  test('browser forward after back re-opens detail page', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    await page.goBack();
    await expect(page).toHaveURL(/\/listings/);
    await page.goForward();
    await expect(page).toHaveURL(/\/listing\//);
  });

  test('deep link to /listings loads marketplace directly', async ({ page, browser }) => {
    const config = require('../../../utils/config');
    // Navigate directly via URL (same session cookie)
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
    const mp = new MarketplacePage(page);
    await mp.waitForLoaded();
    await expect(mp.heading).toBeVisible();
  });

  test('sidebar My Projects link navigates correctly', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToMyProjects();
    await expect(page).not.toHaveURL(/\/listings$/);
  });

  test('sidebar File Assist link is clickable and page remains stable', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToFileAssist();
    // File Assist is a tab within /listings — URL stays the same but page should remain stable
    await expect(page).toHaveURL(/\/listings/);
    await expect(mp.navFileAssist).toBeVisible();
  });

  test('sidebar Marketplace link is visible and active on /listings', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await expect(mp.navMarketplace).toBeVisible();
    // Navigate away and come back via sidebar
    await mp.goToMyProjects();
    await mp.navMarketplace.click();
    await expect(page).toHaveURL(/\/listings/);
    await expect(mp.heading).toBeVisible();
  });

  test('Watch Demo Video opens without navigating away from detail', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    const detailUrl = page.url();
    // Watch Demo Video may open a modal or new tab — page URL should not change
    const [newPageOrSame] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null),
      page.getByRole('button', { name: /watch demo/i }).click(),
    ]);
    // Whether it opens a new tab or modal, the detail page URL should remain intact
    expect(page.url()).toBe(detailUrl);
  });

  test('unauthenticated access to /listings redirects to login', async ({ browser }) => {
    const freshCtx = await browser.newContext(); // no storageState
    const freshPage = await freshCtx.newPage();
    const config = require('../../../utils/config');
    await freshPage.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
    // Should land on login or landing page, not /listings
    const url = freshPage.url();
    expect(url).not.toMatch(/\/listings/);
    await freshCtx.close();
  });
});
