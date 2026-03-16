// Navigation helpers — eliminates the repeated "waitForURL + conditional goto" pattern.

const config = require('./config');

/**
 * After login, ensure the browser is on /listings.
 * Handles the two post-login destinations: /listings (normal) and /onboarding (first-time users).
 * @param {import('@playwright/test').Page} page
 */
async function ensureOnListings(page) {
  await page.waitForURL(
    url => url.toString().includes('/listings') || url.toString().includes('/onboarding'),
    { timeout: config.defaultTimeout }
  );
  if (!page.url().includes('/listings')) {
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
  }
}

module.exports = { ensureOnListings };
