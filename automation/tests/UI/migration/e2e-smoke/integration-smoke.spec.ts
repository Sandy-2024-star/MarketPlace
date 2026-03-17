// Integration Template Smoke Test
//
// Covers the one marketplace listing of type 'integration':
//   "Square To Quickbooks integration"  (id: 69b28bfdead0ff5396532a4e)
//
// Flow:
//   1. Navigate directly to detail page by ID
//   2. Verify title + "Set up Integration" CTA visible
//   3. Click CTA → wizard/flow launches
//   4. Verify something loaded (URL changed away from detail page)
//
// Stops here — no credentials entered, no integration triggered.
//
// Run:
//   npx playwright test tests/UI/migration/e2e-smoke/integration-smoke.spec.js

import { test, expect } from '../../../../fixtures/auth.fixture';
import { MigrationDetailPage } from '../../../../pages/MigrationDetailPage';
import config from '../../../../utils/config';

const INTEGRATION = {
  id:   '69b28bfdead0ff5396532a4e',
  name: 'Square To Quickbooks integration',
};

const detailUrl = `${config.baseURL}/listing/${INTEGRATION.id}`;

test.describe('Integration Template Smoke', () => {

  test('[integration] Square To Quickbooks integration — detail + CTA + wizard loads', async ({ page }) => {
    // ── Step 1: Navigate directly to detail page ──────────────────────────
    console.log(`\n[integration-smoke] Navigating to: ${detailUrl}`);
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });

    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();

    // ── Step 2: Verify title and CTA ──────────────────────────────────────
    await expect(detail.title).toContainText(INTEGRATION.name);
    await expect(detail.setUpIntegrationButton).toBeVisible();
    console.log(`[integration-smoke] ✓ Detail page loaded — "Set up Integration" CTA visible`);

    // ── Step 3: Click CTA → flow launches ────────────────────────────────
    await detail.clickGetStarted();

    // ── Step 4: Verify wizard/flow loaded ────────────────────────────────
    // URL must have navigated away from the detail page
    await expect(page).not.toHaveURL(/\/listing\//);
    const currentUrl = page.url();
    console.log(`[integration-smoke] ✓ Flow launched — URL: ${currentUrl}`);

    // At least one interactive element should be present (step heading, button, or input)
    const hasContent =
      await page.locator('h1, h2, h3').first().isVisible({ timeout: 10000 }).catch(() => false) ||
      await page.locator('button').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasContent, 'Integration wizard should show at least one heading or button').toBe(true);

    console.log(`[integration-smoke] ✅ PASSED: "${INTEGRATION.name}"`);
  });

});
