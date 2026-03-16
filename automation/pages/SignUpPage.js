// Page Object Model – Sign Up page
// URL: /auth/signup — reached via "Sign Up here" link on the login page.
// Selectors validated against live app via probe_signup.spec.js.

const config = require('../utils/config');

class SignUpPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Use name attributes — unique and unambiguous (placeholders have substring overlap)
    this.emailInput        = page.locator('input[name="email"]');
    this.usernameInput     = page.locator('input[name="username"]');
    this.nameInput         = page.locator('input[name="name"]');
    this.passwordInput     = page.locator('input[name="password"]');
    this.confirmPassInput  = page.locator('input[name="confirmPassword"]');
    this.verifyEmailButton = page.getByRole('button', { name: /verify email/i });
    this.loginLink         = page.getByRole('link', { name: 'Login' });
  }

  /** Navigate directly to the sign-up page */
  async goto() {
    await this.page.goto(`${config.baseURL}/auth/signup`, { waitUntil: 'networkidle' });
  }

  /** Wait until the sign-up form is ready */
  async waitForForm() {
    await this.emailInput.waitFor({ state: 'visible', timeout: config.defaultTimeout });
  }

  /**
   * Fill every field and submit.
   * @param {{ email: string, username: string, name: string, password: string, confirmPassword: string }} data
   */
  async fillAndSubmit({ email, username, name, password, confirmPassword }) {
    await this.emailInput.fill(email);
    await this.usernameInput.fill(username);
    await this.nameInput.fill(name);
    await this.passwordInput.fill(password);
    await this.confirmPassInput.fill(confirmPassword);
    await this.verifyEmailButton.click();
  }
}

module.exports = SignUpPage;
