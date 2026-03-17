// Shopify SSO setup — runs once to capture a Shopify session for subsequent tests.
//
// Uses ShopifyLoginPage.ssoSetup() which handles:
//   1. Login at accounts.shopify.com
//   2. Navigate to SSO OAuth URL (admin.shopify.com → Flow marketplace app)
//   3. Select the target Shopify store
//   4. Save storageState → tests/UI/auth/.shopify-session.json
//
// Run this spec with --headed so you can solve any CAPTCHAs manually.
// Saved session is reused by all shopify/** specs via fixtures.sso.js.

import { test } from '../../../fixtures/stealth.fixture';
import { ShopifyLoginPage } from '../../../pages/ShopifyLoginPage';
import config from '../../../utils/config';

test('shopify-sso-setup', async ({ page }) => {
  const shopify = new ShopifyLoginPage(page);
  await shopify.ssoSetup(
    process.env.SHOPIFY_USERNAME!,
    process.env.SHOPIFY_PASSWORD!,
    process.env.SHOPIFY_SSO_URL!,
    process.env.SHOPIFY_SHOP_HANDLE || 'square-store-8921',
  );
});
