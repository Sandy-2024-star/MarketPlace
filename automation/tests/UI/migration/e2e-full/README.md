# E2E Full Flow

Data-driven runner covering all **46 marketplace migrations** across 4 phases.
Each test walks the complete wizard: Detail → Step 1 (Select) → Step 2 (Upload / Connect source) → Step 3 (Connect destination) → Settings (if present) → Review → Start Migration.

Requires real credentials per phase. Use `DRY_RUN=1` to stop before Start Migration.

---

## Folder structure

```
e2e-full/
├── README.md                  ← this file
├── playwright.config.js       ← isolated Playwright config (testDir: '.')
├── migrations.config.js       ← 44 migration entries (id, type, dataTypes, creds, phase, skip)
├── runner.js                  ← generic orchestrator (handles all types + targets)
└── e2e_all_migrations.spec.js ← parameterised spec that iterates migrations.config.js
```

---

## How to run

> Uses a separate `playwright.config.js` because the main config scopes `testDir` to `./tests`.

```bash
# All active tests (whatever env vars are set)
npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js

# DRY_RUN — walks all steps, stops before Start Migration (safe for CI)
DRY_RUN=1 npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js

# Phase 1 only (LSR target — no extra env vars needed)
npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --grep "phase:1"

# Filter by phase env var
PHASE=1 npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js

# Specific migration by name
npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --grep "GreenLine"

# Headed (recommended when running OAuth flows)
npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --headed
```

---

## Phases & env vars

Tests skip automatically when their required env vars are missing.

### Phase 1 — File → LSR ✅ (active, no extra vars needed)

| Migration | Status |
|-----------|--------|
| GreenLine POS → Lightspeed Retail (X-Series) | ✅ passing |
| QuickBooks POS → Lightspeed Retail (X-Series) | ✅ passing |
| Shopify → Lightspeed Retail (X-Series) | ✅ passing |

Uses:
```
LSR_DOMAIN=linkprod01   (default)
LSR_EMAIL=...
LSR_PASSWORD=...
```

---

### Phase 2 — File → Shopify (9 migrations)

```bash
SHOPIFY_SHOP=store.myshopify.com \
SHOPIFY_USERNAME=you@email.com \
SHOPIFY_PASSWORD=yourpassword \
npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --grep "phase:2" --headed
```

Migrations: Adobe Commerce, Amazon Seller Central, Etsy, Lightspeed Retail (X-Series), PrestaShop, RainPOS, ShopKeep, Wix eCommerce, WooCommerce → Shopify

---

### Phase 3 — File → other targets (14 migrations)

| Target | Env vars | Migrations |
|--------|----------|------------|
| Clover | `CLOVER_EMAIL` + `CLOVER_PASSWORD` | 8 |
| QuickBooks Online | `QBO_EMAIL` + `QBO_PASSWORD` | 3 |
| Xero | `XERO_EMAIL` + `XERO_PASSWORD` | 1 |
| HubSpot | `HUBSPOT_EMAIL` + `HUBSPOT_PASSWORD` | 1 |
| Salesforce | `SALESFORCE_EMAIL` + `SALESFORCE_PASSWORD` | 1 |

```bash
CLOVER_EMAIL=... CLOVER_PASSWORD=... \
npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --grep "Clover" --headed
```

---

### Phase 4 — API-based (13 active + 3 blocked)

Step 2 connects both source and destination on the same screen. Each entry gates on source + (sometimes) destination credentials.

| Migration | Required env vars |
|-----------|-------------------|
| BigCommerce → Shopify | `BIGCOMMERCE_STORE_HASH` + `BIGCOMMERCE_ACCESS_TOKEN` + `SHOPIFY_SHOP` |
| Clover → LSR | `CLOVER_MERCHANT_ID` + `CLOVER_ACCESS_TOKEN` |
| Clover → Shopify | `CLOVER_MERCHANT_ID` + `CLOVER_ACCESS_TOKEN` + `SHOPIFY_SHOP` |
| Cin7 Omni → Cin7 Core | `CIN7OMNI_USERNAME` + `CIN7OMNI_PASSWORD` + `CIN7CORE_USERNAME` + `CIN7CORE_PASSWORD` |
| HubSpot Contacts Migration | `HUBSPOT_EMAIL` + `HUBSPOT_PASSWORD` |
| HubSpot → Salesforce | `HUBSPOT_EMAIL` + `HUBSPOT_PASSWORD` + `SALESFORCE_EMAIL` + `SALESFORCE_PASSWORD` |
| Microsoft Dynamics 365 → Salesforce | `DYNAMICS_EMAIL` + `DYNAMICS_PASSWORD` + `SALESFORCE_EMAIL` + `SALESFORCE_PASSWORD` |
| QuickBooks Online → Xero | `QBO_EMAIL` + `QBO_PASSWORD` + `XERO_EMAIL` + `XERO_PASSWORD` |
| Salesforce → HubSpot | `SALESFORCE_EMAIL` + `SALESFORCE_PASSWORD` + `HUBSPOT_EMAIL` + `HUBSPOT_PASSWORD` |
| Square → Shopify | `SQUARE_EMAIL` + `SQUARE_PASSWORD` + `SHOPIFY_SHOP` |
| Stripe → Chargebee | `STRIPE_API_KEY` + `CHARGEBEE_SITE` + `CHARGEBEE_API_KEY` |
| Xero → QuickBooks Online | `XERO_EMAIL` + `XERO_PASSWORD` + `QBO_EMAIL` + `QBO_PASSWORD` |
| Zoho CRM → Salesforce | `ZOHOCRM_EMAIL` + `ZOHOCRM_PASSWORD` + `SALESFORCE_EMAIL` + `SALESFORCE_PASSWORD` |

> **Blocked** (Cloudflare verification issue on R-Series source — permanently skipped):
> Lightspeed Retail (R-Series) → Clover / LSR / Shopify

---

## How skipping works

`migrations.config.js` evaluates `skip` at load time:

```js
skip: process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable'
```

`e2e_all_migrations.spec.js` calls `test.skip(reason)` for any entry where `skip` is non-null.
The spec label includes the phase tag so `--grep "phase:1"` filters by phase.

---

## Step flow

```
Detail page
  └─ Get Started
       └─ Step 1 — Select data types  (same for all)
            └─ Step 2
                 ├─ File-based  → Upload CSVs + Confirm Files
                 └─ API-based   → Connect source + destination (same screen)
                      └─ Step 3 (file-based only)
                           ├─ Connect destination (OAuth)
                           └─ Settings (if present)
                                └─ Review → Start Migration
```

### Upload button variants (file-based Step 2)

| Wizard style | Button | Handled by |
|---|---|---|
| QB POS, Shopify→LSR | `Upload` (dark button, filechooser) | filechooser via `page.waitForEvent` |
| GreenLine POS | `Browse` label + native `<input type="file">` | `input[type="file"]` indexed by data type order |

---

## Adding a new migration

1. Add an entry to `migrations.config.js` with the correct `id`, `type`, `dataTypes`, `csvFiles`/`sourceType`, `targetType`, `phase`, and `skip` gate.
2. If it's a new `targetType`, add a `case` in `runner.js` → `handleDestConnect`.
3. If it's a new `sourceType`, add a `case` in `runner.js` → `handleSourceConnect`.
4. Run with `--headed` first to watch the flow and catch any UI differences.
