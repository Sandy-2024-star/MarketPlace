// Shared helper functions used across tests and page objects.

import type { Page, Locator } from '@playwright/test';
import config from './config';

/**
 * Waits for a locator to be visible within the default timeout.
 */
export async function waitForVisible(_page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: config.defaultTimeout });
}

/**
 * Selects an option from a dropdown by visible text.
 * Assumes the dropdown uses a standard <select> element.
 */
export async function selectDropdownByText(page: Page, selector: string, text: string): Promise<void> {
  const dropdown = page.locator(selector);
  await dropdown.selectOption({ label: text });
}

/**
 * Reusable login flow using the LoginPage object.
 * Navigates to the login page, fills credentials, and verifies marketplace load.
 */
export async function performLogin(
  page: Page,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LoginPage: new (page: Page) => any
): Promise<{ loginPage: InstanceType<typeof LoginPage> }> {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login(config.username, config.password);
  await page.waitForURL('**/listings', { timeout: config.defaultTimeout });

  return { loginPage };
}
