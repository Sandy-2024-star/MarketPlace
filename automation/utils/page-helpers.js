// Shared helper functions used across tests and page objects.

const config = require('./config');

/**
 * Waits for a locator to be visible within the default timeout.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
async function waitForVisible(page, locator) {
  await locator.waitFor({ state: 'visible', timeout: config.defaultTimeout });
}

/**
 * Selects an option from a dropdown by visible text.
 * This assumes the dropdown uses a standard <select> element.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector CSS or data-testid selector for the <select>.
 * @param {string} text Visible text of the option.
 */
async function selectDropdownByText(page, selector, text) {
  const dropdown = page.locator(selector);
  await dropdown.selectOption({ label: text });
}

/**
 * Reusable login flow using the LoginPage object.
 * Navigates to the login page, fills credentials, and verifies marketplace load.
 * @param {import('@playwright/test').Page} page
 * @param {import('../pages/LoginPage')} LoginPage
 * @param {import('../pages/MarketplacePage')} MarketplacePage
 */
async function performLogin(page, LoginPage) {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login(config.username, config.password);
  // After successful login the app redirects to /listings
  await page.waitForURL('**/listings', { timeout: config.defaultTimeout });

  return { loginPage };
}

module.exports = {
  waitForVisible,
  selectDropdownByText,
  performLogin,
};

