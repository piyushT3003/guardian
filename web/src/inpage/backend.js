// Boots the Guardian backend inside the page: SQLite (sql.js) + the unchanged API routes and services.
// window.fetch('/api/...') and EventSource are routed to it, so the React app runs exactly as against the server.
import { initDb, HttpError } from './db.js';
import { authenticate } from './auth.js';
import { subscribe } from './events.js';
import { Router } from './express.js';
import { seed } from '../../../server/src/seed.js';
import { systemEvent, SYSTEM } from '../../../server/src/services/core.js';
import { sweepDeadlines } from '../../../server/src/services/operations.js';
import txRoutes from '../../../server/src/routes/transactions.js';
import { approvals, recoveries, investigations, demo, demoStatus } from '../../../server/src/routes/workflows.js';
import { overview, analytics, customers, geo, timeline, reports } from '../../../server/src/routes/insights.js';
import { auth, me, notifications, auditTrail, health, settings, webhooks, users } from '../../../server/src/routes/platform.js';

function buildApp() {
  const app = Router();
  app.use('/api/ping', (_req, res) => res.json({ ok: true, at: Date.now() }));
  app.use('/api/auth', auth);
  app.use('/api', authenticate);
  app.use('/api/me', me);
  app.use('/api/overview', overview);
  app.use('/api/transactions', txRoutes);
  app.use('/api/approvals', approvals);
  app.use('/api/recoveries', recoveries);
  app.use('/api/investigations', investigations);
  app.use('/api/demo', demoStatus, demo);
  app.use('/api/analytics', analytics);
  app.use('/api/customers', customers);
  app.use('/api/geo', geo);
  app.use('/api/timeline', timeline);
  app.use('/api/reports', reports);
  app.use('/api/notifications', notifications);
  app.use('/api/audit', auditTrail);
  app.use('/api/health', health);
  app.use('/api/settings', settings);
  app.use('/api/webhooks', webhooks);
  app.use('/api/users', users);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found', 'NOT_FOUND')));
  return app;
}

function handle(app, input, init = {}) {
  return new Promise((resolve) => {
    const u = new URL(input, 'http://guardian.local');
    const headers = {};
    new Headers(init.headers || {}).forEach((v, k) => (headers[k] = v));
    const req = { method: (init.method || 'GET').toUpperCase(), url: u.pathname, path: u.pathname, baseUrl: '', headers, ip: 'in-page',
      query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : {}, params: {} };
    let status = 200; const outHeaders = { 'content-type': 'application/json' };
    const res = {
      status(s) { status = s; return res; },
      set(k, v) { if (typeof k === 'object') Object.assign(outHeaders, k); else outHeaders[k.toLowerCase()] = v; return res; },
      json(b) { resolve(new Response(JSON.stringify(b ?? null), { status, headers: outHeaders })); },
      send(b) { resolve(new Response(b, { status, headers: outHeaders })); },
    };
    app(req, res, (err) => {
      const s = err?.status || (err ? 500 : 404);
      if (s >= 500) { console.error(err); try { systemEvent('error', 'api', `${req.method} ${req.path}: ${err?.message}`); } catch {} }
      resolve(new Response(JSON.stringify({ error: { message: s >= 500 ? 'Internal server error' : err?.message || 'Not found', code: err?.code || 'ERROR' } }), { status: s, headers: { 'content-type': 'application/json' } }));
    });
  });
}

class InPageEventSource {
  constructor() {
    this.listeners = {}; this.readyState = 1;
    this._unsub = subscribe(this);
    setTimeout(() => { this.onopen?.(); this._dispatch('hello', JSON.stringify({ at: Date.now() })); }, 0);
  }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); }
  _dispatch(t, data) { (this.listeners[t] || []).forEach((f) => f({ type: t, data })); }
  close() { this.readyState = 2; this._unsub(); }
}

export async function bootBackend(onProgress) {
  onProgress?.('Starting the database');
  await initDb();
  onProgress?.('Scoring 30 days of transactions');
  await new Promise((r) => setTimeout(r, 30));
  seed();
  const app = buildApp();
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    return url.startsWith('/api') ? handle(app, url, init) : realFetch(input, init);
  };
  window.EventSource = InPageEventSource;
  setInterval(() => { try { sweepDeadlines({ now: Date.now(), actor: SYSTEM, live: true }); } catch (e) { systemEvent('error', 'scheduler', e.message); } }, 2000);
  systemEvent('info', 'backend', 'Guardian backend started inside this page');
}
