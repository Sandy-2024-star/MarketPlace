// Page Object Model – Marketplace / Listings page
// Updated for new UI: tab filters (All / Migrations / Integrations) replace old source/target comboboxes.

const BasePage = require('./BasePage');
const config = require('../utils/config');

class MarketplacePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // Header
    this.heading         = page.getByRole('heading', { name: 'Marketplace' });
    this.templateCount   = page.getByText(/\d+\s*(available|migration)\s*templates?/i);

    // Search — placeholder text changes per tab ("Search templates..." / "Search migration templates..." / "Search integrations...")
    this.searchInput     = page.locator('input[placeholder*="Search"]');

    // Category tab filters (All / Migrations / Integrations)
    this.tabAll          = page.getByRole('button', { name: 'All',          exact: true });
    this.tabMigrations   = page.getByRole('button', { name: 'Migrations',   exact: true });
    this.tabIntegrations = page.getByRole('button', { name: 'Integrations', exact: true });

    // Items-per-page control (div-based, contains text "10" / "20" etc.)
    this.itemsPerPageTrigger = page.locator('text=Items per page').locator('..').locator('div[role="combobox"], button, div').filter({ hasText: /^\d+$/ }).first();

    // Migration cards — each card has an h3 title
    this.migrationCards  = page.locator('h3').locator('..');

    // Pagination
    this.previousButton  = page.getByRole('button', { name: 'Previous' });
    this.nextButton      = page.getByRole('button', { name: 'Next' });
    this.pageIndicator   = page.getByText(/page \d+/i);

    // Sidebar nav
    this.navMarketplace  = page.getByRole('button', { name: 'Marketplace' });
    this.navMyProjects   = page.getByRole('button', { name: 'My Projects' });
    this.navFileAssist   = page.getByRole('button', { name: 'File Assist' });

    // User menu (bottom of sidebar) — button contains the logged-in email address
    this.userMenuButton  = page.locator('button').filter({ hasText: /@/ }).first();
    // Sign out item rendered as <div> inside the dropdown
    this.signOutItem     = page.getByText('Sign out', { exact: true });
  }

  /** Navigate directly (requires active session cookie) */
  async goto() {
    await this.page.goto(`${config.baseURL}/listings`, { waitUntil: 'networkidle' });
    await this.waitForLoaded();
  }

  /** Wait for the page to fully render (spinner gone, heading + at least one card visible) */
  async waitForLoaded() {
    console.log('[marketplace] Waiting for page load...');
    await this.waitForSpinner();
    await this.heading.waitFor({ state: 'visible', timeout: 20000 });
    await this.page.locator('h3').first().waitFor({ state: 'visible', timeout: 20000 });
    const count = await this.page.locator('h3').count();
    const countText = await this.templateCount.textContent().catch(() => '?');
    console.log(`[marketplace] ✓ Loaded — ${count} cards visible, ${countText.trim()}`);
  }

  /**
   * Search for a migration template by keyword.
   * @param {string} keyword
   */
  async search(keyword) {
    console.log(`[marketplace] Searching: "${keyword}"`);
    await this.searchInput.fill(keyword);
    await this.page.waitForTimeout(500);
    const count = await this.page.locator('h3').count();
    console.log(`[marketplace] Search results: ${count} card(s)`);
  }

  /**
   * Get all visible card titles on the current page.
   * @returns {Promise<string[]>}
   */
  async getCardTitles() {
    const cards = await this.page.locator('h3').all();
    const titles = await Promise.all(cards.map(c => c.textContent().then(t => t.trim())));
    console.log(`[marketplace] Card titles (${titles.length}):`, titles);
    return titles;
  }

  /**
   * Get all visible cards as {title, url} objects by inspecting the DOM.
   * If a card has an <a href> ancestor within 5 levels it returns the full URL;
   * otherwise url is null (caller must fall back to openCard).
   * @returns {Promise<Array<{title: string, url: string|null}>>}
   */
  async getCardLinks() {
    const base = config.baseURL;
    const items = await this.page.locator('h3').evaluateAll((nodes, baseURL) =>
      nodes.map(h3 => {
        let node = h3;
        for (let i = 0; i < 6; i++) {
          if (!node.parentElement) break;
          node = node.parentElement;
          if (node.tagName === 'A' && node.href) {
            return { title: h3.textContent.trim(), url: node.href };
          }
        }
        return { title: h3.textContent.trim(), url: null };
      }), base
    );
    console.log(`[marketplace] Card links (${items.length}): ${items.map(i => i.url ? '✓' : '✗').join('')}`);
    return items;
  }

  /**
   * Click a migration card by partial title text.
   * @param {string} titleText
   */
  async openCard(titleText) {
    console.log(`[marketplace] Opening card: "${titleText}"`);
    await this.page.locator('h3', { hasText: titleText }).first().evaluate(el => {
      let node = el;
      for (let i = 0; i < 5; i++) {
        node = node.parentElement;
        if (window.getComputedStyle(node).cursor === 'pointer') { node.click(); break; }
      }
    });
    await this.page.waitForURL('**/listing/**', { timeout: 15000 });
    console.log('[marketplace] ✓ Card opened. URL:', this.page.url());
  }

  /**
   * Click a category tab filter.
   * @param {'All'|'Migrations'|'Integrations'} tab
   */
  async selectTab(tab) {
    console.log(`[marketplace] Tab filter → "${tab}"`);
    const btn = { All: this.tabAll, Migrations: this.tabMigrations, Integrations: this.tabIntegrations }[tab];
    await btn.click();
    await this.page.waitForTimeout(500);
    const count = await this.page.locator('h3').count();
    console.log(`[marketplace] Tab "${tab}" — ${count} card(s)`);
  }

  /**
   * Set items per page (10 / 20 / 50 / 100).
   * @param {string} value  e.g. '20'
   */
  async setItemsPerPage(value) {
    console.log(`[marketplace] Items per page → ${value}`);
    await this.itemsPerPageTrigger.click({ force: true });
    await this.page.getByRole('option', { name: value, exact: true }).click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.locator('h3').first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await this.page.locator('h3').count();
    console.log(`[marketplace] ✓ Showing ${count} cards per page`);
  }

  /** Click Next pagination button and wait for cards */
  async goToNextPage() {
    console.log('[marketplace] Pagination → Next page');
    await this.nextButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.locator('h3').first().waitFor({ state: 'visible', timeout: 15000 });
    const indicator = await this.pageIndicator.textContent().catch(() => '?');
    console.log('[marketplace] ✓ Now on:', indicator.trim());
  }

  /** Click Previous pagination button and wait for cards */
  async goToPreviousPage() {
    console.log('[marketplace] Pagination → Previous page');
    await this.previousButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.locator('h3').first().waitFor({ state: 'visible', timeout: 15000 });
    const indicator = await this.pageIndicator.textContent().catch(() => '?');
    console.log('[marketplace] ✓ Now on:', indicator.trim());
  }

  /** Open the user menu and click Sign out */
  async signOut() {
    console.log('[marketplace] Signing out...');
    await this.userMenuButton.click();
    await this.signOutItem.waitFor({ state: 'visible', timeout: 5000 });
    await this.signOutItem.click();
    console.log('[marketplace] ✓ Signed out');
  }

  async goToMyProjects() {
    console.log('[marketplace] Navigating to My Projects...');
    await this.navMyProjects.click();
    await this.page.waitForLoadState('networkidle');
    console.log('[marketplace] ✓ My Projects. URL:', this.page.url());
  }

  async goToFileAssist() {
    console.log('[marketplace] Navigating to File Assist...');
    await this.navFileAssist.click();
    await this.page.waitForLoadState('networkidle');
    console.log('[marketplace] ✓ File Assist. URL:', this.page.url());
  }
}

module.exports = MarketplacePage;
