// Page Object Model – Marketplace / Listings page

import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import config from '../utils/config';

type TabName = 'All' | 'Migrations' | 'Integrations';

interface CardLink {
  title: string;
  url: string | null;
}

export class MarketplacePage extends BasePage {
  readonly heading: Locator;
  readonly templateCount: Locator;
  readonly searchInput: Locator;
  readonly tabAll: Locator;
  readonly tabMigrations: Locator;
  readonly tabIntegrations: Locator;
  readonly itemsPerPageTrigger: Locator;
  readonly migrationCards: Locator;
  readonly previousButton: Locator;
  readonly nextButton: Locator;
  readonly pageIndicator: Locator;
  readonly navMarketplace: Locator;
  readonly navMyProjects: Locator;
  readonly navFileAssist: Locator;
  readonly userMenuButton: Locator;
  readonly signOutItem: Locator;

  constructor(page: Page) {
    super(page);
    this.heading             = page.getByRole('heading', { name: 'Marketplace' });
    this.templateCount       = page.getByText(/\d+\s*(available|migration)\s*templates?/i);
    this.searchInput         = page.locator('input[placeholder*="Search"]');
    this.tabAll              = page.getByRole('button', { name: 'All',          exact: true });
    this.tabMigrations       = page.getByRole('button', { name: 'Migrations',   exact: true });
    this.tabIntegrations     = page.getByRole('button', { name: 'Integrations', exact: true });
    this.itemsPerPageTrigger = page.locator('text=Items per page').locator('..').locator('div[role="combobox"], button, div').filter({ hasText: /^\d+$/ }).first();
    this.migrationCards      = page.locator('h3').locator('..');
    this.previousButton      = page.getByRole('button', { name: 'Previous' });
    this.nextButton          = page.getByRole('button', { name: 'Next' });
    this.pageIndicator       = page.getByText(/page \d+/i);
    this.navMarketplace      = page.getByRole('button', { name: 'Marketplace' });
    this.navMyProjects       = page.getByRole('button', { name: 'My Projects' });
    this.navFileAssist       = page.getByRole('button', { name: 'File Assist' });
    this.userMenuButton      = page.locator('button').filter({ hasText: /@/ }).first();
    this.signOutItem         = page.getByText('Sign out', { exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${config.baseURL}/listings`, { waitUntil: 'networkidle' });
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    console.log('[marketplace] Waiting for page load...');
    await this.waitForSpinner();
    await this.heading.waitFor({ state: 'visible', timeout: 20000 });
    await this.page.locator('h3').first().waitFor({ state: 'visible', timeout: 20000 });
    const count     = await this.page.locator('h3').count();
    const countText = await this.templateCount.textContent().catch(() => '?');
    console.log(`[marketplace] ✓ Loaded — ${count} cards visible, ${countText?.trim()}`);
  }

  async search(keyword: string): Promise<void> {
    console.log(`[marketplace] Searching: "${keyword}"`);
    await this.searchInput.fill(keyword);
    await this.page.waitForTimeout(500);
    const count = await this.page.locator('h3').count();
    console.log(`[marketplace] Search results: ${count} card(s)`);
  }

  async getCardTitles(): Promise<string[]> {
    const cards  = await this.page.locator('h3').all();
    const titles = await Promise.all(cards.map(c => c.textContent().then(t => (t ?? '').trim())));
    console.log(`[marketplace] Card titles (${titles.length}):`, titles);
    return titles;
  }

  async getCardLinks(): Promise<CardLink[]> {
    const items = await this.page.locator('h3').evaluateAll((nodes) =>
      nodes.map(h3 => {
        let node: Element = h3;
        for (let i = 0; i < 6; i++) {
          if (!node.parentElement) break;
          node = node.parentElement;
          if (node.tagName === 'A' && (node as HTMLAnchorElement).href) {
            return { title: (h3.textContent ?? '').trim(), url: (node as HTMLAnchorElement).href };
          }
        }
        return { title: (h3.textContent ?? '').trim(), url: null };
      })
    );
    console.log(`[marketplace] Card links (${items.length}): ${items.map(i => i.url ? '✓' : '✗').join('')}`);
    return items;
  }

  async openCard(titleText: string): Promise<void> {
    console.log(`[marketplace] Opening card: "${titleText}"`);
    await this.page.locator('h3', { hasText: titleText }).first().evaluate(el => {
      let node: Element = el;
      for (let i = 0; i < 5; i++) {
        if (!node.parentElement) break;
        node = node.parentElement;
        if (window.getComputedStyle(node).cursor === 'pointer') {
          (node as HTMLElement).click();
          break;
        }
      }
    });
    await this.page.waitForURL('**/listing/**', { timeout: 15000 });
    console.log('[marketplace] ✓ Card opened. URL:', this.page.url());
  }

  async selectTab(tab: TabName): Promise<void> {
    console.log(`[marketplace] Tab filter → "${tab}"`);
    const tabMap: Record<TabName, Locator> = {
      All:          this.tabAll,
      Migrations:   this.tabMigrations,
      Integrations: this.tabIntegrations,
    };
    await tabMap[tab].click();
    await this.page.waitForTimeout(500);
    const count = await this.page.locator('h3').count();
    console.log(`[marketplace] Tab "${tab}" — ${count} card(s)`);
  }

  async setItemsPerPage(value: string): Promise<void> {
    console.log(`[marketplace] Items per page → ${value}`);
    await this.itemsPerPageTrigger.click({ force: true });
    await this.page.getByRole('option', { name: value, exact: true }).click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.locator('h3').first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await this.page.locator('h3').count();
    console.log(`[marketplace] ✓ Showing ${count} cards per page`);
  }

  async goToNextPage(): Promise<void> {
    console.log('[marketplace] Pagination → Next page');
    await this.nextButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.locator('h3').first().waitFor({ state: 'visible', timeout: 15000 });
    const indicator = await this.pageIndicator.textContent().catch(() => '?');
    console.log('[marketplace] ✓ Now on:', indicator?.trim());
  }

  async goToPreviousPage(): Promise<void> {
    console.log('[marketplace] Pagination → Previous page');
    await this.previousButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.locator('h3').first().waitFor({ state: 'visible', timeout: 15000 });
    const indicator = await this.pageIndicator.textContent().catch(() => '?');
    console.log('[marketplace] ✓ Now on:', indicator?.trim());
  }

  async signOut(): Promise<void> {
    console.log('[marketplace] Signing out...');
    await this.userMenuButton.click();
    await this.signOutItem.waitFor({ state: 'visible', timeout: 5000 });
    await this.signOutItem.click();
    console.log('[marketplace] ✓ Signed out');
  }

  async goToMyProjects(): Promise<void> {
    console.log('[marketplace] Navigating to My Projects...');
    await this.navMyProjects.click();
    await this.page.waitForLoadState('networkidle');
    console.log('[marketplace] ✓ My Projects. URL:', this.page.url());
  }

  async goToFileAssist(): Promise<void> {
    console.log('[marketplace] Navigating to File Assist...');
    await this.navFileAssist.click();
    await this.page.waitForLoadState('networkidle');
    console.log('[marketplace] ✓ File Assist. URL:', this.page.url());
  }
}
