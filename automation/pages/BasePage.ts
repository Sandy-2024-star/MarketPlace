// Base class for all Page Object Models.
// Provides shared constructor, spinner waits, and screenshot helper.

import path from 'path';
import type { Page } from '@playwright/test';
import config from '../utils/config';
import { waitForSpinner } from '../utils/wait';
import type { WaitUntilState } from '../types';

export class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to a path relative to baseURL.
   * @param urlPath  e.g. '/listings'
   */
  async goto(urlPath: string, waitUntil: WaitUntilState = 'domcontentloaded'): Promise<void> {
    await this.page.goto(`${config.baseURL}${urlPath}`, { waitUntil });
  }

  /**
   * Wait for the generic "Loading..." spinner to disappear.
   */
  async waitForSpinner(timeout = 20000): Promise<void> {
    await waitForSpinner(this.page, timeout);
  }

  /**
   * Save a full-page screenshot to test-results/.
   * @param label  Used in filename — spaces and special chars are stripped.
   */
  async screenshot(label: string): Promise<void> {
    const safe = label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    await this.page.screenshot({
      path: path.resolve(__dirname, `../test-results/${safe}.png`),
      fullPage: true,
    });
  }
}
