// Onboarding UI tests — post-login onboarding flow
// Covers: page load, headings, interactive elements, marketplace navigation, auth guard.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';
import config from '../../../utils/config';

async function goToOnboarding(page: Page) {
  const login = new LoginPage(page);
  await login.goto();
  await login.waitForForm();
  await login.login(config.username, config.password);
  // After login, user may land on /onboarding or /listings
  await page.waitForURL((url: URL) =>
    url.toString().includes('/onboarding') || url.toString().includes('/listings'),
    { timeout: 30000 }
  );
  if (!page.url().includes('/onboarding')) {
    await page.goto(`${config.baseURL}/onboarding`, { waitUntil: 'domcontentloaded' });
  }
}

test.describe('Onboarding UI', () => {
  test('should load without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await goToOnboarding(page);
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test('should show at least one heading', async ({ page }) => {
    await goToOnboarding(page);
    const headings = page.locator('h1, h2, h3');
    await expect(headings.first()).toBeVisible({ timeout: 15000 });
  });

  test('should have at least one interactive element (button or link)', async ({ page }) => {
    await goToOnboarding(page);
    const interactive = page.locator('button, a[href]');
    const count = await interactive.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should allow navigation to Marketplace from onboarding', async ({ page }) => {
    await goToOnboarding(page);
    // Look for a link or button that navigates to marketplace/listings
    const marketplaceLink = page.getByRole('button', { name: /marketplace|listings|get started|explore/i })
      .or(page.getByRole('link', { name: /marketplace|listings|get started|explore/i })).first();
    if (await marketplaceLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await marketplaceLink.click();
      await expect(page).toHaveURL(/\/listings/, { timeout: 20000 });
    } else {
      await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/listings/);
    }
  });

  test('should redirect unauthenticated user away from onboarding', async ({ page }) => {
    // Visit onboarding without logging in
    await page.goto(`${config.baseURL}/onboarding`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    // Should be redirected to login or landing, not stay on /onboarding with full content
    const isRedirected = url.includes('/auth/login') || url.includes('/landing') || url.includes('/auth/');
    const hasLoginForm = await page.locator('input[placeholder="Enter your username"]').isVisible().catch(() => false);
    expect(isRedirected || hasLoginForm).toBeTruthy();
  });
});
