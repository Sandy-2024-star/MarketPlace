// PROBE — API-based migration step structure discovery
// Purpose: Walk through "BigCommerce to Shopify" up to Step 2 (no credentials entered)
//          and log every visible heading, button, and input to map the exact step flow.
// Safe: stops at Step 2 before connecting anything.
// Run: npx playwright test tests/UI/migration/e2e/probes/probe_api_based.spec.js --headed

const { test } = require('@playwright/test');
const path = require('path');
test.use({ storageState: path.resolve(__dirname, '../../../../../test-results/storageState.json') });

const MarketplacePage     = require('../../../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../../../pages/MigrationDetailPage');
const MigrationWizardPage = require('../../../../../pages/MigrationWizardPage');
const config              = require('../../../../../utils/config');

const CARD = 'BigCommerce to Shopify';

async function logPageState(page, label) {
  const headings = await page.locator('h1,h2,h3,h4').allTextContents();
  const buttons  = await page.locator('button:visible').allTextContents();
  const inputs   = await page.locator('input:visible,select:visible').evaluateAll(els =>
    els.map(e => `${e.tagName.toLowerCase()}[${e.type || e.name || ''}] placeholder="${e.placeholder || ''}"`)
  );
  console.log(`\n===== ${label} =====`);
  console.log('Headings:', headings.filter(Boolean));
  console.log('Buttons :', buttons.filter(Boolean));
  console.log('Inputs  :', inputs.filter(Boolean));
  console.log('URL     :', page.url());
}

test('PROBE — API-based step structure (BigCommerce to Shopify)', async ({ page }) => {
  test.setTimeout(120000);

  await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
  const mp = new MarketplacePage(page);
  await mp.waitForLoaded();

  // Open card
  await mp.openCard(CARD);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  await logPageState(page, 'DETAIL PAGE');

  // Click CTA
  await detail.clickGetStarted();
  const wizard = new MigrationWizardPage(page);
  await wizard.waitForLoaded();
  await logPageState(page, 'STEP 1 — Choose your data');

  // Step 1: select Customers
  await wizard.customersButton.click();
  await page.waitForTimeout(500);

  // Advance to Step 2
  await wizard.goToStep2();
  await page.waitForTimeout(2000);
  await logPageState(page, 'STEP 2');

  // Log what inputs are present (source credentials shape)
  const allInputs = await page.locator('input').evaluateAll(els =>
    els.map(e => ({
      type: e.type,
      placeholder: e.placeholder,
      name: e.name,
      id: e.id,
      visible: e.offsetParent !== null,
    }))
  );
  console.log('[probe] All inputs on Step 2:', JSON.stringify(allInputs, null, 2));

  const step2ContinueEnabled = await wizard.continueButton.isEnabled({ timeout: 3000 }).catch(() => false);
  console.log('[probe] Step 2 Continue enabled (without credentials):', step2ContinueEnabled);

  console.log('\n[probe] ✓ Done — review logs above to map step structure');
});
