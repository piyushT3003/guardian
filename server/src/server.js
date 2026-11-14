import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError } from './db.js';
import { authenticate } from './lib/auth.js';
import { seed } from './seed.js';
import { systemEvent, SYSTEM } from './services/core.js';
import { sweepDeadlines } from './services/operations.js';
import txRoutes from './routes/transactions.js';
import { approvals, recoveries, investigations, demo, demoStatus } from './routes/workflows.js';
import { overview, analytics, customers, geo, timeline, reports } from './routes/insights.js';
import { auth, me, notifications, auditTrail, health, settings, webhooks, users, stream } from './routes/platform.js';

if (seed()) console.log('[seed] database initialised with seeded dataset');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: process.env.GUARDIAN_CORS_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '200kb' }));

app.get('/api/ping', (_req, res) => res.json({ ok: true, at: Date.now() }));
app.use('/api/auth', auth);
app.use('/api', authenticate);
app.use('/api/me', me);
app.use('/api/stream', stream);
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

// Serve the built frontend in production.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) { console.error(err); systemEvent('error', 'api', `${req.method} ${req.path}: ${err.message}`); }
  res.status(status).json({ error: { message: status >= 500 ? 'Internal server error' : err.message, code: err.code || 'ERROR' } });
});

setInterval(() => { try { sweepDeadlines({ now: Date.now(), actor: SYSTEM, live: true }); } catch (e) { systemEvent('error', 'scheduler', e.message); } }, 2000).unref();

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  systemEvent('info', 'backend', `Guardian API started on port ${PORT}`);
  console.log(`Guardian API listening on http://localhost:${PORT}`);
});
