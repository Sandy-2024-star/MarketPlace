// My Projects tab tests — /listings?tab=projects
// Covers: heading visible, empty state or project cards, sidebar nav active, back to marketplace.
// Uses auth fixture — page starts authenticated on /listings.

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage = require('../../../pages/MarketplacePage');

test.describe('My Projects Tab', () => {

  test('My Projects heading is visible after navigating', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToMyProjects();
    const heading = page.getByRole('heading', { name: 'My Projects' });
    await expect(heading).toBeVisible({ timeout: 15000 });
  });

  test('URL includes ?tab=projects after clicking My Projects', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToMyProjects();
    await expect(page).toHaveURL(/[?&]tab=projects/);
  });

  test('My Projects tab shows either projects or an empty state message', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToMyProjects();
    await page.waitForTimeout(1000);
    const hasProjects = await page.locator('[data-testid*="project"], .project-card, h3').count() > 0;
    const hasEmptyMsg = await page.getByText(/no projects|no migration|get started|start your first/i).isVisible().catch(() => false);
    // Either projects exist or empty state is shown
    expect(hasProjects || hasEmptyMsg).toBeTruthy();
  });

  test('Marketplace nav link returns to /listings from My Projects', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToMyProjects();
    await mp.navMarketplace.click();
    await expect(page).toHaveURL(/\/listings/);
    await mp.waitForLoaded();
    await expect(mp.heading).toBeVisible();
  });

  test('sidebar nav My Projects button is visible on My Projects tab', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToMyProjects();
    await expect(mp.navMyProjects).toBeVisible();
  });

  test('deep link to /listings?tab=projects loads My Projects directly', async ({ page }) => {
    const config = require('../../../utils/config');
    await page.goto(`${config.baseURL}/listings?tab=projects`, { waitUntil: 'domcontentloaded' });
    const heading = page.getByRole('heading', { name: 'My Projects' });
    await expect(heading).toBeVisible({ timeout: 15000 });
  });
});
