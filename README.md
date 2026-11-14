# Guardian: AI Payment Safety

Guardian is a multi-page fraud prevention and payment recovery platform. It scores every payment against the customer's own history and holds risky payments until a trusted family member approves them. When a risky payment does settle, the administrator gets a five-minute window to recover it.

```
guardian/
├── server/   Node 22 + Express + SQLite (node:sqlite). The database is the source of truth.
├── web/      React 18 + Vite, Framer Motion, React Three Fiber, Leaflet, Recharts
└── docs/screens/  One screen design for each of the 15 pages, plus sign-in and the demo launcher (1440×900 @2x)
```

## Run it

Requires **Node 22.5 or later**, because the backend uses the built-in `node:sqlite` module.

```bash
npm run setup        # installs server + web dependencies
npm run build        # builds the web app into web/dist
npm start            # API + built app on http://localhost:4000
```

To develop with hot reload, open two terminals:

```bash
cd server && GUARDIAN_JWT_SECRET=dev npm run dev     # API on :4000
cd web && npm run dev                                # UI on :5173 (proxies /api)
```

On first start the database is seeded automatically.

### Self-contained version (no server)

`npm --prefix web run build:inpage` builds `web/dist-inpage/index.inpage.html`, a single file that runs the same API routes and services inside the browser on SQLite compiled to JavaScript (sql.js). Its data lives in memory and resets when the page reloads. Live GPS, CSV downloads and map tiles depend on what the hosting page allows. To reseed, run `cd server && npm run seed -- --reset`.

### Demo accounts (password `guardian123`)

| Account | Role | Can do |
|---|---|---|
| aarav@guardian.example (Aarav Sharma) | Security Analyst | Monitor, investigate, add notes, release or block held payments, run demos |
| neha@guardian.example (Neha Kapoor) | Administrator | Everything an analyst can, plus recovery decisions, settings and webhooks |
| priya@guardian.example (Priya Sharma) | Trusted family (Ramesh) | Approve or hold Ramesh's protected payments (Scenario 1) |
| arjun@guardian.example (Arjun Rao) | Trusted family (Sunita) | Approve or hold Sunita's protected payments (Scenario 2) |

The profile menu has a **Switch demo account** option. It performs a real sign-in, so the API enforces every permission.

### Environment

| Variable | Where | Purpose |
|---|---|---|
| `GUARDIAN_JWT_SECRET` | server | Token signing secret. **Required in production.** If unset, the server uses an ephemeral secret. |
| `GUARDIAN_DB` | server | SQLite file path (default `server/data/guardian.db`) |
| `GUARDIAN_DEMO_MODE=false` | server | Hides the demo account list and one-click sign-in |
| `GUARDIAN_DEMO_PASSWORD` | server | Seeded password for the demo accounts |
| `GUARDIAN_SMS_PROVIDER_URL` | server | Marks an external SMS/email provider as configured (see below) |
| `GUARDIAN_CORS_ORIGIN` | server | Comma-separated list of allowed origins |
| `PORT` | server | API port (default 4000) |
| `VITE_API_URL` | web | API base (default `/api`) |
| `VITE_MAP_TILE_URL`, `VITE_MAP_ATTRIBUTION` | web | Raster map tiles (default CARTO Light). Leave empty to use only the built-in vector basemap. |

## Architecture

```
server/src
├── db.js                    schema, IMMEDIATE transactions, helpers
├── lib/auth.js              scrypt passwords, HMAC-signed JWT, role guards
├── lib/events.js            server-sent events bus (real-time UI)
├── lib/geo.js               haversine distance, reverse geocoding to city
├── services/fraudEngine.js  6 explainable signals + statistical anomaly model
├── services/location.js     familiar places, distance, impossible travel
├── services/stateMachine.js the only path for status changes (compare-and-set on status+version)
├── services/operations.js   ingestion → analysis → decision → family approval → payment simulator → recovery, deadline sweeper, investigations
├── services/core.js         settings, audit trail, notifications, HMAC-signed outbound webhooks
├── services/demo.js         the two flagship scenarios (call the real pipeline)
├── routes/*.js              REST API, grouped by domain
└── seed.js                  30-day dataset, every transaction ingested through the live pipeline
```

**Transaction states:** `RECEIVED → ANALYSING → COMPLETED | UNDER_REVIEW | PENDING_FAMILY_APPROVAL | ON_HOLD`. From there, `APPROVED → PROCESSING → COMPLETED → RECOVERY_PENDING → RECOVERING → RECOVERED`. The terminal states also include `BLOCKED`, `RECOVERY_DECLINED`, `RECOVERY_EXPIRED` and `RECOVERY_FAILED`. Any transition outside this graph returns `409 INVALID_TRANSITION`.

**Integrity rules:**

- Every sensitive action is authorised on the backend. Only the designated family member's own account can decide an approval. Only administrators can decide a recovery or change settings.
- Decisions use conditional `UPDATE … WHERE status = 'PENDING'`, so a second click returns `409 ALREADY_DECIDED`.
- Clients send `Idempotency-Key` headers, and a replayed request returns the stored response.
- Deadlines are stored in the database. The server rejects late actions (`410 EXPIRED`), and a sweeper running every 2 seconds expires open windows. Countdowns in the browser are synchronised to the server clock.
- Payment settlement and reversal are asynchronous in the payment simulator. The UI shows **Recovered** only after the simulator confirms.

## The 15 workspaces

| # | Route | Page |
|---|---|---|
| 1 | `/overview` | KPIs, 24-hour activity, risk distribution, alerts, suspicious payments, health summary, quick access, demo launchers |
| 2 | `/transactions` | Live table with search, status/risk/date/source filters, sorting, pagination, CSV export and a detail drawer (`/transactions/:id`) |
| 3 | `/intelligence/:id` | Details, risk breakdown, analysis pipeline, signal cards, score composition, location, customer and recipient history, sequence, audit |
| 4 | `/investigations/:id` | Queue, fraud indicators, location evidence, decisions (release, block, escalate to family, confirm, clear), notes, related transactions, audit |
| 5 | `/geo` | Full-height map: live GPS, historical and demo points, familiar places, trails, suspicious moves, location panel, history table |
| 6 | `/approvals/:id` | Pending requests and history, deadline countdown, **APPROVE PAYMENT** / **KEEP PAYMENT ON HOLD** |
| 7 | `/recovery/:id` | Queue, circular countdown on the backend deadline, **INITIATE PAYMENT RECOVERY** / **DECLINE RECOVERY**, approval and admin details, history |
| 8 | `/customers/:id` | Baseline, active hours, familiar recipients and locations, transactions, risk history, family, holds, recoveries |
| 9 | `/analytics` | Volume by risk, score distribution, signal frequency, amount, geography, novelty, velocity, approval/hold/recovery outcomes, cities |
| 10 | `/timeline` | Chronology of suspicious events with tags and an evidence inspector |
| 11 | `/notifications` | Security, family, recovery and system channels; read/unread; details and actions |
| 12 | `/audit` | Searchable, filterable audit log with state changes and JSON details |
| 13 | `/health` | Live checks: API, database, fraud-engine self-test, notification provider, SSE, webhooks, errors, stuck payments |
| 14 | `/reports` | Six reports with a date range, preview, and CSV/JSON export |
| 15 | `/settings` | Profile, password, roles, company, trusted family, thresholds and weights, policies, notifications, webhooks, location, demo |
| + | `/demo` | Scenario launcher and live progress tracker |

## Premium design layer

- **Overview hero:** a 3D shield scene with a glowing halo, a scanning beam, data packets travelling into the shield and a pulsing hexagonal platform. It sits beside a rotating feed of the latest flagged payments and floating status chips.
- **Geospatial page:** a **3D globe** view (switch between Map and 3D globe). It plots stored transaction coordinates, familiar places and the focus transaction, with an animated arc and the distance, and the camera glides to the selected location.
- **Ambient background:** drifting gradient orbs with pointer parallax, a faint grid and film grain.
- **Cards:** a glowing border and inner highlight follow the cursor, 3D tilt on the small cards, and cards slide into place as you scroll.
- **Motion polish:** a progress bar on page changes, a light sweep on buttons, springy icons and hover effects, pulsing status dots, and toasts with a countdown bar.
- **Success moments:** a particle burst when funds are recovered and when a family member records a decision.
- **Reduced motion:** everything respects `prefers-reduced-motion`.

## Final report

### Completed and verified

These were tested with Playwright, through the API, or both.

- **Multi-page application.** All 15 workspaces have their own routes, page titles and layouts. The sidebar shows the active page and only lists pages the user's role can open. There is also a top bar with global search (⌘K), a notification centre and a user menu.
- **Scenario 1, end to end in the browser.** The suspicious payment scored 75–83 and was held in `PENDING_FAMILY_APPROVAL`. An analyst trying to approve it got 403. Priya kept it on hold, the transaction moved to `ON_HOLD`, and a duplicate decision got 409.
- **Scenario 2, end to end in the browser.** The suspicious payment scored 95. Arjun approved it and the simulator settled it. A recovery window opened automatically with a 5-minute deadline. An analyst got 403 on initiate. Neha initiated recovery, the simulator confirmed the reversal, and the transaction showed **Recovered**.
- **Recovery expiry.** With a 60-second window, the window expired to `RECOVERY_EXPIRED` and a late initiate was rejected.
- **Charts and KPIs** are built from database queries. The seed sends 538 transactions through the real engine and resolves outcomes with the real services.
- **Live GPS.** With permission granted, the page shows real coordinates, accuracy, fix time and distance to the nearest familiar place, and can score a payment at that location (labelled *Live GPS*). With permission denied, it shows an "unavailable" state and never substitutes a position.
- **No console errors.** No errors were logged on any page, apart from map tile requests blocked in the build sandbox.
- **Mobile layout.** Pages reflow at phone width (390 px).
- **Reduced motion.** The `prefers-reduced-motion` setting is respected: the 3D shield stops animating and CSS transitions are disabled.

### Partially implemented, or simulated by design

- **Payment rail.** Settlement and reversal go through an internal **payment simulator** with configurable delays and failure rate. No real bank or UPI integration is included.
- **Anomaly model.** The "AI" explanation and anomaly model are a transparent statistical model (a multivariate z-distance) plus rules. There is no trained machine-learning model or LLM. The UI says this.
- **Notifications.** Delivery is in-app (stored and pushed over SSE) plus HMAC-signed webhooks. SMS and email delivery are not implemented. Setting `GUARDIAN_SMS_PROVIDER_URL` only changes the health check status, so the integration still has to be written.
- **Read status.** For company channels, read/unread state is shared across all analysts and admins, not tracked per user.
- **User management.** Adding analyst or admin users from the UI is not implemented. They are seeded. Trusted family members can be added from a customer profile.
- **Seed data.** The seed covers 8 customers and Indian cities, and it carries a "Database records" tag on screen. It is generated data, but it is processed by the real pipeline.

### Configured outside the app

- **Production secret:** set `GUARDIAN_JWT_SECRET`.
- **Map tiles:** the default is CARTO Light. Replace `VITE_MAP_TILE_URL` with a provider you are licensed to use. A vector basemap is built in, so the map still works if tiles are blocked.
- **Webhooks:** add endpoints in Settings → Webhooks. The signing secret is shown once.
- **Browser geolocation** requires HTTPS, or `localhost`, and the user's permission.
- **Production deployment:** you will need a process manager or container, HTTPS, and backups of the SQLite file. For multi-instance deployments, move to Postgres.
