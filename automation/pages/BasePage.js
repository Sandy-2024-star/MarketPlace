// Base class for all Page Object Models.
// Provides shared constructor, spinner waits, and screenshot helper.

const path = require('path');
const config = require('../utils/config');
const { waitForSpinner } = require('../utils/wait');

class BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  /**
   * Navigate to a path relative to baseURL.
   * @param {string} urlPath  e.g. '/listings'
   * @param {'load'|'domcontentloaded'|'networkidle'} [waitUntil='domcontentloaded']
   */
  async goto(urlPath, waitUntil = 'domcontentloaded') {
    await this.page.goto(`${config.baseURL}${urlPath}`, { waitUntil });
  }

  /**
   * Wait for the generic "Loading..." spinner to disappear.
   * @param {number} [timeout=20000]
   */
  async waitForSpinner(timeout = 20000) {
    await waitForSpinner(this.page, timeout);
  }

  /**
   * Save a full-page screenshot to test-results/.
   * @param {string} label  Used in filename — spaces and special chars are stripped.
   */
  async screenshot(label) {
    const safe = label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    await this.page.screenshot({
      path: path.resolve(__dirname, `../test-results/${safe}.png`),
      fullPage: true,
    });
  }
}

module.exports = BasePage;
