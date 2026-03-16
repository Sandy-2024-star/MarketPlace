// Validation walkthrough — step-by-step app discovery and API endpoint mapping.
// Covers: landing page, login, UI auth, API auth, listings, My Projects,
//         File Assist, card detail, and network interception for real API endpoints.
// Run serially — each step builds on the previous.

const { test, expect } = require('@playwright/test');
const LoginPage = require('../../../pages/LoginPage');
const MarketplacePage = require('../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../pages/MigrationDetailPage');
const config = require('../../../utils/config');

test.describe.configure({ mode: 'serial' });

test('STEP 1 – Landing page loads', async ({ page }) => {
  await page.goto(`${config.baseURL}/landing`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const heading = page.locator('h1, h2').first();
  await expect(heading).toBeVisible({ timeout: 15000 });
  console.log('[validate:1] Landing page loaded. URL:', page.url());
});

test('STEP 2 – Navigate to login page via Sign In', async ({ page }) => {
  await page.goto(`${config.baseURL}/landing`, { waitUntil: 'domcontentloaded' });
  const signIn = page.getByRole('link', { name: /sign in/i })
    .or(page.getByRole('button', { name: /sign in/i })).first();
  if (await signIn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await signIn.click();
  } else {
    await page.goto(`${config.baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
  }
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15000 });
  const login = new LoginPage(page);
  await expect(login.usernameInput).toBeVisible();
  console.log('[validate:2] Login page reached. URL:', page.url());
});

test('STEP 3 – UI Login with .env credentials', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.waitForForm();
  await login.login(config.username, config.password);
  await page.waitForURL(
    url => url.toString().includes('/listings') || url.toString().includes('/onboarding'),
    { timeout: 30000 }
  );
  if (!page.url().includes('/listings')) {
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
  }
  const mp = new MarketplacePage(page);
  await mp.waitForLoaded();
  console.log('[validate:3] Logged in. URL:', page.url());
  expect(page.url()).toContain('/listings');
});

test('STEP 4 – API Login attempt', async ({ page }) => {
  const response = await page.request.post(`${config.apiURL}/auth/login`, {
    data: { username: config.username, password: config.password },
  });
  const status = response.status();
  console.log('[validate:4] API login status:', status);
  expect([200, 201]).toContain(status);
  const body = await response.json().catch(() => ({}));
  console.log('[validate:4] Session token present:', !!body.session);
});

test('STEP 5 – Explore listings / marketplace page', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(config.username, config.password);
  await page.waitForURL(/\/listings|\/onboarding/, { timeout: 30000 });
  if (!page.url().includes('/listings')) {
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
  }
  const mp = new MarketplacePage(page);
  await mp.waitForLoaded();
  const titles = await mp.getCardTitles();
  console.log(`[validate:5] Cards: ${titles.length}`);
  expect(titles.length).toBeGreaterThan(0);
  await expect(mp.tabAll).toBeVisible();
  await expect(mp.tabMigrations).toBeVisible();
  await expect(mp.searchInput).toBeVisible();
});

test('STEP 6 – Explore My Projects page', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(config.username, config.password);
  await page.waitForURL(/\/listings|\/onboarding/, { timeout: 30000 });
  const mp = new MarketplacePage(page);
  if (!page.url().includes('/listings')) {
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
    await mp.waitForLoaded();
  }
  await mp.goToMyProjects();
  const heading = page.getByRole('heading', { name: 'My Projects' });
  await expect(heading).toBeVisible({ timeout: 20000 });
  console.log('[validate:6] My Projects loaded. URL:', page.url());
});

test('STEP 7 – Explore File Assist page', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(config.username, config.password);
  await page.waitForURL(/\/listings|\/onboarding/, { timeout: 30000 });
  const mp = new MarketplacePage(page);
  if (!page.url().includes('/listings')) {
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
    await mp.waitForLoaded();
  }
  await mp.goToFileAssist();
  await page.waitForTimeout(1000);
  const heading = page.locator('h1, h2').first();
  await expect(heading).toBeVisible({ timeout: 15000 });
  console.log('[validate:7] File Assist loaded. URL:', page.url());
});

test('STEP 8 – Explore migration card detail page', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(config.username, config.password);
  await page.waitForURL(/\/listings|\/onboarding/, { timeout: 30000 });
  if (!page.url().includes('/listings')) {
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
  }
  const mp = new MarketplacePage(page);
  await mp.waitForLoaded();
  const titles = await mp.getCardTitles();
  await mp.openCard(titles[0]);
  const detail = new MigrationDetailPage(page);
  await detail.waitForLoaded();
  const title = await detail.getTitle();
  const badge = await detail.migrationTypeBadge.textContent().catch(() => '');
  console.log(`[validate:8] Detail: "${title}" | type: ${badge.trim()}`);
  expect(title.length).toBeGreaterThan(0);
  await expect(detail.ctaButton).toBeVisible();
});

test('STEP 9 – Discover real API endpoints (network interception)', async ({ page }) => {
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/') && !url.includes('node_modules')) {
      apiCalls.push({ method: req.method(), url });
    }
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(config.username, config.password);
  await page.waitForURL(/\/listings|\/onboarding/, { timeout: 30000 });
  if (!page.url().includes('/listings')) {
    await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
  }
  const mp = new MarketplacePage(page);
  await mp.waitForLoaded();
  await page.waitForTimeout(2000);

  console.log(`[validate:9] API calls intercepted: ${apiCalls.length}`);
  apiCalls.forEach(c => console.log(`  ${c.method} ${c.url}`));
  expect(apiCalls.length).toBeGreaterThan(0);
});
