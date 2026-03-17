# Test Coverage Reference

> Last updated: 2026-03-17
> Active tests: 190+ across 27 spec files (main config) + 45 smoke + 44 e2e-full
> Runner: Playwright · Browser: Chromium

---

## Test Layers

| Layer | Script | Spec | Tests | Creds | When to run |
|-------|--------|------|-------|-------|-------------|
| **Unit / UI** | `npm test` | all specs under `tests/` | 190+ | None | Every PR |
| **Smoke** | `npm run test:smoke` | `e2e-smoke/` (3 spec files) | 45 | None | Every PR / deploy |
| **Validate** | `npm run test:validate` | `migration/validate.spec.ts` | 9 | `.env` login | Pre-release / env check |
| **E2E Full — dry** | `npm run test:e2e-full:p1:dry` | `e2e-full/e2e_all_migrations.spec.ts` | 3 (phase 1) | LSR creds | Merge gate |
| **E2E Full — live** | `npm run test:e2e-full` | `e2e-full/e2e_all_migrations.spec.ts` | 44 | Per phase | Pre-release / nightly |

---

## Excluded Files

| File | Reason | How to run |
|------|--------|------------|
| `UI/auth/shopify.setup.spec.ts` | Requires Shopify OAuth credentials | N/A |
| `UI/shopify/**` | Shopify SSO tests — requires external creds | `npm run test:shopify` |
| `UI/migration/e2e_migration.spec.ts` | Ad-hoc single migration (Shopify→LSR, Customers, linkprod01) — runs a real migration | `npm run test:e2e-single` |
| `UI/migration/e2e_migration_full.spec.ts` | Ad-hoc single migration (Shopify→LSR, 3 types, linkprod03) — 10 min, needs clean account | `npm run test:e2e-single:full` |
| `UI/migration/e2e-full/**` | Deep E2E — full wizard to Start Migration — runs via its own config | `npm run test:e2e-full` |
| `UI/migration/e2e-smoke/probe.spec.ts` | Registry refresh tool — hits live API to rebuild `migrations-registry.ts` | `npm run probe:registry` |

---

## E2E Smoke (`e2e-smoke/`)

Breadth layer — verifies every migration card opens, wizard loads, and Step 2 renders correctly. No credentials needed, no data written.

**45 tests** — 44 migrations (28 file-based, 16 API-based) + 1 integration template.

| Step | What is checked |
|------|----------------|
| 1 | Navigate to `/listing/{id}` — title and type badge visible |
| 2 | Click Get Started — wizard Step 1 heading visible, Continue disabled |
| 3 | Select first available data type — Continue enables |
| 4 | Click Continue → Step 2 renders correct heading (`Upload your files` or `Connect systems`) |
| — | Stops here — no upload, no credentials, no migration started |

```bash
npm run test:smoke                          # all 44
npx playwright test ... --grep "[file]"     # file-based only
npx playwright test ... --grep "[api]"      # API-based only
npx playwright test ... --grep "Adobe Commerce"  # single migration
```

---

## E2E Full (`e2e-full/`)

Depth layer — full wizard flow for all 44 migrations across 4 phases. Uses `DRY_RUN=1` to stop before Start Migration (CI-safe), or runs live for release validation.

### Phases

| Phase | Target | Key env vars | Migrations | Tested |
|-------|--------|-------------|------------|--------|
| 1 | Lightspeed Retail (LSR) | `LSR_DOMAIN` `LSR_EMAIL` `LSR_PASSWORD` | 3 file-based | ✅ Passing |
| 2 | Shopify | `SHOPIFY_SHOP` `SHOPIFY_USERNAME` `SHOPIFY_PASSWORD` | 9 file-based | Implemented |
| 3 | Clover / QBO / Xero / HubSpot / Salesforce | per-target `EMAIL` + `PASSWORD` | 14 file-based | Implemented |
| 4 | API-based sources (BigCommerce, Square, Stripe, etc.) | per-migration source creds | 13 active + 3 blocked | Implemented |

### What each test does

| Step | File-based | API-based |
|------|-----------|----------|
| 1 | Select data types | Select data types |
| 2 | Upload CSV files → Confirm → wait for processing | Connect source (credentials or OAuth popup) |
| 3 | Connect destination via OAuth | Connect destination (if on same screen) |
| 4+ | Settings sub-steps (if present) | Settings sub-steps (if present) |
| Review | Verify review screen visible | Verify review screen visible |
| Launch | Click Start Migration (skipped with `DRY_RUN=1`) | Click Start Migration (skipped with `DRY_RUN=1`) |

```bash
npm run test:e2e-full:p1:dry   # Phase 1, CI-safe (stops at Review)
npm run test:e2e-full:p1       # Phase 1, live (starts real migration)
npm run test:e2e-full:dry      # All phases, DRY_RUN
npm run test:e2e-full          # All phases, live
```

---

## Validate (`validate.spec.ts`)

App discovery walkthrough — 9 serial steps. Useful as a pre-flight check against a new environment or after a deploy.

1. Landing page loads
2. Navigate to login via Sign In
3. UI login with `.env` credentials
4. API login attempt
5. Explore marketplace (cards, tabs, search)
6. Explore My Projects
7. Explore File Assist
8. Explore card detail page
9. Discover real API endpoints via network interception

```bash
npm run test:validate
```

---

## API Specs

### `api/auth.spec.ts`
- Login returns a valid session token
- Invalid credentials rejected with 422

---

### `api/marketplace.spec.ts`
- Fetch listings with pagination
- Fetch a listing by ID
- Fetch all systems
- Fetch authenticated user info

---

### `api/listing.spec.ts`
- Paginated listing list
- Filter by `type=migration` and `type=integration`
- Required fields on each list item
- Next page returns different results
- Listing detail by ID
- All required fields on detail
- Valid pricing shape on detail
- Compatibility object when present
- 404 for non-existent ID
- 401 when fetching without auth

---

### `api/list_templates.spec.ts`
- All templates fetched in a single request
- Only `migration` and `integration` types exist
- At least one File Based and one API migration present
- All required fields on every template
- Duplicate template names reported
- All templates marked `active=true`
- Inventory snapshot — builds catalog, diffs against previous run, saves JSON

---

## UI — Auth Specs

### `UI/auth/login.spec.ts`
- Login form fields (username, password, Confirm button) visible
- Successful login redirects to marketplace
- Invalid credentials shows error
- Forgot password link present
- Sign Up link present

---

### `UI/auth/signup.spec.ts`
- All sign-up form fields and Verify email button visible
- Navigate to sign-up via "Sign Up here" link on login
- Login back-link on sign-up page
- Verify email disabled / error when fields empty
- Mismatched passwords rejected, stays on page

---

### `UI/auth/forgotpassword.spec.ts`
- Email input and Submit button visible
- "Forgot password?" link on login page has correct `href`
- Empty submit stays on forgot-password or shows error
- Valid email submitted without JS error

---

### `UI/auth/sign-out.spec.ts`
- User menu button shows logged-in email
- User menu opens and shows Sign out option
- Sign out redirects away from `/listings`
- `/listings` blocked after sign out

---

### `UI/auth/onboarding.spec.ts`
- Page loads without errors
- At least one heading visible
- At least one interactive element (button or link)
- Navigation to Marketplace from onboarding
- Unauthenticated user redirected away from onboarding

---

## UI — Marketplace Specs

### `UI/marketplace/marketplace.spec.ts`
- "Marketplace" heading visible
- Template count text visible
- Cards displayed (h3 elements)
- Search input works
- All/Migrations/Integrations tab filters visible
- Previous/Next pagination buttons visible
- Card click navigates to detail page
- Sidebar nav links (My Projects, File Assist) visible
- Active nav item highlighted
- File Based or API badge on detail
- Empty state when search returns no results

---

### `UI/marketplace/filters.spec.ts`
- All three tab filters visible
- "All" tab shows cards
- "Migrations" tab filters cards
- "Integrations" tab filters cards
- "All" tab re-selected restores full list
- Tab selection reflected in URL/state
- Search within active tab shows results
- Tab + search combined shows fewer results
- Empty state when search has no match within tab
- Tab selection preserved after navigating to card and back

---

### `UI/marketplace/pagination.spec.ts`
- Default 10 cards on page 1
- Previous button disabled on page 1
- Next button enabled on page 1
- Navigate to page 2 — different cards shown
- Previous button enabled on page 2
- Navigate back to page 1 via Previous
- Page indicator shows "Page 2" after Next
- Items-per-page combobox default value "10"
- Combobox shows 10/20/50/100 options
- Setting items-per-page to 20 shows 20 cards

---

### `UI/marketplace/search-behavior.spec.ts`
- Clear search restores full card list
- Consecutive searches update results independently
- Special characters don't crash the page
- Search is case-insensitive
- Substring match returns relevant cards
- Search accuracy — results contain the search term
- Single character search doesn't crash the page

---

### `UI/marketplace/card-detail.spec.ts`
- Detail page sections visible (What It Does, How It Works, Security & Trust, Important Notes)
- Section headings contain non-empty text
- Watch Demo Video button visible
- Get Started / Set up Integration CTA visible and enabled
- Migration type badge shows File Based or API
- Back button returns to marketplace
- Pricing information visible on detail page
- Detail page title matches card title from marketplace

---

### `UI/marketplace/card-badges.spec.ts`
- First card detail shows File Based or API badge
- Second card also shows a valid badge
- Category tags (POS, Migration, Integration etc.) visible on detail
- Migrations tab card has migration type badge
- Badge text is non-empty on first 3 cards

---

### `UI/marketplace/navigation-flows.spec.ts`
- Browser back from detail returns to marketplace
- Browser forward after back re-opens detail
- Deep link to `/listings` loads marketplace
- Sidebar My Projects navigates correctly
- Sidebar File Assist stays on `/listings` and remains stable
- Sidebar Marketplace link active and returns to `/listings`
- Watch Demo Video doesn't navigate away from detail
- Unauthenticated access to `/listings` redirects to login

---

### `UI/marketplace/landing-page.spec.ts`
- Hero heading visible
- Sign In button visible in nav
- Get Started button visible in nav
- Start Free Migration CTA visible
- See How It Works CTA visible
- Nav contains Integrations, Features, Testimonials links
- Testimonials section heading visible
- Page title set (non-empty)

---

### `UI/marketplace/url-persistence.spec.ts`
- My Projects tab adds `?tab=projects` to URL
- Detail page URL contains listing ID
- Detail page URL is shareable — direct nav loads same card
- `/listings` reload keeps marketplace loaded
- Detail page reload keeps same card loaded
- Base `/listings` URL has no unexpected query params
- Navigating via address bar to `/listings` restores marketplace

---

### `UI/marketplace/file-assist.spec.ts`
- File Assist nav button visible in sidebar
- Clicking File Assist loads section with a heading
- URL stays at `/listings` after navigating to File Assist
- At least one interactive element (button / input) visible
- Sidebar nav buttons remain visible from File Assist
- Marketplace nav returns to marketplace from File Assist
- No JS errors thrown on File Assist load

---

### `UI/marketplace/my-projects.spec.ts`
- My Projects heading visible after navigating
- URL includes `?tab=projects`
- Tab shows projects or empty state message
- Marketplace nav link returns to `/listings`
- Sidebar My Projects button visible on My Projects tab
- Deep link to `/listings?tab=projects` loads My Projects directly

---

### `UI/marketplace/user-profile.spec.ts`
- User menu button visible with logged-in email
- Button email matches configured username
- Opening menu reveals options (logs menu items)
- Menu contains at least one item (Sign out confirmed)
- Profile/settings navigation exists if page is available (probe — skips gracefully if not implemented)
- User menu closes cleanly and page remains functional

---

### `UI/marketplace/responsive.spec.ts`
- Mobile (375px) — marketplace heading visible
- Mobile (375px) — migration cards visible
- Mobile (375px) — sidebar or hamburger nav present
- Mobile (375px) — no horizontal overflow
- Mobile (375px) — card detail renders with title + CTA
- Mobile (375px) — login page renders usably
- Tablet (768px) — marketplace heading visible
- Tablet (768px) — migration cards visible
- Tablet (768px) — no horizontal overflow

---

### `UI/marketplace/sign-out.spec.ts`
- User menu button visible and shows email
- Clicking user menu opens Sign out option
- User menu closes on Escape key
- Sign out redirects away from `/listings`
- After sign out, `/listings` redirects to login

> Note: `UI/auth/sign-out.spec.ts` also covers sign-out from the auth fixture perspective (4 tests). This file adds the Escape-key dismiss test and uses the POM `signOut()` helper.

---

### `UI/auth/auth-pages.spec.ts`
- Login page shows username/password inputs
- Login page shows submit button
- Login page has Forgot password link
- Login page has Sign Up link
- Forgot password page has an email input
- Sign-up page loads without crash
- Empty login submission shows validation feedback

> Note: Spec lives in `UI/auth/` (not `UI/marketplace/`). Uses plain `@playwright/test` — no auth fixture.

---

### `UI/marketplace/wizard-step1.spec.ts`
- Wizard loads with "Choose your data" heading
- URL contains `/migration-flow` after Get Started
- Continue button disabled when no data type selected
- Selecting a data type enables Continue
- Step indicator labels visible
- Clicking Continue advances to step 2
- Back button returns to detail page or marketplace

---

### `UI/marketplace/explore.spec.ts`
- EXPLORE 1 — Get Started wizard launches
- EXPLORE 2 — File Assist page loads
- EXPLORE 3 — Marketplace pagination works
- EXPLORE 4 — Items-per-page control works
- EXPLORE 5 — User profile menu opens
- EXPLORE 6 — Search & filter returns results
- EXPLORE 7 — Forgot password page accessible
- EXPLORE 8 — Sign Up page accessible
- EXPLORE 9 — Landing page structure visible
- EXPLORE 10 — My Projects detail loads

---

### `UI/marketplace/list_templates.spec.ts`
- Full UI crawl of all 47 cards (visits every detail page)
- Captures File Based / API badge for each card
- Saves inventory snapshot to `test-results/inventory.json`

---

## UI — Migration Specs

### `UI/migration/error-states.spec.ts`
- Unauthenticated direct access to `/migration-flow` redirects to login
- Unauthenticated direct access to `/listing/{id}` redirects to login
- Cleared session accessing `/listings` redirects to login
- Cleared session accessing `/migration-flow` redirects to login

> Uses plain `@playwright/test` — no auth fixture. Tests the auth guard from a cold/expired session.

---

### `UI/migration/e2e-smoke/integration-smoke.spec.ts`
- Square To Quickbooks integration — detail page loads with "Set up Integration" CTA
- Clicking CTA launches integration flow (URL navigates away from detail)
- Integration wizard shows at least one heading or button

---

### `UI/migration/migration.spec.ts`
- My Projects heading visible
- Active project count displays a number
- Search input works
- Sources, Targets, Status filter buttons visible
- My Projects accessible via sidebar nav

---

### `UI/migration/wizard.spec.ts`
- File Based badge on Adobe Commerce to Shopify
- API badge on BigCommerce to Shopify
- Watch Demo Video button on card detail
- Step 1 "Choose your data" heading
- Step indicator shows 4 steps
- Continue disabled when nothing selected
- Continue enabled after selecting Customers
- Multi-select of data types works
- Back button from step 1
- Step 2 (API) — "Connect systems" heading
- Step 2 (API) — Connect Account button visible
- Step 2 (API) — credential inputs visible
- Step 2 (API) — Continue disabled until connected
- Step 2 (File) — "Upload your files" heading
- Step 2 (File) — file input and Upload button visible
- Step 2 (File) — Continue disabled until file uploaded

---

### `UI/migration/wizard-step3.spec.ts`
- Step 3 heading visible after advancing from Step 2 (file-based)
- Destination connect section rendered
- Connect Account button present
- Continue disabled until destination connected

---

### `UI/migration/api-connector-errors.spec.ts`
- Step 2 API connector error states visible on invalid credentials
- Error message displayed without page crash
- Retry / re-enter flow accessible after error

---

### `UI/migration/file-upload-validation.spec.ts`
- File upload rejects invalid file types
- Upload area visible and accepts valid CSV
- Confirm button disabled until valid file processed
- Error feedback shown for oversized or malformed files

---

## Coverage Gaps / TODO

> Update this section when new features are added or gaps are identified.

- [x] Wizard Step 2 — file upload and API connect covered by `wizard.spec.ts` + `e2e-smoke`
- [x] Wizard Steps 3–5 — covered by `e2e-full` Phase 1 (connect → settings → review → launch)
- [ ] E2E Full Phase 2–4 — implemented, not yet live-tested (needs Shopify / QBO / Xero etc. creds)
- [x] Integration template wizard flow — smoke covered by `e2e-smoke/integration-smoke.spec.ts`
- [x] Error states (auth guard, cleared session, unauthenticated routes) — covered by `migration/error-states.spec.ts`
- [x] CI pipeline wired — `.github/workflows/ci.yml` (typecheck → unit-ui → smoke → e2e-p1-dry)
- [x] TypeScript migration complete — all spec/helper/util/fixture/POM files converted to `.ts`; `tsc --noEmit` passes clean
- [x] File Assist page functionality — dedicated spec `UI/marketplace/file-assist.spec.ts` (7 tests)
- [x] User profile / account menu — `UI/marketplace/user-profile.spec.ts` (6 tests — probe-style, passes with or without a dedicated settings page)
- [x] Pricing display on detail page — asserted in `card-detail.spec.ts`
- [x] Mobile / responsive layout — `UI/marketplace/responsive.spec.ts` (9 tests — 375px + 768px)
