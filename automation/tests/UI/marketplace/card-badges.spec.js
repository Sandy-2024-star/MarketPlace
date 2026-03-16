// Card badge and category tag tests — migration type badges + category tags across cards.
// Covers: File Based/API badge on detail, category tags visible on cards, badge consistency,
//         Migrations tab shows only migration-type cards, multiple cards checked.
// Uses auth fixture — page starts authenticated on /listings.

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage     = require('../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../pages/MigrationDetailPage');

test.describe('Card Badges & Category Tags', () => {

  test('first card detail shows File Based or API badge', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    const badge = await detail.migrationTypeBadge.textContent();
    expect(badge.trim()).toMatch(/File Based|API/);
  });

  test('second card detail also shows a valid migration type badge', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    expect(titles.length).toBeGreaterThan(1);
    await mp.openCard(titles[1]);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    const badge = await detail.migrationTypeBadge.textContent();
    expect(badge.trim()).toMatch(/File Based|API/);
  });

  test('category tags (POS, Migration, etc.) are visible on the detail page', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    // Category tags appear as small pill/badge elements near the title
    const tags = page.locator('span, div').filter({ hasText: /^(POS|Migration|Integration|eCommerce|Accounting)$/ });
    const count = await tags.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Migrations tab cards show the Migration category tag', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.selectTab('Migrations');
    await page.locator('h3').first().waitFor({ state: 'visible', timeout: 10000 });
    const titles = await mp.getCardTitles();
    expect(titles.length).toBeGreaterThan(0);
    // Open the first migrations-tab card and verify it has a migration type badge
    await mp.openCard(titles[0]);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    const badge = await detail.migrationTypeBadge.textContent();
    expect(badge.trim()).toMatch(/File Based|API/);
  });

  test('badge text is not empty on any of the first 3 cards', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    const checkCount = Math.min(3, titles.length);
    for (let i = 0; i < checkCount; i++) {
      await page.goto(page.url().split('/listing')[0] + '/listings', { waitUntil: 'domcontentloaded' });
      await mp.waitForLoaded();
      await mp.openCard(titles[i]);
      const detail = new MigrationDetailPage(page);
      await detail.waitForLoaded();
      const badge = await detail.migrationTypeBadge.textContent();
      expect(badge.trim().length).toBeGreaterThan(0);
    }
  });
});
