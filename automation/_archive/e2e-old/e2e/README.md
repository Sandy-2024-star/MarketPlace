# E2E Migration Tests

Full end-to-end wizard flows for all migration templates.
Lives at: `tests/UI/migration/e2e/`

---

## Folder Structure

```
e2e/
├── README.md                        ← this file
├── migration_configs.js             ← data table: one entry per migration
├── e2e_runner.spec.js               ← data-driven runner (reads migration_configs)
└── probes/
    ├── probe_file_based.spec.js     ← step discovery: file-based migration
    └── probe_api_based.spec.js      ← step discovery: API-based migration
```

---

## How It Works

### migration_configs.js
One entry per migration we can run. Each entry defines:
- `cardTitle` — exact text on the marketplace card
- `type` — `'file'` or `'api'`
- `dataTypes` — data type buttons to select on Step 1
- `csvFiles` — `{ DataType: absolutePath }` for file-based (null for api)
- `sourceCredentials` — `{ storeHash, accessToken, shop }` for API-based (null for file)
- `destinationDomain` — Shopify shop domain or LSR domain prefix for Step 3 OAuth
- `skip` — auto-set to `true` when required env vars are missing

### e2e_runner.spec.js
Data-driven test that loops through all non-skipped configs and runs the full wizard flow. Controlled by `DRY_RUN` env var.

---

## Step Flow

| Step | File-based | API-based |
|------|-----------|-----------|
| 1 | Select data types (same for all) | Select data types (same for all) |
| 2 | Upload CSVs → Confirm → Data Preview | storeHash + accessToken + shop → Connect Account ×2 |
| 3 | `Enter shop` input → Connect Account → Shopify OAuth popup | Settings / Validate (if present) |
| 4 | Settings (if present) | Review → Ready for launch |
| Last | Review → Start Migration | Review → Start Migration |

**Confirmed via live probes:**
- File-based Step 2: file chooser (no popup/checkbox) → "Confirm Files & Start Processing" → Data Preview shows row counts
- File-based Step 3: `Enter shop` input + single Connect Account button → Shopify OAuth popup
- API-based Step 2: two side-by-side cards (Source + Target) each with credentials + Connect Account button
- API-based step indicator: Select → Connect → Validate → Review

---

## Running

```bash
# DRY_RUN (default) — walks all steps, stops before Start Migration — safe for CI
npx playwright test UI/migration/e2e/e2e_runner.spec.js

# Full live run — actually starts a migration (use dedicated test accounts only)
DRY_RUN=false npx playwright test UI/migration/e2e/e2e_runner.spec.js --headed

# Single migration by name
npx playwright test UI/migration/e2e/e2e_runner.spec.js --grep "Adobe Commerce"

# Step probes — discovery only, no assertions, no data written
npx playwright test UI/migration/e2e/probes/ --headed
```

---

## Required Env Vars

Set these in `.env` to unlock the corresponding migration configs:

| Env Var | Required For | Example |
|---------|-------------|---------|
| `SHOPIFY_SHOP` | All file-based → Shopify (Step 3 OAuth) | `my-store.myshopify.com` |
| `SHOPIFY_EMAIL` | Shopify OAuth login | `admin@my-store.com` |
| `SHOPIFY_PASSWORD` | Shopify OAuth login | `••••••` |
| `LSR_DOMAIN` | Shopify → Lightspeed Retail | `linkprod01` |
| `LSR_EMAIL` | LSR OAuth login | `user@example.com` |
| `LSR_PASSWORD` | LSR OAuth login | `••••••` |
| `BC_STORE_HASH` | BigCommerce → Shopify (API source) | `abc123xyz` |
| `BC_ACCESS_TOKEN` | BigCommerce → Shopify (API source) | `••••••` |
| `SQUARE_STORE_HASH` | Square → Shopify (API source) | `sq-••••` |
| `SQUARE_ACCESS_TOKEN` | Square → Shopify (API source) | `••••••` |

Without these, configs are auto-skipped and the runner prints:
```
No active migration configs — set required env vars to enable
```

---

## DRY_RUN Behaviour

| Situation | DRY_RUN=true (default) | DRY_RUN=false |
|-----------|----------------------|---------------|
| OAuth popup gets 403 / fails | ⚠ Logs warning, test passes | ❌ Test fails |
| Step 3 Connect doesn't complete | ⚠ Logs warning, stops gracefully | ❌ Asserts continueButton enabled |
| Reaches Review step | ✅ Stops before Start Migration | 🚀 Clicks Start Migration |

---

## Active Configs (as of last update)

| Migration | Type | Gate |
|-----------|------|------|
| Adobe Commerce to Shopify | file | `SHOPIFY_SHOP` |
| Shopify to Lightspeed Retail (X-Series) | file | `LSR_DOMAIN` |
| BigCommerce to Shopify | api | `BC_STORE_HASH` |
| Square to Shopify | api | `SQUARE_STORE_HASH` |

> BigCommerce to Shopify is **API only** — it does not have a file upload step.
> Step indicator for API migrations: Select → Connect → Validate → Review.
