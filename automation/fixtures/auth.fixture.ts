// Auth fixture — extends Playwright's base test with a pre-authenticated page.
//
// Usage in any spec file:
//   import { test, expect } from '../fixtures/auth.fixture';
//
//   test('my test', async ({ page }) => {
//     // page is already logged in and sitting on /listings
//   });

import { test as base, expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { MarketplacePage } from '../pages/MarketplacePage';
import config from '../utils/config';
import { withRetry } from '../utils/retry';

const STATE_FILE        = path.resolve(__dirname, '../test-results/storageState.json');
const STATE_FILE_BACKUP = path.resolve(__dirname, '.auth.json');

const test = base.extend<object, { browser: Browser }>({
  page: async ({ browser }, use) => {
    const stateFile = fs.existsSync(STATE_FILE) ? STATE_FILE : STATE_FILE_BACKUP;
    const context   = await browser.newContext({ storageState: stateFile });
    const page      = await context.newPage();

    await withRetry(
      () => page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' }),
      { label: 'auth.fixture goto /listings' }
    );
    await new MarketplacePage(page).waitForLoaded();

    await use(page);
    await context.close();
  },
});

export { test, expect };
