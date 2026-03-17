// Shared Playwright fixture wrapping all tests with a stealth browser.
// Bypasses Shopify bot detection (Cloudflare Turnstile) via puppeteer-extra-plugin-stealth.
// Always import { test, expect } from this file — NOT from @playwright/test.

import { test as base, expect } from '@playwright/test';
import type { Browser } from '@playwright/test';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require('playwright-extra');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

const test = base.extend<object, { browser: Browser }>({
  browser: [async (_args: object, use: (b: Browser) => Promise<void>) => {
    const isHeaded = process.env.HEADED === 'true' || process.env.HEADED === undefined;
    const browser  = await chromium.launch({ headless: !isHeaded }) as Browser;
    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],

  page: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page    = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { test, expect };
