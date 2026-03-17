// Playwright configuration for the Flow Marketplace automation framework.
// Enables retries, parallel execution, HTML reports, screenshots on failure, and tracing.
// Stealth mode: set STEALTH_MODE=true in .env to suppress automation fingerprints.

import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { getStealthLaunchArgs } from './utils/stealth';

// Load env for config and tests
dotenv.config({
  path: path.resolve(__dirname, '.env'),
});

const baseURL = process.env.BASE_URL || 'https://marketplace.flow.staging.linktoany.com';

// QA Analytics reporter — only loaded when the module is present locally.
// Set QA_API_URL in .env to activate. Safe to run without qa-analytics.
const qaReporterPath = path.resolve(__dirname, '../qa-analytics/integrations/playwright-reporter.ts');
const qaReporter: [string, object][] = fs.existsSync(qaReporterPath)
  ? [[qaReporterPath, {
      apiUrl:  process.env.QA_API_URL || 'http://localhost:4000',
      suiteId: process.env.QA_SUITE  || 'migration-ui',
      branch:  process.env.BRANCH    || process.env.CI_COMMIT_BRANCH || 'main',
    }]]
  : [];

export default defineConfig({
  testDir: './tests',
  // Shopify SSO tests require external credentials + OAuth — skip until ready.
  // E2E migration tests run live migrations against real accounts — skip in CI.
  // Re-enable by removing the relevant pattern(s) below.
  testIgnore: [
    '**/shopify/**',
    '**/auth/shopify.setup.spec.ts',
    '**/migration/e2e_migration*.spec.ts',
    '**/migration/e2e-full/**',   // run via its own config: --config tests/UI/migration/e2e-full/playwright.config.ts
    '**/e2e-smoke/probe.spec.ts', // data collection tool — run manually to refresh registry
  ],
  globalSetup: require.resolve('./fixtures/global-setup'),
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: true,
  retries: 1,
  workers: 6,
  reporter: [
    [path.resolve(__dirname, 'utils/liveReporter.ts')],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ...qaReporter,
  ],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 30 * 1000,
    navigationTimeout: 60 * 1000,
    launchOptions: {
      // Populated with stealth args when STEALTH_MODE=true, empty array otherwise
      args: getStealthLaunchArgs(),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
});
