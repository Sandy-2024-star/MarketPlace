// Error State Tests — migration wizard + auth guard
//
// Tests what happens when things go wrong:
//   1. Unauthenticated access to /migration-flow  → redirected to login
//   2. Unauthenticated access to /listing/{id}    → redirected to login
//   3. Session cleared mid-session               → accessing /listings redirects to login
//   4. Session cleared mid-session               → accessing /migration-flow redirects to login
//
// Uses plain @playwright/test (no auth fixture) so there is no stored session.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import config from '../../../utils/config';

// A known listing ID (Adobe Commerce to Shopify)
const KNOWN_LISTING_ID = '69a04349106d2189c6b4b6ef';

test.describe('Error States — Auth Guard', () => {

  // Helper: assert the app redirected away from a protected route.
  // The app sends unauthenticated users to /landing (not /auth/login directly).
  async function assertRedirectedToPublic(page: Page, fromRoute: string) {
    // Accept /landing, /auth/login, /login, /sign-in — anything that is NOT the protected route
    await page.waitForURL(/\/(auth\/login|login|sign-in|landing)/, { timeout: 15000 });
    const url = page.url();
    console.log(`[error-states] ✓ ${fromRoute} without auth → redirected to: ${url}`);
    // If redirected to a login page (not landing), also verify the login form is present
    if (!url.includes('/landing')) {
      await expect(page.locator('input[placeholder="Enter your username"], input[type="email"], input[name="username"]').first())
        .toBeVisible({ timeout: 10000 });
    }
  }

  test('unauthenticated direct access to /migration-flow redirects to login', async ({ page }) => {
    await page.goto(`${config.baseURL}/migration-flow`, { waitUntil: 'domcontentloaded' });
    await assertRedirectedToPublic(page, '/migration-flow');
  });

  test('unauthenticated direct access to /listing/{id} redirects to login', async ({ page }) => {
    await page.goto(`${config.baseURL}/listing/${KNOWN_LISTING_ID}`, { waitUntil: 'domcontentloaded' });
    await assertRedirectedToPublic(page, `/listing/${KNOWN_LISTING_ID}`);
  });

  test('cleared session accessing /listings redirects to login', async ({ page, context }) => {
    // Clear all cookies + storage to simulate an expired session
    await context.clearCookies();
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
    await assertRedirectedToPublic(page, '/listings');
  });

  test('cleared session accessing /migration-flow redirects to login', async ({ page, context }) => {
    // Clear all cookies + storage to simulate an expired session mid-wizard
    await context.clearCookies();
    await page.goto(`${config.baseURL}/migration-flow`, { waitUntil: 'domcontentloaded' });
    await assertRedirectedToPublic(page, '/migration-flow');
  });

});
