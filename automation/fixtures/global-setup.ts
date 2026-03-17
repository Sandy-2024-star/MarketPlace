// Global setup — logs in once and saves storageState to disk.
// Used by wizard.spec.ts (and any other heavy serial suite) to skip per-test login.

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.BASE_URL || 'https://marketplace.flow.staging.linktoany.com';
const USERNAME = process.env.USERNAME || 'Automation';
const PASSWORD = process.env.PASSWORD || '';

const STATE_FILE        = path.resolve(__dirname, '../test-results/storageState.json');
const STATE_FILE_BACKUP = path.resolve(__dirname, '.auth.json');

export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch();
  const page    = await browser.newPage();

  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'load' });
  await page.locator('input[placeholder="Enter your username"]').fill(USERNAME);
  await page.locator('input[placeholder="Enter your password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(
    url => url.toString().includes('/listings') || url.toString().includes('/onboarding'),
    { timeout: 30000 }
  );
  if (!page.url().includes('/listings')) {
    await page.goto(`${BASE_URL}/listings`, { waitUntil: 'load' });
  }

  await page.context().storageState({ path: STATE_FILE });
  fs.copyFileSync(STATE_FILE, STATE_FILE_BACKUP);
  console.log('[global-setup] ✓ Auth state saved →', STATE_FILE);

  await browser.close();
}
