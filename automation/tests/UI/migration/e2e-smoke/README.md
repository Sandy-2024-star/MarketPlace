# E2E Smoke Tests

Fast, credential-free breadth checks covering all marketplace migration templates.
Stops at Step 2 — safe to run on every PR and every deploy.

## Folder contents

| File | Purpose |
|------|---------|
| `migrations-registry.js` | Source of truth — card name, type (`file`/`api`), listing ID, dataTypes |
| `e2e-all-migrations.spec.js` | Main runner — one test per migration, fully parameterized |
| `probe.spec.js` | Data collector — re-run against the live API to refresh the registry |

---

## How the registry was built

`probe.spec.js` hits the marketplace API (`/listings?type=migration&limit=300`) and uses the `fromImportV2` field on each entity to classify migrations:

- `fromImportV2: true` → **file-based** (Step 2 = upload CSV)
- `fromImportV2: false` → **API-based** (Step 2 = connect source credentials)

The marketplace has **47 visible cards** broken down as:

| Count | Explanation |
|-------|-------------|
| 44 | Unique migration templates in the registry |
| 2 | Duplicate migrations (same card name, different backend IDs — deduped by probe) |
| 1 | `integration` type listing ("Square To Quickbooks integration") — not a migration wizard |

Current registry: **44 unique migrations** — 28 file-based, 16 API-based.

---

## What each test does

```
1. Navigate directly to /listing/{id}          (skips marketplace pagination — fastest path)
2. Verify detail page title + badge (File Based / API)
3. Click Get Started → wizard loads
4. Step 1: try each dataType from registry until one enables Continue → click Continue
5. Step 2 (branch on live badge, not registry type):
     file → assert "Upload your files" heading visible + Continue disabled
     api  → assert "Connect systems" heading visible + any input or connect button visible + Continue disabled
6. STOP — no files uploaded, no credentials entered, no live migrations triggered
```

> **Note:** Step 2 branches on the **actual UI badge** read at runtime, not the registry `type` field.
> Some migrations (e.g. Square to Shopify) show a different badge than their `fromImportV2` value.

---

## Run commands

```bash
# All migrations — single worker (safe, ~11 min)
npx playwright test tests/UI/migration/e2e-smoke/e2e-all-migrations.spec.js --workers=1 --timeout=60000

# All migrations — headed (watch the browser)
npx playwright test tests/UI/migration/e2e-smoke/e2e-all-migrations.spec.js --workers=1 --timeout=60000 --headed

# File-based only (28 migrations)
npx playwright test tests/UI/migration/e2e-smoke/e2e-all-migrations.spec.js --grep "\[file\]" --workers=1

# API-based only (16 migrations)
npx playwright test tests/UI/migration/e2e-smoke/e2e-all-migrations.spec.js --grep "\[api\]" --workers=1

# Single migration by name
npx playwright test tests/UI/migration/e2e-smoke/e2e-all-migrations.spec.js --grep "Adobe Commerce"

# Refresh registry after new migrations are added to the marketplace
npx playwright test tests/UI/migration/e2e-smoke/probe.spec.js --workers=1
```

---

## Auth state

Tests use `fixtures/auth.fixture.js` which loads a pre-authenticated browser session.

- **Primary**: `test-results/storageState.json` — written by `global-setup.js` before each run
- **Fallback**: `fixtures/.auth.json` — backup copy, used if `test-results/` is cleared mid-run by a concurrent Playwright process

If both files are missing, run `global-setup` manually or start any Playwright test (it triggers global-setup automatically).

---

## Extending to full E2E (Step 3+)

For full wizard flows (upload CSVs, OAuth connect, Review, Start Migration) see [`e2e-full/`](../e2e-full/README.md).
