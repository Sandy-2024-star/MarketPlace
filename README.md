# Flow Marketplace — Automation Framework

![CI](https://github.com/Sandy-2024-star/MarketPlace/actions/workflows/ci.yml/badge.svg)

End-to-end and API test automation suite for the Flow Marketplace web application.
Built with Playwright and TypeScript using the Page Object Model pattern.

---

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [Playwright](https://playwright.dev) | 1.49.0 | Browser automation + test runner |
| TypeScript | 5.x | Strict typing across all test code |
| Node.js | ≥ 22.5.0 | Runtime |
| Chromium | latest | Default test browser |

---

## Quick Start

```bash
cd automation
npm install
npx playwright install chromium
```

Create `automation/.env`:

```env
BASE_URL=https://marketplace.flow.staging.linktoany.com
```

Run all tests:

```bash
npm test
```

---

## Test Suites

| Suite | Specs | Command |
|---|---|---|
| Auth | 7 | `npm run test:auth` |
| Marketplace | 17 | `npm run test:marketplace` |
| Migration | 10 | `npm run test:migration` |
| Shopify | 3 | `npm run test:shopify` |
| API | 4 | `npm run test:api` |
| **Total** | **44** | `npm test` |

---

## Project Structure

```
automation/
├── fixtures/        Global setup, auth, SSO, stealth fixtures
├── helpers/         ShopifySSO, SourceConnector
├── pages/           Page Object Model — 13 page classes
├── tests/
│   ├── UI/auth/          Auth flows (login, signup, forgot password)
│   ├── UI/marketplace/   Marketplace UI (filters, search, cards, pagination)
│   ├── UI/migration/     Migration wizard, e2e, smoke, validation
│   └── UI/shopify/       Shopify OAuth + Square → Shopify e2e
│   └── api/              REST API contract tests
├── utils/           Config, nav, retry, wait, stealth helpers
├── types/           Shared TypeScript definitions
└── playwright.config.ts
```

---

## CI Pipeline

```
typecheck → unit-ui → smoke → e2e-p1-dry
```

- **typecheck** — `tsc --noEmit` must pass before any tests run
- **unit-ui** — all 44 specs (auth + marketplace + migration + api)
- **smoke** — migration integration smoke (fast connector check)
- **e2e-p1-dry** — dry-run of Phase 1 e2e migrations

Full pipeline config: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

---

## Full Documentation

- [automation/README.md](automation/README.md) — detailed run commands, suite breakdown, environment variables, troubleshooting
- [automation/TEST_COVERAGE.md](automation/TEST_COVERAGE.md) — full test coverage table with descriptions
