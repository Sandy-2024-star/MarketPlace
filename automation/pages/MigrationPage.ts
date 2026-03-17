// Page Object Model – My Projects page

import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import config from '../utils/config';

export class MigrationPage extends BasePage {
  readonly heading: Locator;
  readonly projectCount: Locator;
  readonly searchInput: Locator;
  readonly sourceFilter: Locator;
  readonly targetFilter: Locator;
  readonly statusFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.heading      = page.getByRole('heading', { name: 'My Projects' });
    this.projectCount = page.getByText(/active projects/i);
    this.searchInput  = page.getByPlaceholder('Search projects...');
    this.sourceFilter = page.getByText('All Sources', { exact: true });
    this.targetFilter = page.getByText('All Targets', { exact: true });
    this.statusFilter = page.getByText('All Status', { exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${config.baseURL}/listings?tab=projects`, { waitUntil: 'networkidle' });
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.waitForSpinner();
    await this.heading.waitFor({ state: 'visible', timeout: 20000 });
  }

  async search(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
    await this.page.waitForTimeout(500);
  }

  async selectSource(sourceName: string): Promise<void> {
    await this.sourceFilter.click();
    await this.page.getByRole('option', { name: sourceName }).click();
  }

  async selectTarget(targetName: string): Promise<void> {
    await this.targetFilter.click();
    await this.page.getByRole('option', { name: targetName }).click();
  }

  async selectStatus(status: string): Promise<void> {
    await this.statusFilter.click();
    await this.page.getByRole('option', { name: status }).click();
  }
}
