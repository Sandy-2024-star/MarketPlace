// Shared Playwright fixture wrapping all tests with a stealth browser.
// Bypasses Shopify bot detection (Cloudflare Turnstile) via puppeteer-extra-plugin-stealth.
// Always import { test, expect } from this file — NOT from @playwright/test.

const { test: base, expect } = require('@playwright/test');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

const test = base.extend({
  browser: [async ({}, use) => {
    const isHeaded = process.env.HEADED === 'true' || process.env.HEADED === undefined;
    const browser = await chromium.launch({ headless: !isHeaded });
    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],

  page: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

module.exports = { test, expect };
