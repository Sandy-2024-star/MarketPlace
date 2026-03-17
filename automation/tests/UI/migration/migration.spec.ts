// My Projects UI tests — /listings?tab=projects
// Covers: heading, project count, search, filter buttons, sidebar nav.
// Uses auth fixture — page starts authenticated on /listings.

import { test, expect } from '../../../fixtures/auth.fixture';
import { MigrationPage } from '../../../pages/MigrationPage';
import { MarketplacePage } from '../../../pages/MarketplacePage';

test.describe('My Projects UI', () => {
  test.beforeEach(async ({ page }) => {
    const mp = new MigrationPage(page);
    await mp.goto();
    await mp.waitForLoaded();
  });

  test('should display My Projects heading', async ({ page }) => {
    const mp = new MigrationPage(page);
    await expect(mp.heading).toBeVisible();
  });

  test('should display active project count', async ({ page }) => {
    const mp = new MigrationPage(page);
    await expect(mp.projectCount).toBeVisible();
    const text = await mp.projectCount.textContent();
    expect(text).toMatch(/\d+/);
  });

  test('should have a working search input', async ({ page }) => {
    const mp = new MigrationPage(page);
    await expect(mp.searchInput).toBeVisible();
    await mp.search('test');
    await page.waitForTimeout(500);
    // No error expected
    await expect(mp.heading).toBeVisible();
  });

  test('should show filter buttons (Sources, Targets, Status)', async ({ page }) => {
    const mp = new MigrationPage(page);
    await expect(mp.sourceFilter).toBeVisible();
    await expect(mp.targetFilter).toBeVisible();
    await expect(mp.statusFilter).toBeVisible();
  });

  test('should be accessible via sidebar nav', async ({ page }) => {
    // Navigate away first, then use sidebar
    const marketplace = new MarketplacePage(page);
    await marketplace.goto();
    await marketplace.waitForLoaded();
    await marketplace.goToMyProjects();
    const mp = new MigrationPage(page);
    await expect(mp.heading).toBeVisible({ timeout: 20000 });
  });
});
