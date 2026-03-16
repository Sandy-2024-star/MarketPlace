// Page Object Model – My Projects page
// Real selectors validated against /listings?tab=projects

const BasePage = require('./BasePage');
const config = require('../utils/config');

class MigrationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // Header
    this.heading        = page.getByRole('heading', { name: 'My Projects' });
    this.projectCount   = page.getByText(/active projects/i);

    // Filters
    this.searchInput    = page.getByPlaceholder('Search projects...');
    // Custom dropdown elements (not native <button> — use text match)
    this.sourceFilter   = page.getByText('All Sources', { exact: true });
    this.targetFilter   = page.getByText('All Targets', { exact: true });
    this.statusFilter   = page.getByText('All Status', { exact: true });
  }

  /** Navigate directly to My Projects tab */
  async goto() {
    await this.page.goto(`${config.baseURL}/listings?tab=projects`, { waitUntil: 'networkidle' });
    await this.waitForLoaded();
  }

  /** Wait for heading to be visible */
  async waitForLoaded() {
    await this.waitForSpinner();
    await this.heading.waitFor({ state: 'visible', timeout: 20000 });
  }

  /**
   * Search for a project by keyword.
   * @param {string} keyword
   */
  async search(keyword) {
    await this.searchInput.fill(keyword);
    await this.page.waitForTimeout(500);
  }

  /** Filter by source */
  async selectSource(sourceName) {
    await this.sourceFilter.click();
    await this.page.getByRole('option', { name: sourceName }).click();
  }

  /** Filter by target */
  async selectTarget(targetName) {
    await this.targetFilter.click();
    await this.page.getByRole('option', { name: targetName }).click();
  }

  /** Filter by status */
  async selectStatus(status) {
    await this.statusFilter.click();
    await this.page.getByRole('option', { name: status }).click();
  }
}

module.exports = MigrationPage;
