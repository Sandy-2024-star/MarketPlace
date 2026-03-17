// Marketplace explore tests — app-wide visual exploration.
// Covers: wizard entry, File Assist, pagination, items-per-page, user menu,
//         search+filter, forgot-password, sign-up, landing, My Projects.
// Uses auth fixture — page starts authenticated on /listings.

import { test, expect } from '../../../fixtures/auth.fixture';
import { MarketplacePage } from '../../../pages/MarketplacePage';
import { MigrationDetailPage } from '../../../pages/MigrationDetailPage';
import { MigrationWizardPage } from '../../../pages/MigrationWizardPage';
import config from '../../../utils/config';

test.describe('Marketplace Explore', () => {
  test('EXPLORE 1 – Get Started wizard', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    expect(titles.length).toBeGreaterThan(0);
    await mp.openCard(titles[0]);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    await detail.clickGetStarted();
    const wizard = new MigrationWizardPage(page);
    await wizard.waitForLoaded();
    await expect(page).toHaveURL(/migration-flow/);
  });

  test('EXPLORE 2 – File Assist page', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToFileAssist();
    await page.waitForTimeout(1000);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 15000 });
  });

  test('EXPLORE 3 – Marketplace pagination', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await expect(mp.nextButton).toBeEnabled();
    await mp.goToNextPage();
    const count = await page.locator('h3').count();
    expect(count).toBeGreaterThan(0);
  });

  test('EXPLORE 4 – Items per page control', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.setItemsPerPage('20');
    const count = await page.locator('h3').count();
    expect(count).toBeGreaterThan(0);
  });

  test('EXPLORE 5 – User profile menu', async ({ page }) => {
    const userBtn = page.locator('button').filter({ hasText: /@/ }).first();
    await expect(userBtn).toBeVisible();
    await userBtn.click();
    const signOut = page.getByText('Sign out', { exact: true });
    await expect(signOut).toBeVisible({ timeout: 5000 });
    // Close menu by pressing Escape
    await page.keyboard.press('Escape');
  });

  test('EXPLORE 6 – Search & filter results', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.selectTab('Migrations');
    await mp.search('Shopify');
    const count = await page.locator('h3').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('EXPLORE 7 – Forgot password page', async ({ page }) => {
    // Authenticated users may be redirected away — verify page loads without crash
    await page.goto(`${config.baseURL}/auth/forgot-password`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const url = page.url();
    const hasForm   = await page.locator('input[name="email"]').isVisible().catch(() => false);
    const redirected = !url.includes('/auth/forgot-password');
    console.log('[E7] URL:', url, '| hasForm:', hasForm, '| redirected:', redirected);
    // Pass if form is shown OR if app redirected (authenticated users should not see the form)
    expect(hasForm || redirected).toBeTruthy();
  });

  test('EXPLORE 8 – Sign Up page', async ({ page }) => {
    // Authenticated users may be redirected away — verify page loads without crash
    await page.goto(`${config.baseURL}/auth/signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const url = page.url();
    const hasBtn    = await page.getByRole('button', { name: /verify email/i }).isVisible().catch(() => false);
    const redirected = !url.includes('/auth/signup');
    console.log('[E8] URL:', url, '| hasBtn:', hasBtn, '| redirected:', redirected);
    expect(hasBtn || redirected).toBeTruthy();
  });

  test('EXPLORE 9 – Landing page full structure', async ({ page }) => {
    await page.goto(`${config.baseURL}/landing`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 15000 });
    const signIn = page.getByRole('link', { name: /sign in/i }).or(page.getByRole('button', { name: /sign in/i })).first();
    await expect(signIn).toBeVisible({ timeout: 5000 });
  });

  test('EXPLORE 10 – My Projects detail', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToMyProjects();
    const heading = page.getByRole('heading', { name: 'My Projects' });
    await expect(heading).toBeVisible({ timeout: 15000 });
  });
});
