// Shopify login spec — verifies Shopify store login and authenticated state.
// Requires SHOPIFY_USERNAME, SHOPIFY_PASSWORD in .env.
// Run headed: npx playwright test tests/UI/shopify/shopifyLogin.spec.js --headed

import { test, expect } from '../../../fixtures/stealth.fixture';
import { ShopifyLoginPage } from '../../../pages/ShopifyLoginPage';

test.describe('Shopify Login', () => {
  test('Shopify — login and verify authenticated', async ({ page }) => {
    test.setTimeout(300000);

    const username = process.env.SHOPIFY_USERNAME;
    const password = process.env.SHOPIFY_PASSWORD;

    if (!username || !password) {
      console.log('[shopify-login] Credentials not set — skipping');
      return;
    }

    const shopify = new ShopifyLoginPage(page);
    await shopify.navigate('https://accounts.shopify.com/login');
    await shopify.handleCaptcha();
    await shopify.login(username, password);
    await page.waitForTimeout(2000);

    const url = page.url();
    console.log('[shopify-login] Post-login URL:', url);
    expect(url).toMatch(/shopify\.com/);
    expect(url).not.toContain('/login');
  });
});
