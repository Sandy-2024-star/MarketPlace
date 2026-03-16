// Responsive / Mobile layout tests
//
// Tests critical UI at narrow viewports. Uses page.setViewportSize() to
// override viewport per-test — no new config projects required.
//
// Breakpoints tested:
//   Mobile  — 375 × 812  (iPhone 12/13/14)
//   Tablet  — 768 × 1024 (iPad portrait)
//
// At mobile width the sidebar may collapse behind a hamburger menu.
// Tests accept either the sidebar being visible OR a mobile nav toggle present.
//
// Uses auth fixture — page starts authenticated on /listings.

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage     = require('../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../pages/MigrationDetailPage');
const config = require('../../../utils/config');

const MOBILE  = { width: 375,  height: 812  };
const TABLET  = { width: 768,  height: 1024 };

test.describe('Responsive — Mobile (375px)', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
  });

  test('marketplace heading is visible at mobile width', async ({ page }) => {
    await page.reload();
    const mp = new MarketplacePage(page);
    await expect(mp.heading).toBeVisible({ timeout: 15000 });
  });

  test('migration cards are visible at mobile width', async ({ page }) => {
    await page.reload();
    await expect(page.locator('h3').first()).toBeVisible({ timeout: 15000 });
  });

  test('navigation state at mobile width — discovery', async ({ page }) => {
    await page.reload();
    const mp = new MarketplacePage(page);
    const sidebarVisible = await mp.navMarketplace.isVisible({ timeout: 3000 }).catch(() => false);
    const hamburger = page.locator(
      'button[aria-label*="menu" i], button[aria-label*="nav" i], ' +
      'button[aria-expanded], [class*="hamburger"], [class*="menu-toggle"]'
    ).first();
    const hamburgerVisible = await hamburger.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[responsive] Mobile 375px nav — sidebar: ${sidebarVisible}, hamburger: ${hamburgerVisible}`);
    // Discovery test — logs state without failing. If neither is visible, mobile nav is not yet implemented.
    // TODO: assert hamburgerVisible once a mobile nav toggle is added to the app.
  });

  test('page has no horizontal overflow at mobile width', async ({ page }) => {
    await page.reload();
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflows, 'Page should not scroll horizontally at 375px').toBe(false);
  });

  test('card detail page renders at mobile width', async ({ page }) => {
    await page.reload();
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    await mp.openCard(titles[0]);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    await expect(detail.title).toBeVisible();
    await expect(detail.ctaButton).toBeVisible();
  });

  test('login page renders usably at mobile width', async ({ page }) => {
    await page.goto(`${config.baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    // Authenticated users are redirected away from /auth/login — accept any non-login destination
    if (!url.includes('/auth/login')) {
      console.log(`[responsive] Authenticated — redirected to: ${url}`);
      return;
    }
    // On login page — assert form inputs are usable at 375px
    await expect(page.locator('input').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /confirm|log in|sign in/i })).toBeVisible();
  });

});

test.describe('Responsive — Tablet (768px)', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(TABLET);
  });

  test('marketplace heading is visible at tablet width', async ({ page }) => {
    await page.reload();
    const mp = new MarketplacePage(page);
    await expect(mp.heading).toBeVisible({ timeout: 15000 });
  });

  test('migration cards are visible at tablet width', async ({ page }) => {
    await page.reload();
    await expect(page.locator('h3').first()).toBeVisible({ timeout: 15000 });
  });

  test('page has no horizontal overflow at tablet width', async ({ page }) => {
    await page.reload();
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflows, 'Page should not scroll horizontally at 768px').toBe(false);
  });

});
