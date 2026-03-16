// Sign-out tests from the authenticated Marketplace context.
// Covers: user menu display, open/close, Escape key dismiss, sign-out flow, post-logout guard.
// Uses auth fixture — page starts authenticated on /listings.

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage = require('../../../pages/MarketplacePage');

test.describe('Sign Out (Marketplace)', () => {

  test('user menu button is visible and shows email', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await expect(mp.userMenuButton).toBeVisible();
    const label = await mp.userMenuButton.textContent();
    expect(label).toMatch(/@/);
  });

  test('clicking user menu opens Sign out option', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.userMenuButton.click();
    await expect(mp.signOutItem).toBeVisible({ timeout: 5000 });
  });

  test('user menu closes on Escape key', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.userMenuButton.click();
    await expect(mp.signOutItem).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(mp.signOutItem).not.toBeVisible({ timeout: 3000 });
  });

  test('sign out redirects away from /listings', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.signOut();
    await page.waitForURL(/\/(auth\/login|login|sign-in|landing)/, { timeout: 15000 });
    expect(page.url()).not.toMatch(/\/listings/);
  });

  test('after sign out /listings redirects to login', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.signOut();
    await page.waitForURL(/\/(auth\/login|login|sign-in|landing)/, { timeout: 15000 });
    await page.goto(page.url().replace(/\/(auth\/login|login|sign-in|landing).*/, '/listings'));
    await page.waitForTimeout(2000);
    expect(page.url()).not.toMatch(/\/listings/);
  });

});
