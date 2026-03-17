// Navigation helpers — eliminates the repeated "waitForURL + conditional goto" pattern.

import type { Page } from '@playwright/test';
import config from './config';

/**
 * After login, ensure the browser is on /listings.
 * Handles the two post-login destinations: /listings (normal) and /onboarding (first-time users).
 */
export async function ensureOnListings(page: Page): Promise<void> {
  await page.waitForURL(
    url => url.toString().includes('/listings') || url.toString().includes('/onboarding'),
    { timeout: config.defaultTimeout }
  );
  if (!page.url().includes('/listings')) {
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
  }
}
