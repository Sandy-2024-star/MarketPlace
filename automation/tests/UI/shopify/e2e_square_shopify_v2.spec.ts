// E2E — Square → Shopify migration (v2)
// DRAFT SPEC — for testing helpers/ShopifySSO.js + helpers/SourceConnector.js
//
// Uses ShopifySSO helper for full SSO orchestration and SourceConnector for
// the source (Square) API connection steps.
//
// Requires SHOPIFY_* + SQUARE_* env vars.
// Run headed: npx playwright test tests/UI/shopify/e2e_square_shopify_v2.spec.js --headed

import { test, expect } from '../../../fixtures/sso.fixture';
import { ShopifySSO } from '../../../helpers/ShopifySSO';
import { SourceConnector } from '../../../helpers/SourceConnector';
import { MarketplacePage } from '../../../pages/MarketplacePage';
import { MigrationDetailPage } from '../../../pages/MigrationDetailPage';
import { MigrationWizardPage } from '../../../pages/MigrationWizardPage';
import config from '../../../utils/config';

const CARD_TITLE   = 'Square to Shopify';
const SHOP_HANDLE  = process.env.SHOPIFY_SHOP_HANDLE || 'square-store-8921';
const FLOW_URL     = process.env.SHOPIFY_FLOW_URL    || 'https://shopify.flow.linktoany.com/listings';

test.describe.configure({ mode: 'serial' });

test('Square → Shopify E2E migration (v2)', async ({ page, browser }) => {
  test.setTimeout(600000);

  const context = page.context();

  // Ensure we are on the Shopify Flow marketplace
  console.log('[e2e-v2] Ensuring on marketplace...');
  const sso = new ShopifySSO(page, context);
  if (!page.url().includes('shopify.flow.linktoany.com')) {
    await sso.ensureOnMarketplace({
      username:        process.env.SHOPIFY_USERNAME!,
      password:        process.env.SHOPIFY_PASSWORD!,
      storeName:       'Square Store',
      shopHandle:      SHOP_HANDLE,
      ssoUrl:          process.env.SHOPIFY_SSO_URL!,
      flowUrl:         FLOW_URL,
      skipCreateStore: true,
    });
  }

  const mp = new MarketplacePage(page);
  await mp.waitForLoaded();
  console.log('[e2e-v2] On marketplace. URL:', page.url());

  // Find Square to Shopify card
  let found = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const titles = await mp.getCardTitles();
    if (titles.some(t => t.includes(CARD_TITLE))) { found = true; break; }
    const nextEnabled = await mp.nextButton.isEnabled().catch(() => false);
    if (!nextEnabled) break;
    await mp.goToNextPage();
  }

  if (!found) {
    console.log(`[e2e-v2] "${CARD_TITLE}" not found — skipping`);
    return;
  }

  await mp.openCard(CARD_TITLE);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  await detail.clickGetStarted();

  const wizard = new MigrationWizardPage(page);
  await wizard.waitForLoaded();

  // Step 1
  await wizard.selectDataTypes(['Customers', 'Products']);
  await expect(wizard.continueButton).toBeEnabled({ timeout: 10000 });
  await wizard.goToStep2();

  // Step 2 — use SourceConnector for Square API credentials
  const connector = new SourceConnector(page);
  await connector.connect({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    storeHash:   process.env.SQUARE_LOCATION_ID,
  });

  console.log('[e2e-v2] ✓ Source connected. URL:', page.url());
});
