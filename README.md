<div align="center">

<img src="web/public/guardian.svg" alt="Guardian logo" width="84" />

# Guardian

**Stop fraudulent payments before they settle, and recover the ones that slip through.**

Guardian scores every payment against the customer's own behaviour, holds risky payments until a trusted family member approves them, and gives administrators a five-minute window to reverse a mistaken approval.

![Node](https://img.shields.io/badge/Node.js-22.5%2B-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-R3F-000000?logo=threedotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite&logoColor=white)
![Status](https://img.shields.io/badge/status-demo%20%2F%20prototype-7a5af8)

<br />

<img src="docs/screens/01-overview.png" alt="Guardian overview dashboard" width="100%" />

</div>

---

## Contents

- [Why Guardian](#why-guardian)
- [Highlights](#highlights)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [Demo scenarios](#demo-scenarios)
- [How it works](#how-it-works)
- [The 15 workspaces](#the-15-workspaces)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Configuration](#configuration)
- [API overview](#api-overview)
- [Security model](#security-model)
- [What is real and what is simulated](#what-is-real-and-what-is-simulated)
- [Roadmap](#roadmap)

---

## Why Guardian

Most payment fraud against individuals is authorised by the victim: a convincing call or message, a new payee, an unusual amount, a payment from somewhere the person has never been. By the time anyone notices, the money has gone.

Guardian adds two safety nets:

1. **Before settlement:** suspicious payments are held until a trusted family member approves or holds them.
2. **After settlement:** if a high-risk payment is approved by mistake, a recovery request opens automatically with a five-minute deadline for an administrator to reverse it.

Every decision is explained, recorded and visible to the security team.

## Highlights

| | |
|---|---|
| 🛡️ **Explainable risk scoring** | Six signals (location, recipient novelty, amount deviation, behaviour, velocity and a statistical anomaly model), each with evidence and its share of the score. |
| 👨‍👩‍👧 **Family approval** | High-risk payments wait in `PENDING_FAMILY_APPROVAL`. Only the designated family member can approve or hold them. |
| ⏱️ **Five-minute recovery** | Settled high-risk payments open a recovery window with a server-side deadline and a live countdown. |
| 🌍 **Geospatial intelligence** | A full-page map and a 3D globe showing live GPS, historical and demo locations, familiar places, travel arcs and impossible-travel detection. |
| 🔎 **Investigation workspace** | A case queue, fraud indicators, related transactions, analyst notes and release / block / escalate decisions. |
| 📊 **Analytics and reports** | Risk trends, signal frequency and outcome breakdowns, with six exportable reports (CSV and JSON). |
| 📜 **Audit trail** | Every ingestion, analysis, decision, approval, payment and recovery is recorded with before and after states. |
| ⚡ **Real-time** | Server-sent events push changes to every open screen instantly. |
| ✨ **Premium interface** | A 3D shield scene, cursor-lit glass cards, smooth page transitions and success animations, with reduced-motion support. |

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screens/03-transaction-intelligence.png" alt="Transaction Intelligence" /><br /><sub><b>Transaction Intelligence:</b> why a payment was flagged</sub></td>
    <td width="50%"><img src="docs/screens/05-geospatial-intelligence.png" alt="Geospatial Intelligence" /><br /><sub><b>Geospatial Intelligence:</b> distance from familiar places</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screens/06-family-approval-centre.png" alt="Family Approval Centre" /><br /><sub><b>Family Approval Centre:</b> approve or keep on hold</sub></td>
    <td><img src="docs/screens/07-recovery-operations.png" alt="Recovery Operations" /><br /><sub><b>Recovery Operations:</b> five-minute recovery window</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screens/04-fraud-investigation.png" alt="Fraud Investigation" /><br /><sub><b>Fraud Investigation:</b> analyst case workspace</sub></td>
    <td><img src="docs/screens/09-risk-analytics.png" alt="Risk Analytics" /><br /><sub><b>Risk Analytics:</b> trends and outcomes</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screens/02-live-transactions.png" alt="Live Transactions" /><br /><sub><b>Live Transactions:</b> filter, sort and inspect</sub></td>
    <td><img src="docs/screens/16-demo-scenarios.png" alt="Demo Scenarios" /><br /><sub><b>Demo Scenarios:</b> guided end-to-end flows</sub></td>
  </tr>
</table>

<details>
<summary><b>More screens</b></summary>
<br />

| Customer Profiles | Scam Pattern Timeline | Notifications |
|---|---|---|
| <img src="docs/screens/08-customer-profiles.png" alt="Customer Profiles" /> | <img src="docs/screens/10-scam-pattern-timeline.png" alt="Scam Pattern Timeline" /> | <img src="docs/screens/11-notifications.png" alt="Notifications" /> |
| **Audit Trail** | **System Health** | **Reports** |
| <img src="docs/screens/12-audit-trail.png" alt="Audit Trail" /> | <img src="docs/screens/13-system-health.png" alt="System Health" /> | <img src="docs/screens/14-reports.png" alt="Reports" /> |
| **Settings** | **Sign in** | **All pages** |
| <img src="docs/screens/15-settings.png" alt="Settings" /> | <img src="docs/screens/00-sign-in.png" alt="Sign in" /> | <img src="docs/guardian-screen-board.png" alt="All pages" /> |

</details>

## Quick start

**Requirements:** Node.js **22.5 or newer**. The backend uses the built-in `node:sqlite` module, so no database server is needed.

```bash
git clone <this-repository-url>
cd guardian
npm run setup     # install server and web dependencies
npm run build     # build the web app
npm start         # serve the API and the app on http://localhost:4000
```

Open **http://localhost:4000** and pick a demo account on the sign-in page. The database is created and seeded with 30 days of sample activity on first start.

### Development mode (hot reload)

```bash
# terminal 1: API on :4000 (restarts on change)
cd server && npm run dev

# terminal 2: web app on :5173 (proxies /api to :4000)
cd web && npm run dev
```

### Useful scripts

| Command | What it does |
|---|---|
| `npm run setup` | Installs dependencies for `server/` and `web/` |
| `npm run build` | Builds the web app into `web/dist` |
| `npm start` | Starts the API and serves the built app |
| `npm run seed` | Resets the database to fresh sample data |
| `npm --prefix web run build:inpage` | Builds a single self-contained HTML file that runs the backend inside the browser |

### Demo accounts

All demo accounts use the password **`guardian123`**. Every person and payment in the sample data is fictional.

| Account | Role | Can do |
|---|---|---|
| `aarav@guardian.example` | Security Analyst | Monitor, investigate, add notes, release or block held payments |
| `neha@guardian.example` | Administrator | Everything an analyst can, plus recovery decisions, settings and webhooks |
| `priya@guardian.example` | Trusted family | Approve or hold Ramesh Sharma's protected payments (Scenario 1) |
| `arjun@guardian.example` | Trusted family | Approve or hold Sunita Rao's protected payments (Scenario 2) |

Use **Switch demo account** in the profile menu to change roles. It performs a real sign-in, so the API still enforces every permission. Set `GUARDIAN_DEMO_MODE=false` to hide demo accounts.

## Demo scenarios

Open **Demo Scenarios** from the sidebar or the Overview page. Both scenarios run against the real backend and database.

### Scenario 1: family-assisted fraud prevention

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer
    participant G as Guardian
    participant S as Security team
    participant F as Family member
    C->>G: Two routine payments, then ₹9,999 to a new merchant 500 km away
    G->>G: Score signals (location, recipient, amount, velocity…)
    G->>S: High-risk alert
    G->>F: Approval request
    Note over G: Payment held in PENDING_FAMILY_APPROVAL
    F->>G: Keep payment on hold (or approve)
    G->>G: Validate the decision, update state, write the audit trail
```

### Scenario 2: recovery after a mistaken approval

```mermaid
sequenceDiagram
    autonumber
    participant F as Family member
    participant G as Guardian
    participant P as Payment simulator
    participant A as Administrator
    G->>F: ₹25,000 to a brand-new wallet, 1,100+ km away (score ≈ 95)
    F->>G: Approve (by mistake)
    G->>P: Settle payment
    P-->>G: Settled
    G->>A: Recovery request with a five-minute deadline
    A->>G: Initiate payment recovery
    G->>P: Reverse payment
    P-->>G: Reversal confirmed
    Note over G,A: Shown as Recovered only after confirmation
```

If no decision is made before the deadline, the window expires and the recovery actions are disabled.

## How it works

```mermaid
flowchart LR
    I[Payment ingested] --> A[Fraud engine<br/>6 explainable signals]
    A --> D{Risk decision}
    D -- low --> OK[Settled]
    D -- medium --> R[Analyst review]
    D -- high --> FA[Family approval]
    R -- release --> OK
    R -- block --> B[Blocked]
    FA -- hold --> H[On hold]
    FA -- approve --> OK
    OK -- "score ≥ auto-recovery threshold" --> RW[Recovery window · 5 min]
    RW -- initiate --> RV[Recovered]
    RW -- decline --> RD[Declined]
    RW -- deadline passes --> EX[Expired]
```

### Risk signals

| Signal | Default weight | What it measures |
|---|---:|---|
| Unusual location | 30 | Distance from home and frequently used cities, plus impossible travel since the previous payment |
| New recipient | 22 | Whether the customer has paid this recipient before, and how new the recipient is on the platform |
| Amount anomaly | 22 | Log-scale z-score against the customer's trusted payment history |
| Transaction velocity | 10 | Payments in the previous 15 and 60 minutes, and repeats to the same payee |
| Behavioural anomaly | 8 | Unusual time of day and repeat payments to a new recipient |
| Anomaly model | 8 | Multivariate z-distance across amount, distance and hour |

The default thresholds are **medium ≥ 40**, **high ≥ 70** and **auto-recovery ≥ 85**. Thresholds, weights and time windows can be changed under **Settings** (administrators only).

### Transaction states

`RECEIVED → ANALYSING → COMPLETED | UNDER_REVIEW | PENDING_FAMILY_APPROVAL | ON_HOLD`, then `APPROVED → PROCESSING → COMPLETED → RECOVERY_PENDING → RECOVERING → RECOVERED`. Terminal states also include `BLOCKED`, `RECOVERY_DECLINED`, `RECOVERY_EXPIRED` and `RECOVERY_FAILED`. Any transition outside this graph is rejected with `409 INVALID_TRANSITION`.

## The 15 workspaces

| # | Page | Purpose |
|---:|---|---|
| 1 | **Overview** | Live protection status, KPIs, activity, risk distribution, alerts and demo launchers |
| 2 | **Live Transactions** | Searchable, filterable, sortable stream with a detail drawer and CSV export |
| 3 | **Transaction Intelligence** | Risk breakdown, signal evidence, location, history and audit for one payment |
| 4 | **Fraud Investigation** | Case queue, indicators, notes, related payments and decisions |
| 5 | **Geospatial Intelligence** | Full map and 3D globe, live GPS, location analysis and history |
| 6 | **Family Approval Centre** | Pending requests with a deadline, plus approve or hold |
| 7 | **Recovery Operations** | Recovery queue, circular countdown, plus initiate or decline |
| 8 | **Customer Profiles** | Behavioural baseline, familiar recipients and places, family and history |
| 9 | **Risk Analytics** | Trends, signal frequency, anomalies and outcomes |
| 10 | **Scam Pattern Timeline** | Chronology of suspicious events with evidence |
| 11 | **Notifications** | Security, family, recovery and system channels |
| 12 | **Audit Trail** | Searchable history of every operation |
| 13 | **System Health** | Live checks of the API, database, engine, real-time stream and webhooks |
| 14 | **Reports** | Six reports with a date range, preview and export |
| 15 | **Settings** | Profile, roles, thresholds, policies, notifications, webhooks and location |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, React Router, Framer Motion |
| 3D and maps | Three.js with React Three Fiber and Drei, Leaflet with a built-in vector basemap |
| Charts | Recharts and custom SVG |
| Backend | Node.js 22, Express 4, server-sent events |
| Database | SQLite through `node:sqlite` (WAL mode, `BEGIN IMMEDIATE` transactions) |
| Auth | scrypt password hashing, HMAC-signed tokens, role-based access |
| Browser-only build | sql.js and an in-page router so the same backend code runs in the browser |

## Project structure

```
guardian/
├── server/
│   └── src/
│       ├── server.js            # Express app, routes, deadline sweeper
│       ├── db.js · schema.js    # SQLite connection and schema
│       ├── seed.js              # 30-day sample dataset sent through the real pipeline
│       ├── lib/                 # auth, real-time events, geo helpers
│       ├── services/
│       │   ├── fraudEngine.js   # explainable risk scoring
│       │   ├── location.js      # familiar places, impossible travel
│       │   ├── stateMachine.js  # guarded state transitions
│       │   ├── operations.js    # ingestion, decisions, approvals, settlement, recovery
│       │   ├── core.js          # settings, audit, notifications, webhooks
│       │   └── demo.js          # the two flagship scenarios
│       └── routes/              # REST API grouped by domain
├── web/
│   └── src/
│       ├── pages/               # the 15 workspaces + sign-in + demo
│       ├── components/          # layout, 3D shield, globe, map, charts, UI kit
│       ├── lib/                 # API client, auth, live updates, formatting
│       ├── styles/              # design tokens and premium layer
│       └── inpage/              # browser-only backend adapters
└── docs/screens/                # screenshots of every page
```

## Configuration

Copy `server/.env.example` and `web/.env.example` and adjust as needed.

| Variable | Where | Purpose |
|---|---|---|
| `GUARDIAN_JWT_SECRET` | server | Token signing secret. **Required in production.** If unset, a temporary secret is generated on each start. |
| `GUARDIAN_DB` | server | SQLite file path (default `server/data/guardian.db`) |
| `GUARDIAN_DEMO_MODE` | server | Set to `false` to hide demo accounts and one-click sign-in |
| `GUARDIAN_DEMO_PASSWORD` | server | Password for the seeded demo accounts |
| `GUARDIAN_SMS_PROVIDER_URL` | server | Marks an external SMS or email provider as configured |
| `GUARDIAN_CORS_ORIGIN` | server | Comma-separated list of allowed origins |
| `PORT` | server | API port (default `4000`) |
| `VITE_API_URL` | web | API base URL (default `/api`) |
| `VITE_MAP_TILE_URL` | web | Raster map tiles. Leave empty to use only the built-in vector basemap. |

## API overview

All endpoints are under `/api` and need a bearer token, except `/api/auth/*`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `GET /auth/me` |
| Transactions | `GET /transactions` · `GET /transactions/:id` · `POST /transactions` |
| Family approvals | `GET /approvals` · `POST /approvals/:id/decision` *(family only)* |
| Recovery | `GET /recoveries` · `POST /recoveries/:id/initiate` · `POST /recoveries/:id/decline` *(admin only)* |
| Investigations | `GET /investigations` · `GET /investigations/:id` · `POST /investigations/:id/decision` · `POST /investigations/:id/notes` |
| Insights | `GET /overview` · `GET /analytics` · `GET /customers/:id` · `GET /geo` · `GET /timeline` |
| Platform | `GET /notifications` · `GET /audit` · `GET /health` · `GET /reports/:type` · `GET/PUT /settings/:group` · `/webhooks` |
| Real-time | `GET /stream` (server-sent events) |
| Demo | `POST /demo/:scenario/start` · `POST /demo/runs/:id/next` · `GET /demo/runs/:id` |

## Security model

- **Backend authorisation** of every sensitive action. Only the designated family member can decide an approval, and only administrators can decide a recovery or change settings.
- **Guarded state changes.** Every status change is a conditional update on status and version, so double clicks and out-of-order requests return `409` instead of applying twice.
- **Idempotency keys.** Repeating a decision with the same `Idempotency-Key` returns the stored response.
- **Server-side deadlines.** Approval and recovery windows are stored in the database and enforced by the API (`410 EXPIRED`). Countdowns in the browser are synchronised to the server clock.
- **Confirmed outcomes only.** A payment is shown as recovered only after the payment simulator confirms the reversal.
- **Signed webhooks.** Outbound webhooks are signed with HMAC-SHA256 in the `x-guardian-signature` header.

## What is real and what is simulated

| Real | Simulated or not included |
|---|---|
| Risk scoring, decisions and state transitions | Payment settlement and reversal (built-in **payment simulator**) |
| Database persistence, audit trail, notifications | SMS and email delivery (in-app notifications and webhooks only) |
| Role-based authorisation and deadlines | Machine-learning model (scoring is rules plus a statistical anomaly model) |
| Browser geolocation when permission is granted | Customer and payment data (fictional seed data) |

## Roadmap

- [ ] Integration with a real payment provider or UPI
- [ ] SMS and email delivery for family approval requests
- [ ] Per-user read status for notifications
- [ ] User management for analysts and administrators
- [ ] PostgreSQL option for multi-instance deployments
- [ ] Automated test suite and CI

---

<div align="center">
<sub>Guardian is a demonstration project. Do not use it to move real money without a full security review.</sub>
</div>
