# Migration Tests

Two E2E layers for all marketplace migration wizards, plus focused spec files.

---

## E2E Layers

| Folder | Purpose | Migrations | Depth | Creds needed | When to run |
|--------|---------|------------|-------|--------------|-------------|
| [`e2e-smoke/`](e2e-smoke/README.md) | Breadth — verify every migration card loads, wizard opens, Step 2 renders | 44 | Steps 1–2 | None | Every PR / deploy |
| [`e2e-full/`](e2e-full/README.md) | Depth — full wizard flow: upload → connect → settings → review → launch | 46 | Steps 1–Review | Per phase (see below) | Pre-release / nightly |

---

## Quick start

```bash
# Smoke (CI-safe, ~11 min, no creds)
npx playwright test tests/UI/migration/e2e-smoke/e2e-all-migrations.spec.js --workers=1

# Full flow — Phase 1 (LSR, needs LSR creds)
npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --grep "phase:1" --headed

# Full flow — DRY_RUN (walks all steps, stops before Start Migration)
DRY_RUN=1 npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --headed
```

---

## e2e-full phases at a glance

| Phase | Target | Key env vars | Migrations |
|-------|--------|-------------|------------|
| 1 | Lightspeed Retail (LSR) | `LSR_DOMAIN` `LSR_EMAIL` `LSR_PASSWORD` | 3 file-based |
| 2 | Shopify | `SHOPIFY_SHOP` `SHOPIFY_USERNAME` `SHOPIFY_PASSWORD` | 9 file-based |
| 3 | Clover / QBO / Xero / HubSpot / Salesforce | per-target email+password | 14 file-based |
| 4 | API-based (various source + target) | per-migration source creds | 13 active + 3 blocked |

---

## Other spec files

| File | What it tests |
|------|--------------|
| `migration.spec.js` | My Projects — heading, search, filter buttons (5) |
| `wizard.spec.js` | Wizard Steps 1 & 2 — data type selection, upload, API connect (16) |
| `validate.spec.js` | App discovery walkthrough — 9 serial steps including network interception (9) |
| `error-states.spec.js` | Auth guard — unauthenticated access and expired session redirect to login (4) |
| `e2e_migration.spec.js` | [IGNORED] Ad-hoc single migration E2E — Shopify→LSR, Customers, linkprod01 |
| `e2e_migration_full.spec.js` | [IGNORED] Ad-hoc single migration E2E — Shopify→LSR, 3 data types, linkprod03 |

---

## e2e-smoke spec files

| File | What it tests |
|------|--------------|
| `e2e-all-migrations.spec.js` | All 44 migration cards — Steps 1–2, no creds (44) |
| `integration-smoke.spec.js` | Square→QBO integration template — detail page + CTA + flow launch (1) |
| `probe.spec.js` | [IGNORED] Registry refresh tool — hits live API to rebuild `migrations-registry.js` |
