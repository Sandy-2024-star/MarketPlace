// Page Object Model – Login page
// Real selectors validated against https://marketplace.flow.staging.linktoany.com/auth/login

const config = require('../utils/config');

class LoginPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Confirmed from live UI screenshot
    this.usernameInput = page.getByPlaceholder('Enter your username');
    this.passwordInput = page.getByPlaceholder('Enter your password');
    this.confirmButton = page.getByRole('button', { name: 'Confirm' });
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
    this.signUpLink = page.getByRole('link', { name: 'Sign Up here' });
  }

  /** Navigate directly to the login page */
  async goto() {
    await this.page.goto(`${config.baseURL}/auth/login`, { waitUntil: 'networkidle' });
  }

  /**
   * Fill and submit the login form.
   * @param {string} username
   * @param {string} password
   */
  async login(username, password) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.confirmButton.click();
  }

  /** Wait until the login form is visible */
  async waitForForm() {
    await this.usernameInput.waitFor({ state: 'visible' });
  }
}

module.exports = LoginPage;
