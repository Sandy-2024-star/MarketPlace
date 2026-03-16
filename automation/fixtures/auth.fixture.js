// Auth fixture — extends Playwright's base test with a pre-authenticated page.
//
// Usage in any spec file:
//
//   const { test, expect } = require('../fixtures/auth.fixture');
//
//   test('my test', async ({ page }) => {
//     // page is already logged in and sitting on /listings
//   });
//
// The storageState is written by global-setup.js once before the suite.
// Tests that need a *fresh* unauthenticated page should still use the stock
// `@playwright/test` import and call LoginPage manually.

const { test: base, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const MarketplacePage = require('../pages/MarketplacePage');
const config = require('../utils/config');
const { withRetry } = require('../utils/retry');

// Primary path (written by global-setup). Falls back to fixtures/ copy if test-results is cleared.
const STATE_FILE = path.resolve(__dirname, '../test-results/storageState.json');
const STATE_FILE_BACKUP = path.resolve(__dirname, '.auth.json');

const test = base.extend({
  // Override the default `page` fixture to inject auth state and land on /listings.
  page: async ({ browser }, use) => {
    const stateFile = fs.existsSync(STATE_FILE) ? STATE_FILE : STATE_FILE_BACKUP;
    const context = await browser.newContext({ storageState: stateFile });
    const page = await context.newPage();

    await withRetry(
      () => page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' }),
      { label: 'auth.fixture goto /listings' }
    );
    await new MarketplacePage(page).waitForLoaded();

    await use(page);
    await context.close();
  },
});

module.exports = { test, expect };
