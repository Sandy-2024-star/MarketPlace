# Flow Marketplace — Playwright Automation Framework

UI and API test automation for the [Flow Marketplace](https://marketplace.flow.staging.linktoany.com) web application, built with Playwright and the Page Object Model (POM) pattern.

---

## Project Structure

```
automation/
├── pages/                                  # Page Object Models
│   ├── BasePage.js                         # Shared base class (goto, waitForSpinner, screenshot)
│   ├── LandingPage.js                      # /landing
│   ├── LoginPage.js                        # /auth/login
│   ├── SignUpPage.js                       # /auth/signup
│   ├── ForgotPasswordPage.js               # /auth/forgot-password
│   ├── MarketplacePage.js                  # /listings
│   ├── MigrationPage.js                    # /listings?tab=projects (My Projects)
│   ├── MigrationDetailPage.js              # /listing/{id}
│   ├── MigrationWizardPage.js              # /migration-flow (multi-step wizard)
│   └── ShopifyLoginPage.js                 # accounts.shopify.com — SSO login + Cloudflare handling
│
├── helpers/
│   ├── ShopifySSO.js                       # Full Shopify SSO orchestrator (login → store → session)
│   └── SourceConnector.js                  # Generic source connector (Square OAuth, Shopify dropdown)
│
├── tests/
│   ├── UI/                                 # Browser UI tests
│   │   ├── auth/
│   │   │   ├── login.spec.js               # Login form + auth flow (5)
│   │   │   ├── signup.spec.js              # Sign up form + validation (5)
│   │   │   ├── signout.spec.js             # Sign out + post-logout access (4)
│   │   │   ├── forgotpassword.spec.js      # Forgot password page (4)
│   │   │   ├── onboarding.spec.js          # Onboarding flow (5)
│   │   │   └── shopify.setup.spec.js       # [IGNORED] Shopify SSO setup
│   │   ├── marketplace/
│   │   │   ├── marketplace.spec.js         # Listing, search, card navigation (11)
│   │   │   ├── filters.spec.js             # Tab filter interactions (10)
│   │   │   ├── pagination.spec.js          # Pagination + items-per-page (10)
│   │   │   ├── search-behavior.spec.js     # Search edge cases (7)
│   │   │   ├── card-detail.spec.js         # Detail page sections + badges + pricing (8)
│   │   │   ├── card-badges.spec.js         # Migration type badge coverage (5)
│   │   │   ├── navigation-flows.spec.js    # Back/forward + deep links (8)
│   │   │   ├── landing-page.spec.js        # Landing page structure (8)
│   │   │   ├── url-persistence.spec.js     # URL state + shareable links (7)
│   │   │   ├── my-projects.spec.js         # My Projects tab (6)
│   │   │   ├── sign-out.spec.js            # Sign out + Escape key dismiss (5)
│   │   │   ├── file-assist.spec.js         # File Assist tab — load, nav, no JS errors (7)
│   │   │   ├── user-profile.spec.js        # User menu + profile probe (6)
│   │   │   ├── responsive.spec.js          # Mobile 375px + Tablet 768px layout (9)
│   │   │   ├── wizard-step1.spec.js        # Wizard Step 1 rendering (7)
│   │   │   ├── explore.spec.js             # App-wide visual exploration (10)
│   │   │   └── list_templates.spec.js      # UI crawl of all 47 cards + inventory snapshot
│   │   ├── migration/
│   │   │   ├── migration.spec.js           # My Projects — search, filters (5)
│   │   │   ├── wizard.spec.js              # Migration wizard Steps 1 & 2 + detail badges (16)
│   │   │   ├── validate.spec.js            # App discovery walkthrough — 9 serial steps (9)
│   │   │   ├── error-states.spec.js        # Auth guard — unauthenticated/expired session (4)
│   │   │   ├── e2e_migration.spec.js       # [IGNORED] Ad-hoc E2E — live account (linkprod01)
│   │   │   ├── e2e_migration_full.spec.js  # [IGNORED] Ad-hoc E2E — live account (linkprod03)
│   │   │   ├── e2e-smoke/                  # Breadth layer — 44 migrations + 1 integration, Steps 1–2, no creds
│   │   │   │   ├── e2e-all-migrations.spec.js
│   │   │   │   ├── integration-smoke.spec.js   # Square→QBO integration flow smoke
│   │   │   │   ├── migrations-registry.js
│   │   │   │   └── probe.spec.js           # [IGNORED] Registry refresh tool (manual)
│   │   │   └── e2e-full/                   # [IGNORED] Depth layer — full wizard, 4 phases
│   │   │       ├── playwright.config.js    # Isolated config (workers:1, timeout:300s, retries:0)
│   │   │       ├── e2e_all_migrations.spec.js
│   │   │       ├── migrations.config.js
│   │   │       └── runner.js
│   │   └── shopify/                        # [IGNORED] All files require Shopify SSO credentials
│   │       ├── shopifyLogin.spec.js
│   │       ├── e2e_square_shopify.spec.js
│   │       └── e2e_square_shopify_v2.spec.js
│   ├── api/                                # API tests (no browser)
│   │   ├── auth.spec.js                    # POST /auth/login (2)
│   │   ├── marketplace.spec.js             # Listings, systems, user info (4)
│   │   ├── listing.spec.js                 # Listing detail + endpoints (11)
│   │   └── list_templates.spec.js          # Template catalog + inventory snapshot (7)
│   └── fixtures/                           # (legacy path — fixtures now in /fixtures)
│
├── fixtures/
│   ├── global-setup.js                     # Logs in once, saves storageState before suite
│   ├── auth.fixture.js                     # Playwright fixture: pre-authenticated page on /listings
│   ├── sso.fixture.js                      # Shopify SSO fixture
│   ├── stealth.fixture.js                  # Stealth mode fixture
│   └── data/
│       ├── customers_export.csv            # Sample CSV for file-based migration tests
│       ├── products_export.csv
│       ├── orders_export.csv
│       └── templates_catalog.json
│
├── utils/
│   ├── config.js                           # Central config (URLs, credentials, timeouts)
│   ├── wait.js                             # Shared wait helpers (waitForSpinner, waitForDetailSpinner)
│   ├── nav.js                              # Navigation helpers (ensureOnListings)
│   ├── retry.js                            # withRetry(fn, opts) — retries async actions with backoff
│   ├── page-helpers.js                     # waitForVisible, selectDropdownByText, performLogin
│   ├── dashboard.js                        # Custom HTML dashboard generator
│   ├── liveReporter.js                     # Live progress reporter (real-time test status + steps.json)
│   ├── stealth.js                          # Stealth launch args for STEALTH_MODE
│   └── testData.json                       # Static test data
│
├── scripts/
│   ├── capture_session.js                  # Save browser session state to disk
│   ├── probe_shopify_login.js              # Shopify login probe with network logging
│   └── probe_shopify_api_login.js          # Raw HTTPS credentials validator (no browser)
│
├── _archive/
│   └── e2e-old/                            # Archived — superseded by e2e-full + e2e-smoke
│
├── test-results/
│   ├── results.json                        # Playwright JSON output (auto-generated)
│   ├── dashboard.html                      # Visual HTML dashboard (auto-generated)
│   ├── steps.json                          # Per-test step data for dashboard (auto-generated)
│   ├── history.json                        # Run history — up to 200 entries
│   ├── inventory.json                      # Migration template catalog snapshot
│   └── storageState.json                   # Saved auth session (written by global-setup)
│
├── .env                                    # Environment variables (do not commit)
├── dashboard.config.json                   # Dashboard thresholds and history settings
├── playwright.config.js                    # Main Playwright configuration
└── README.md
```

---

## Prerequisites

- Node.js 18+
- npm

---

## Setup

```bash
cd automation
npm install
npx playwright install chromium
```

Copy `.env` and fill in your credentials:

```env
BASE_URL=https://marketplace.flow.staging.linktoany.com
API_URL=https://marketplace.flow.staging.linktoany.com/api/1.0

USERNAME=your_username
PASSWORD=your_password

# E2E Full — Phase 1 (LSR)
LSR_DOMAIN=linkprod01
LSR_EMAIL=your_lsr_email
LSR_PASSWORD=your_lsr_password
```

---

## Running Tests

### npm scripts

| Script | What it runs | Tests |
|--------|-------------|-------|
| `npm test` | Full suite — main config | ~263 |
| `npm run test:auth` | Auth UI tests | ~37 |
| `npm run test:marketplace` | Marketplace UI tests | ~125 |
| `npm run test:migration` | Migration UI + wizard + error-states | ~34 |
| `npm run test:validate` | App discovery walkthrough | 9 |
| `npm run test:api` | API tests (no browser) | 24 |
| `npm run test:smoke` | 45 smoke tests — all migrations + integration, Steps 1–2, no creds | 45 |
| `npm run test:e2e-full:p1:dry` | Phase 1 full flow — stops before Start Migration | 3 |
| `npm run test:e2e-full:p1` | Phase 1 full flow — runs live migration | 3 |
| `npm run test:e2e-full:dry` | All phases — stops before Start Migration | 44 |
| `npm run test:e2e-full` | All phases — runs live migrations | 44 |
| `npm run test:e2e-single` | Ad-hoc: Shopify→LSR, Customers only | 1 |
| `npm run test:e2e-single:full` | Ad-hoc: Shopify→LSR, 3 data types | 1 |
| `npm run probe:registry` | Refresh `migrations-registry.js` from live API | — |
| `npm run show-report` | Open main HTML report | — |
| `npm run show-report:e2e` | Open e2e-full HTML report | — |
| `npm run dashboard` | Regenerate dashboard.html | — |

### Useful flags

```bash
npx playwright test --headed                         # visible browser
npx playwright test --grep "Adobe Commerce"          # single test by name
npx playwright test --grep "\[file\]"                # smoke: file-based only
npx playwright test --grep "\[api\]"                 # smoke: API-based only
npx playwright test --grep "phase:1"                 # e2e-full: Phase 1 only
```

### Excluded test files

| Pattern | Reason | How to run |
|---------|--------|------------|
| `**/shopify/**` | Requires Shopify SSO credentials | `npm run test:shopify` |
| `**/auth/shopify.setup.spec.js` | Shopify SSO session setup | Manual `--headed` |
| `**/migration/e2e_migration*.spec.js` | Ad-hoc — real migration on live account | `npm run test:e2e-single` |
| `**/migration/e2e-full/**` | Deep E2E — runs via its own config | `npm run test:e2e-full` |
| `**/e2e-smoke/probe.spec.js` | Registry refresh tool — manual only | `npm run probe:registry` |

---

## E2E Layers

### Smoke (`e2e-smoke/`)

Breadth layer. Verifies all 44 migration cards load, wizard opens, and Step 2 renders. No credentials, no data written. Safe on every PR.

```
1. Navigate to /listing/{id}
2. Verify title + badge
3. Click Get Started → wizard loads
4. Step 1: select data type → Continue enables
5. Step 2: correct heading visible, Continue disabled
   STOP — no upload, no credentials, no migration started
```

### Full (`e2e-full/`)

Depth layer. Full wizard from detail page to Review (or Start Migration with live creds). Uses dedicated `playwright.config.js` with `workers:1`, `timeout:300s`, `retries:0`.

| Phase | Target | Key env vars | Migrations |
|-------|--------|-------------|------------|
| 1 | Lightspeed Retail | `LSR_DOMAIN` `LSR_EMAIL` `LSR_PASSWORD` | 3 ✅ tested |
| 2 | Shopify | `SHOPIFY_SHOP` `SHOPIFY_USERNAME` `SHOPIFY_PASSWORD` | 9 |
| 3 | Clover / QBO / Xero / HubSpot / Salesforce | per-target `EMAIL` + `PASSWORD` | 14 |
| 4 | API sources (BigCommerce, Square, Stripe, etc.) | per-migration creds | 13 active + 3 blocked |

> Use `DRY_RUN=1` to walk the full wizard and stop at Review without clicking Start Migration.

---

## Auth Fixture

Most UI tests use `fixtures/auth.fixture.js` instead of logging in per-test:

```js
const { test, expect } = require('../../../fixtures/auth.fixture');

test('my test', async ({ page }) => {
  // page is already authenticated and on /listings
});
```

The fixture reads `storageState.json` written by `global-setup.js` (runs once before the suite). Saves ~3s per test vs a full login in `beforeEach`.

Tests that need an **unauthenticated** page (login, signup, forgot-password) use `@playwright/test` directly.

---

## Custom Dashboard

Generated automatically after each test run. To regenerate manually:

```bash
npm run dashboard
```

Reads `test-results/results.json` → produces `test-results/dashboard.html`.

### Dashboard Tabs

| Tab | Contents |
|-----|---------|
| **Summary** | Release gate, stat cards, pass rate trend, slowest tests by category |
| **Tests** | Searchable test list with expandable panels (errors, screenshots, traces, steps) |
| **Catalog** | Migration template inventory with File Based / API filter and search |
| **Compare** | Previous vs current run diff + full run history |

### Release Gate States

| State | Condition |
|-------|-----------|
| 🟢 SAFE TO RELEASE | 0 failures |
| 🟡 REVIEW REQUIRED | Failures < `blockThresholdPct` |
| 🔴 BLOCKED | Failures ≥ `blockThresholdPct` or any timeout |
| ⚫ INCOMPLETE RUN | Any test with unknown status |

### Dashboard Configuration (`dashboard.config.json`)

```json
{
  "slowThresholdMs": 40000,
  "blockThresholdPct": 1,
  "reviewThresholdPct": 95,
  "historyLimit": 200,
  "perTestThresholds": {
    "INVENTORY – list migration templates and type": 360000
  }
}
```

| Key | Description |
|-----|------------|
| `slowThresholdMs` | Duration (ms) above which a test is marked slow 🐢 |
| `blockThresholdPct` | Failure % that triggers BLOCKED gate |
| `reviewThresholdPct` | Pass % required for SAFE gate |
| `historyLimit` | Max run history entries kept in `history.json` |
| `perTestThresholds` | Per-test slow threshold overrides by test title |

---

## Page Objects

All page objects extend `BasePage` which provides:

| Method | Description |
|--------|------------|
| `goto(path, waitUntil?)` | Navigate to `baseURL + path` |
| `waitForSpinner(timeout?)` | Wait for "Loading..." spinner to disappear |
| `screenshot(label)` | Save full-page screenshot to `test-results/` |

### LoginPage — `/auth/login`
| Locator / Method | Description |
|-----------------|------------|
| `usernameInput` | `placeholder="Enter your username"` |
| `passwordInput` | `placeholder="Enter your password"` |
| `confirmButton` | Submit button |
| `forgotPasswordLink` | "Forgot password?" link |
| `signUpLink` | "Sign Up here" link |
| `goto()` | Navigate to `/auth/login` |
| `login(username, password)` | Fill + submit login form |

### ShopifyLoginPage — `accounts.shopify.com`
| Locator / Method | Description |
|-----------------|------------|
| `login(username, password)` | 2-step login with Cloudflare `verify=` polling + retry loop |
| `ssoSetup(username, password, ssoUrl, shopHandle)` | Full SSO flow — login → store select → save session |
| `waitForVerifyClear(maxMs?)` | Poll until Cloudflare challenge clears |
| `handleCaptcha()` | Wait for manual CAPTCHA resolution if Turnstile appears |

### MarketplacePage — `/listings`
| Locator / Method | Description |
|-----------------|------------|
| `heading` | `h1` — "Marketplace" |
| `searchInput` | Search input |
| `tabAll` / `tabMigrations` / `tabIntegrations` | Category tab filters |
| `previousButton` / `nextButton` | Pagination |
| `waitForLoaded()` | Waits for heading + first card |
| `getCardTitles()` | Returns `string[]` of visible card titles |
| `openCard(titleText)` | Clicks card by partial title |
| `search(keyword)` | Fill search input and wait |
| `setItemsPerPage(value)` | Change cards-per-page (10/20/50/100) |
| `goToMyProjects()` / `goToFileAssist()` | Sidebar navigation |

### MigrationDetailPage — `/listing/{id}`
| Locator / Method | Description |
|-----------------|------------|
| `title` | `h1` — template name |
| `migrationTypeBadge` | "File Based" or "API" badge |
| `ctaButton` | Primary CTA — "Get Started" or "Set up Integration" |
| `waitForLoaded()` | Waits for title + CTA (handles migration and integration types) |
| `clickGetStarted()` | Clicks CTA and waits for wizard |
| `getTitle()` | Returns title text |

### MigrationWizardPage — `/migration-flow`
| Locator / Method | Description |
|-----------------|------------|
| `step1Heading` | "Choose your data" |
| `step2FileHeading` / `step2ApiHeading` | Step 2 headings |
| `step3ConnectHeading` | "Connect destination" |
| `step4SettingsHeading` | Settings heading |
| `step5ReviewHeading` | Review heading |
| `continueButton` | Footer Continue |
| `startMigrationButton` | Final "Start Migration" button |
| `confirmFilesButton` | "Confirm Files & Start Processing" |
| `waitForLoaded()` | Waits for spinner; auto-dismisses resume modal |
| `selectDataTypes(types[])` | Click Step 1 type buttons |
| `uploadFileAndConfirm(filePath)` | Full Step 2 upload (single type) |
| `uploadFileForType(type, filePath)` | Upload for a specific data type section |
| `connectDestinationAccount(domain, email, pass)` | Step 3 LSR OAuth connect |
| `configureSettings()` | Step 4 auto-configure |

---

## Utility Helpers

### `utils/wait.js`
```js
const { waitForSpinner, waitForDetailSpinner, waitForHeading } = require('./utils/wait');

await waitForSpinner(page);                  // wait for "Loading..." to disappear
await waitForDetailSpinner(page);            // wait for "Loading migration details..."
await waitForHeading(page, 'Marketplace');   // wait for a heading text
```

### `utils/retry.js`
```js
const { withRetry } = require('./utils/retry');

await withRetry(
  () => page.goto(url, { waitUntil: 'domcontentloaded' }),
  { attempts: 2, delayMs: 2000, label: 'goto /listings' }
);
```

### `utils/nav.js`
```js
const { ensureOnListings } = require('./utils/nav');

await ensureOnListings(page);  // handles /listings and /onboarding redirect after login
```

---

## API Reference

All authenticated requests use:
```
Authorization: Session {session_token}
```

| Method | Endpoint | Description |
|--------|---------|------------|
| `POST` | `/api/1.0/auth/login` | Login → `{ session }` (201) |
| `GET` | `/api/1.0/user/get-authenticated` | Current user info |
| `GET` | `{serviceURL}/listings` | Paginated listings |
| `GET` | `{serviceURL}/listings/{id}` | Single listing detail |
| `GET` | `{serviceURL}/systems` | All source/target systems |

`serviceURL` = `BASE_URL/api/1.0/standalone-flow-marketplace-backend-service`

---

## Configuration

### `playwright.config.js` (main)

| Setting | Value |
|---------|-------|
| Browser | Chromium only |
| Timeout (per test) | 60s |
| Action timeout | 30s |
| Navigation timeout | 60s |
| Retries | 1 |
| Workers | 4 |
| Screenshots | On (all tests) |
| Video | On (all tests) |
| Trace | On first retry |
| Reporter | liveReporter + HTML + JSON |

### `e2e-full/playwright.config.js`

| Setting | Value |
|---------|-------|
| Timeout (per test) | 300s |
| Retries | 0 |
| Workers | 1 |
| Trace | Always on |
| Reporter | liveReporter + HTML + JSON |

---

## Test Coverage

### Active — ~263 tests

| Category | Tests | Spec files |
|----------|-------|-----------|
| API | 24 | `api/auth`, `api/marketplace`, `api/listing`, `api/list_templates` |
| UI · Auth | ~37 | `auth/login`, `auth/signup`, `auth/signout`, `auth/forgotpassword`, `auth/onboarding`, `auth/auth-pages` |
| UI · Marketplace | ~125 | 19 spec files — marketplace, filters, pagination, search, cards, navigation, landing, wizard, explore, templates, file-assist, user-profile, responsive, sign-out |
| UI · Migration | ~77 | `migration.spec`, `wizard.spec`, `validate.spec`, `error-states.spec`, `e2e-smoke` (45) |
| **Total** | **~263** | **—** |

### Excluded (manual / require credentials)

| Suite | File | Reason |
|-------|------|--------|
| Shopify Login | `UI/shopify/shopifyLogin.spec.js` | Shopify SSO creds |
| E2E Square→Shopify | `UI/shopify/e2e_square_shopify*.spec.js` | Shopify SSO creds |
| Shopify SSO Setup | `UI/auth/shopify.setup.spec.js` | Manual `--headed` |
| E2E Migration (single) | `UI/migration/e2e_migration.spec.js` | Live account (linkprod01) |
| E2E Migration (full) | `UI/migration/e2e_migration_full.spec.js` | Live account (linkprod03) |
| E2E Full (all phases) | `UI/migration/e2e-full/` | Own config — `npm run test:e2e-full` |
| Registry Probe | `UI/migration/e2e-smoke/probe.spec.js` | Manual tool — `npm run probe:registry` |

---

## Known Issues & Fixes

### Integration templates — "Set up Integration" button (fixed)
**Symptom:** `waitForLoaded()` timed out on integration card detail pages.
**Fix:** `MigrationDetailPage` uses `ctaButton` matching either "Get Started" or "Set up Integration".

---

### Wizard login overhead (fixed)
**Symptom:** Each of 16 wizard tests spent ~3s on login in `beforeEach`.
**Fix:** `global-setup.js` logs in once, saves `storageState.json`. Tests use fixture to skip login.

---

### Wizard timeout cascade (fixed)
**Symptom:** 1 failure + up to 24 skips — all wizard tests cascaded after one navigation timeout.
**Fix:** `waitUntil: 'domcontentloaded'`, `withRetry` on navigation, `navigationTimeout` increased to 60s.

---

### GreenLine POS file upload (fixed)
**Symptom:** `filechooser` event timed out — wizard shows "Browse" (decorative) + native `<input type="file">`.
**Fix:** `runner.js` falls back to `input[type="file"].nth(index).setInputFiles(path)` when no Upload button found.

---

### SPA transition race in wizard (fixed)
**Symptom:** After clicking Continue on Step 2, `detectNextStep` immediately resolved to `'upload'` from the still-visible heading.
**Fix:** Wait for `step2FileHeading` to go `hidden` + 500ms settle before running `Promise.race` on headings.

---

### liveReporter RangeError on retried tests (fixed)
**Symptom:** `RangeError: Invalid count value` crash in the progress bar when retried tests pushed `this.done > this.total`.
**Fix:** `bar()` now clamps `filled` to `[0, width]` and guards against `total === 0`. `_printProgress()` clamps `pct` to 100.
