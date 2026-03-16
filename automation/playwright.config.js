// Playwright configuration for the Flow Marketplace automation framework.
// Enables retries, parallel execution, HTML reports, screenshots on failure, and tracing.
// Stealth mode: set STEALTH_MODE=true in .env to suppress automation fingerprints.

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');
const dotenv = require('dotenv');
const { getStealthLaunchArgs } = require('./utils/stealth');

// Load env for config and tests
dotenv.config({
  path: path.resolve(__dirname, '.env'),
});

const baseURL = process.env.BASE_URL || 'https://marketplace.flow.staging.linktoany.com';

module.exports = defineConfig({
  testDir: './tests',
  // Shopify SSO tests require external credentials + OAuth — skip until ready.
  // E2E migration tests run live migrations against real accounts — skip in CI.
  // Re-enable by removing the relevant pattern(s) below.
  testIgnore: [
    '**/shopify/**',
    '**/auth/shopify.setup.spec.js',
    '**/migration/e2e_migration*.spec.js',
    '**/migration/e2e-full/**',   // run via its own config: --config tests/UI/migration/e2e-full/playwright.config.js
    '**/e2e-smoke/probe.spec.js', // data collection tool — run manually to refresh registry
  ],
  globalSetup: require.resolve('./fixtures/global-setup.js'),
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: true,
  retries: 1,
  workers: 6,
  reporter: [
    [path.resolve(__dirname, 'utils/liveReporter.js')],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    [path.resolve(__dirname, '../qa-analytics/integrations/playwright-reporter.js'), {
      apiUrl:  process.env.QA_API_URL  || 'http://localhost:4000',
      suiteId: process.env.QA_SUITE   || 'migration-ui',
      branch:  process.env.BRANCH     || process.env.CI_COMMIT_BRANCH || 'main',
    }],
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
