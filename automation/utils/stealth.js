// Stealth helper — suppresses common browser automation signals.
// Enable via STEALTH_MODE=true in .env
//
// Usage in any test file:
//   const { applyStealthScripts } = require('../utils/stealth');
//   test.beforeEach(async ({ page }) => { await applyStealthScripts(page); });
//
// Or call once after page creation in a helper/fixture.

const config = require('./config');

const STEALTH = process.env.STEALTH_MODE === 'true' || config.stealthMode;

/**
 * Injects page-level scripts that hide common automation fingerprints.
 * Safe to call on every page — no-ops when STEALTH_MODE is off.
 * @param {import('@playwright/test').Page} page
 */
async function applyStealthScripts(page) {
  if (!STEALTH) return;

  await page.addInitScript(() => {
    // 1. Remove navigator.webdriver flag (primary detection signal)
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // 2. Spoof chrome runtime (headless Chrome lacks this)
    window.chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {},
    };

    // 3. Make navigator.plugins non-empty
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin' },
        { name: 'Chrome PDF Viewer' },
        { name: 'Native Client' },
      ],
    });

    // 4. Set realistic languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // 5. Spoof screen dimensions to match a real desktop
    Object.defineProperty(screen, 'width',       { get: () => 1920 });
    Object.defineProperty(screen, 'height',      { get: () => 1080 });
    Object.defineProperty(screen, 'availWidth',  { get: () => 1920 });
    Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
    Object.defineProperty(screen, 'colorDepth',  { get: () => 24 });

    // 6. Prevent permission query fingerprinting
    const origQuery = window.navigator.permissions?.query?.bind(navigator.permissions);
    if (origQuery) {
      navigator.permissions.query = (params) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(params);
    }
  });
}

/**
 * Returns launch args that reduce automation signals at the browser level.
 * Pass these into playwright.config.js launchOptions.args.
 */
function getStealthLaunchArgs() {
  if (!STEALTH) return [];
  return [
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
  ];
}

module.exports = { applyStealthScripts, getStealthLaunchArgs, STEALTH };
