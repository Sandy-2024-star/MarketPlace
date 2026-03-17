// Playwright fixture for all Shopify SSO tests.
//
// Session loading priority:
//   1. SHOPIFY_SESSION_B64 env var (CI) — base64-encoded session JSON injected as a secret
//   2. tests/auth/.shopify-session.json on disk (local dev)
//   3. No session — logs warning (prevents silent failures)

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { test as base, expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require('playwright-extra');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

interface SessionMeta {
  capturedAt?: string;
  shopifyUser?: string;
  shopHandle?: string;
  checkpoint?: string;
  version?: number;
}

interface ShopifySession {
  meta?: SessionMeta;
  cookies: unknown[];
  origins: unknown[];
}

const SESSION_FILE         = path.resolve(__dirname, '../tests/UI/auth/.shopify-session.json');
const SESSION_MAX_AGE_DAYS = parseInt(process.env.SHOPIFY_SESSION_MAX_AGE_DAYS || '7', 10);

function resolveSession(): ShopifySession | null {
  if (process.env.SHOPIFY_SESSION_B64) {
    const json = Buffer.from(process.env.SHOPIFY_SESSION_B64, 'base64').toString('utf8');
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, json);
    console.log('[sso] Session written from SHOPIFY_SESSION_B64 (CI mode)');
    return JSON.parse(json) as ShopifySession;
  }

  if (!fs.existsSync(SESSION_FILE)) {
    console.log('[sso] No session file found.');
    console.log('[sso] Run: node tests/auth/capture_session.js');
    return null;
  }

  let session: ShopifySession;
  try {
    session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) as ShopifySession;
  } catch {
    console.log('[sso] Session file is malformed — re-run: node tests/auth/capture_session.js');
    return null;
  }

  const meta = session.meta ?? {};
  if (meta.capturedAt) {
    const ageMs    = Date.now() - new Date(meta.capturedAt).getTime();
    const ageHours = Math.round(ageMs / 3600000);
    const ageDays  = (ageMs / 86400000).toFixed(1);
    const maxMs    = SESSION_MAX_AGE_DAYS * 24 * 3600000;
    console.log(`[sso] Session loaded → checkpoint=${meta.checkpoint ?? 'unknown'}, age=${ageHours}h (${ageDays}d)`);
    if (ageMs > maxMs) {
      console.warn(`[sso] ⚠ Session is ${ageDays} days old (max ${SESSION_MAX_AGE_DAYS}d). Consider refreshing.`);
      console.warn('[sso]   Run: node tests/auth/capture_session.js');
    }
  } else {
    console.log('[sso] Session loaded (v1 — no metadata). Run capture_session.js to upgrade.');
  }

  return session;
}

const test = base.extend<object, { browser: Browser }>({
  browser: [async (_args: object, use: (b: Browser) => Promise<void>) => {
    const isHeaded = process.env.HEADED !== 'false';
    const browser  = await chromium.launch({ headless: !isHeaded }) as Browser;
    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],

  page: async ({ browser }, use) => {
    const session     = resolveSession();
    const contextOpts = session ? { storageState: SESSION_FILE } : {};
    const context     = await browser.newContext(contextOpts);
    const page        = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { test, expect };
