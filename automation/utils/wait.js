// Centralised wait helpers — single source of truth for all loading indicators.
// Every page object and spec should use these instead of inline locator waits.

/**
 * Wait for the generic "Loading..." spinner to disappear.
 * Safe to call even if the spinner never appears (catch swallows the timeout).
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout=20000]
 */
async function waitForSpinner(page, timeout = 20000) {
  await page.locator('text=Loading...').waitFor({ state: 'hidden', timeout }).catch(() => {});
}

/**
 * Wait for the migration detail "Loading migration details..." overlay to disappear.
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout=20000]
 */
async function waitForDetailSpinner(page, timeout = 20000) {
  await page.locator('text=Loading migration details...').waitFor({ state: 'hidden', timeout }).catch(() => {});
}

/**
 * Wait for a specific heading text to become visible.
 * @param {import('@playwright/test').Page} page
 * @param {string|RegExp} text
 * @param {number} [timeout=20000]
 */
async function waitForHeading(page, text, timeout = 20000) {
  await page.getByRole('heading', { name: text }).waitFor({ state: 'visible', timeout });
}

module.exports = { waitForSpinner, waitForDetailSpinner, waitForHeading };
