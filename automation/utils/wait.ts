// Centralised wait helpers — single source of truth for all loading indicators.
// Every page object and spec should use these instead of inline locator waits.

import type { Page } from '@playwright/test';

/**
 * Wait for the generic "Loading..." spinner to disappear.
 * Safe to call even if the spinner never appears (catch swallows the timeout).
 */
export async function waitForSpinner(page: Page, timeout = 20000): Promise<void> {
  await page.locator('text=Loading...').waitFor({ state: 'hidden', timeout }).catch(() => {});
}

/**
 * Wait for the migration detail "Loading migration details..." overlay to disappear.
 */
export async function waitForDetailSpinner(page: Page, timeout = 20000): Promise<void> {
  await page.locator('text=Loading migration details...').waitFor({ state: 'hidden', timeout }).catch(() => {});
}

/**
 * Wait for a specific heading text to become visible.
 */
export async function waitForHeading(page: Page, text: string | RegExp, timeout = 20000): Promise<void> {
  await page.getByRole('heading', { name: text }).waitFor({ state: 'visible', timeout });
}
