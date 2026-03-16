# QA Analytics Platform

A plug-in analytics layer that sits alongside the existing Playwright automation framework.
Zero changes to existing code — reads the same `test-results/results.json` the current dashboard uses.

---

## Architecture

```
qa-analytics/
├── backend/          API server (Express + SQLite) — port 4000
├── ai-engine/        Failure clustering, flaky detection, run comparison
├── dashboard/        Single-page real-time analytics UI — served by backend
├── integrations/     Playwright reporter adapter + results-adapter
├── ci-gates/         Release gate evaluator + CI pipeline examples
└── slack-bot/        Slack alert sender + message templates
```

---

## Quick Start

```bash
cd qa-analytics/backend
npm install
npm start                    # starts API + dashboard on http://localhost:4000

# Ingest existing results from the automation project:
cd qa-analytics/integrations
node results-adapter.js      # reads ../../automation/test-results/results.json → pushes to API
```

---

## How It Connects (without touching existing code)

```
automation/test-results/results.json
            │
            ▼
integrations/results-adapter.js   ← adapter reads existing JSON
            │
            ▼
backend/server.js  (POST /api/runs/ingest)
            │
            ├── SQLite DB (qa-analytics.db)
            ├── ai-engine/clustering.js
            ├── ai-engine/flaky-detector.js
            ├── websocket/live.js  → browser
            └── slack-bot/alerts.js → Slack
```

---

## Environment Variables

Create `qa-analytics/backend/.env`:

```
PORT=4000
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
DASHBOARD_URL=http://localhost:4000
GATE_PASS_RATE_MIN=0.95
GATE_MAX_NEW_FAILURES=0
GATE_MAX_FLAKY_RATE=0.03
```

---

## Modules

| Module | Purpose |
|--------|---------|
| `backend/` | REST API + static dashboard server |
| `ai-engine/` | Failure clustering, flaky scoring, run diff |
| `dashboard/` | Real-time single-page analytics UI |
| `integrations/` | Playwright reporter + results.json adapter |
| `ci-gates/` | Release gate logic + GitHub Actions / GitLab CI |
| `slack-bot/` | Slack webhook alerts |
