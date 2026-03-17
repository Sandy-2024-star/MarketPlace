// Playwright config for E2E migrations — runs only this folder.
// Usage (from automation/):
//   npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --headed --workers=1

import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';
import { getStealthLaunchArgs } from '../../../../utils/stealth';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const baseURL = process.env.BASE_URL || 'https://marketplace.flow.staging.linktoany.com';

export default defineConfig({
  testDir:      '.',
  testMatch:    '**/e2e_all_migrations.spec.ts',
  globalSetup:  require.resolve('../../../../fixtures/global-setup.ts'),
  timeout:      300 * 1000,  // 5 min per migration
  expect:       { timeout: 15 * 1000 },
  fullyParallel: false,      // run migrations serially — they hit live accounts
  retries:      0,           // no retries for live E2E
  workers:      1,
  reporter: [
    [require.resolve('../../../../utils/liveReporter.ts')],
    ['html', { open: 'never', outputFolder: '../../../../playwright-report-e2e' }],
    ['json', { outputFile: '../../../../test-results/e2e-results.json' }],
  ],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace:      'on',
    screenshot: 'on',
    video:      'on',
    actionTimeout:     30 * 1000,
    navigationTimeout: 60 * 1000,
    launchOptions: {
      args: getStealthLaunchArgs(),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
