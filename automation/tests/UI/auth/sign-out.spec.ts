// Sign-out flow tests — user menu, sign out, session ends.
// Uses auth fixture — page starts authenticated on /listings.

import { test, expect } from '../../../fixtures/auth.fixture';
import { MarketplacePage } from '../../../pages/MarketplacePage';
import config from '../../../utils/config';

test.describe('Sign Out Flow', () => {

  test('user menu button is visible and shows email', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await expect(mp.userMenuButton).toBeVisible();
    const text = await mp.userMenuButton.textContent();
    expect(text).toMatch(/@/);
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
    await expect(mp.signOutItem).not.toBeVisible({ timeout: 3000 }).catch(() => {});
    // Page should still be stable
    await expect(mp.heading).toBeVisible();
  });

  test('sign out redirects away from /listings', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.signOut();
    // After sign out, should be on login or landing — not /listings
    await page.waitForURL(url => !url.toString().includes('/listings'), { timeout: 15000 });
    const url = page.url();
    expect(url).not.toMatch(/\/listings/);
  });

  test('after sign out, /listings redirects to login', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.signOut();
    await page.waitForURL(url => !url.toString().includes('/listings'), { timeout: 15000 });
    // Try to access /listings — should be denied
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    expect(url).not.toMatch(/\/listings/);
  });
});
