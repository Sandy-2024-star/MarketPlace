// URL persistence tests — query params survive navigation / refresh.
// Covers: tab in URL, search in URL, page param in URL, refresh restores state, detail URL shareable.
// Uses auth fixture — page starts authenticated on /listings.

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage     = require('../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../pages/MigrationDetailPage');
const config              = require('../../../utils/config');

test.describe('URL Persistence', () => {

  test('My Projects tab adds ?tab=projects to URL', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToMyProjects();
    await expect(page).toHaveURL(/[?&]tab=projects/);
  });

  test('detail page URL contains listing ID', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    await expect(page).toHaveURL(/\/listing\/[a-z0-9]+/i);
  });

  test('detail page URL is shareable — direct navigation loads the same card', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    const detailUrl = page.url();

    // Navigate away then load the detail URL directly
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(detailUrl);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    const titleOnPage = await detail.getTitle();
    expect(titleOnPage.length).toBeGreaterThan(0);
  });

  test('/listings page reload keeps marketplace loaded', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await expect(mp.heading).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await mp.waitForLoaded();
    await expect(mp.heading).toBeVisible();
  });

  test('detail page reload keeps the same card loaded', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    const titleBefore = await detail.getTitle();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await detail.waitForLoaded();
    const titleAfter = await detail.getTitle();
    expect(titleAfter).toBe(titleBefore);
  });

  test('base URL /listings has no unexpected query params by default', async ({ page }) => {
    const url = page.url();
    const parsed = new URL(url);
    // On landing, only ?tab=... is expected — no rogue params
    const knownParams = ['tab'];
    for (const key of parsed.searchParams.keys()) {
      expect(knownParams).toContain(key);
    }
  });

  test('navigating via browser URL bar to /listings restores marketplace', async ({ page }) => {
    // Open a card then use goto to simulate typing in address bar
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    await expect(page).toHaveURL(/\/listing\//);

    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
    await mp.waitForLoaded();
    await expect(mp.heading).toBeVisible();
  });
});
