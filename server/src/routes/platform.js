import { Router } from 'express';
import crypto from 'node:crypto';
import { db, one, all, run, HttpError, DB_FILE } from '../db.js';
import { requireRole, signToken, verifyPassword, hashPassword, publicUser, authenticate } from '../lib/auth.js';
import { addClient, streamStats } from '../lib/events.js';
import { ctxOf, audit, getSettings, setSetting, notificationScope, dispatchWebhooks, DEFAULT_SETTINGS } from '../services/core.js';
import { scoreTransaction } from '../services/fraudEngine.js';
import { wrap, num } from './helpers.js';

const STARTED = Date.now();
export const DEMO_MODE = process.env.GUARDIAN_DEMO_MODE !== 'false';

/* ---------------- auth ---------------- */
export const auth = Router();
const attempts = new Map();
auth.post('/login', wrap((req) => {
  const { email, password } = req.body || {};
  const key = `${req.ip}:${email}`;
  const a = attempts.get(key) || { n: 0, at: Date.now() };
  if (a.n >= 8 && Date.now() - a.at < 5 * 60e3) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.', 'RATE_LIMITED');
  const u = one('SELECT * FROM users WHERE email = ?', String(email || '').toLowerCase().trim());
  if (!u || !verifyPassword(String(password || ''), u.password_hash)) {
    attempts.set(key, { n: a.n + 1, at: Date.now() });
    throw new HttpError(401, 'Invalid email or password', 'BAD_CREDENTIALS');
  }
  attempts.delete(key);
  audit(ctxOf(u), { action: 'Signed in', category: 'auth', entityType: 'user', entityId: String(u.id) });
  return { token: signToken(u), user: publicUser(u) };
}));
auth.get('/demo-accounts', wrap(() => DEMO_MODE ? {
  password: process.env.GUARDIAN_DEMO_PASSWORD ? null : 'guardian123',
  accounts: all("SELECT email, name, title, role FROM users WHERE role IN ('analyst','admin') OR email IN ('priya@guardian.example','arjun@guardian.example') ORDER BY CASE role WHEN 'analyst' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END"),
} : { accounts: [] }));
auth.get('/me', authenticate, wrap((req) => publicUser(req.user)));

export const me = Router();
me.put('/profile', wrap((req) => {
  const name = String(req.body?.name || '').trim(), title = String(req.body?.title || '').trim();
  if (name.length < 2) throw new HttpError(400, 'Name is required', 'VALIDATION');
  run('UPDATE users SET name=?, title=? WHERE id=?', name, title || req.user.title, req.user.id);
  audit(ctxOf(req.user), { action: 'Profile updated', category: 'settings', entityType: 'user', entityId: String(req.user.id) });
  return publicUser(one('SELECT * FROM users WHERE id=?', req.user.id));
}));
me.put('/password', wrap((req) => {
  const { current, next } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.password_hash)) throw new HttpError(400, 'Current password is incorrect', 'VALIDATION');
  if (String(next || '').length < 8) throw new HttpError(400, 'New password must be at least 8 characters', 'VALIDATION');
  run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(next), req.user.id);
  audit(ctxOf(req.user), { action: 'Password changed', category: 'auth', entityType: 'user', entityId: String(req.user.id) });
  return { ok: true };
}));

/* ---------------- notifications ---------------- */
export const notifications = Router();
notifications.get('/', wrap((req) => {
  const s = notificationScope(req.user);
  const where = [s.sql], p = [...s.params];
  if (req.query.channel) { where.push('channel = ?'); p.push(req.query.channel); }
  if (req.query.unread === '1') where.push('read_at IS NULL');
  const pageSize = Math.min(100, num(req.query.pageSize, 40));
  const items = all(`SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, ...p, pageSize);
  const counts = Object.fromEntries(all(`SELECT channel, COUNT(*) total, SUM(read_at IS NULL) unread FROM notifications WHERE ${s.sql} GROUP BY channel`, ...s.params).map((r) => [r.channel, { total: r.total, unread: r.unread }]));
  const unread = Object.values(counts).reduce((a, c) => a + c.unread, 0);
  return { items, counts, unread };
}));
notifications.post('/:id/read', wrap((req) => {
  const s = notificationScope(req.user);
  const r = run(`UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND ${s.sql}`, Date.now(), Number(req.params.id), ...s.params);
  if (!r.changes) throw new HttpError(404, 'Notification not found', 'NOT_FOUND');
  return { ok: true };
}));
notifications.post('/:id/unread', wrap((req) => {
  const s = notificationScope(req.user);
  run(`UPDATE notifications SET read_at = NULL WHERE id = ? AND ${s.sql}`, Number(req.params.id), ...s.params);
  return { ok: true };
}));
notifications.post('/read-all', wrap((req) => {
  const s = notificationScope(req.user);
  const where = [s.sql, 'read_at IS NULL'], p = [...s.params];
  if (req.body?.channel) { where.push('channel = ?'); p.push(req.body.channel); }
  const r = run(`UPDATE notifications SET read_at = ? WHERE ${where.join(' AND ')}`, Date.now(), ...p);
  return { updated: r.changes };
}));

/* ---------------- audit ---------------- */
export const auditTrail = Router();
auditTrail.use(requireRole('analyst', 'admin'));
auditTrail.get('/', wrap((req) => {
  const where = [], p = [];
  if (req.query.q) { where.push('(action LIKE ? OR entity_id LIKE ? OR actor LIKE ?)'); const s = `%${req.query.q}%`; p.push(s, s, s); }
  if (req.query.category) { const l = String(req.query.category).split(','); where.push(`category IN (${l.map(() => '?').join(',')})`); p.push(...l); }
  if (req.query.actor_role) { where.push('actor_role = ?'); p.push(req.query.actor_role); }
  if (req.query.from) { where.push('at >= ?'); p.push(num(req.query.from, 0)); }
  if (req.query.to) { where.push('at <= ?'); p.push(num(req.query.to, Date.now())); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageSize = Math.min(100, num(req.query.pageSize, 25)), page = Math.max(1, num(req.query.page, 1));
  const total = one(`SELECT COUNT(*) n FROM audit_log ${w}`, ...p).n;
  const items = all(`SELECT * FROM audit_log ${w} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`, ...p, pageSize, (page - 1) * pageSize);
  const categories = all('SELECT category, COUNT(*) n FROM audit_log GROUP BY category ORDER BY n DESC');
  return { items, total, page, pageSize, categories };
}));

/* ---------------- system health (real checks only) ---------------- */
export function healthReport(summary = false) {
  const checks = [];
  const t0 = performance.now();
  try { one('SELECT COUNT(*) n FROM transactions'); checks.push({ key: 'database', label: 'Database', status: 'operational', detail: `SQLite · ${(performance.now() - t0).toFixed(1)} ms query` }); }
  catch (e) { checks.push({ key: 'database', label: 'Database', status: 'down', detail: e.message }); }
  checks.push({ key: 'backend', label: 'Backend API', status: 'operational', detail: `Uptime ${Math.round((Date.now() - STARTED) / 60e3)} min · Node ${process.version}` });
  try {
    const sample = one("SELECT * FROM transactions WHERE analysed_at IS NOT NULL ORDER BY created_at DESC LIMIT 1");
    const t1 = performance.now();
    if (sample) scoreTransaction(sample, Date.now());
    checks.push({ key: 'engine', label: 'Fraud engine', status: 'operational', detail: sample ? `Self-test scored ${sample.id} in ${(performance.now() - t1).toFixed(1)} ms` : 'No transactions to self-test' });
  } catch (e) { checks.push({ key: 'engine', label: 'Fraud engine', status: 'down', detail: e.message }); }
  const lastNotif = one('SELECT MAX(created_at) at FROM notifications').at;
  checks.push({ key: 'notifications', label: 'Notification provider', status: 'operational', detail: `In-app provider · last delivery ${lastNotif ? new Date(lastNotif).toISOString() : 'never'}` });
  checks.push({ key: 'sms', label: 'SMS / email provider', status: process.env.GUARDIAN_SMS_PROVIDER_URL ? 'operational' : 'not_configured', detail: process.env.GUARDIAN_SMS_PROVIDER_URL ? 'Configured via GUARDIAN_SMS_PROVIDER_URL' : 'Set GUARDIAN_SMS_PROVIDER_URL to enable external delivery' });
  const ss = streamStats();
  checks.push({ key: 'realtime', label: 'Real-time stream', status: 'operational', detail: `${ss.clients} connected client(s) · SSE` });
  const hooks = one('SELECT COUNT(*) n FROM webhooks WHERE active=1').n;
  const lastDel = one('SELECT * FROM webhook_deliveries ORDER BY id DESC LIMIT 1');
  checks.push({ key: 'webhooks', label: 'Webhooks', status: hooks === 0 ? 'not_configured' : lastDel && !lastDel.ok ? 'degraded' : 'operational',
    detail: hooks === 0 ? 'No active webhook endpoints' : lastDel ? `${hooks} endpoint(s) · last delivery ${lastDel.ok ? 'succeeded' : 'failed'}` : `${hooks} endpoint(s) · no deliveries yet` });
  const errors24 = one("SELECT COUNT(*) n FROM system_events WHERE level IN ('error','warn') AND at > ?", Date.now() - 864e5).n;
  if (summary) return { checks: checks.map(({ key, label, status }) => ({ key, label, status })), errors24 };
  const stuck = all("SELECT id, status, updated_at FROM transactions WHERE status IN ('PROCESSING','RECOVERING','ANALYSING','RECEIVED') AND updated_at < ?", Date.now() - 2 * 60e3);
  return {
    checks, errors24, startedAt: STARTED, serverNow: Date.now(), stream: ss,
    events: all('SELECT * FROM system_events ORDER BY at DESC LIMIT 25'),
    processingFailures: [...stuck.map((s) => ({ id: s.id, issue: `Stuck in ${s.status}`, at: s.updated_at })),
      ...all("SELECT id, status, updated_at FROM transactions WHERE status IN ('FAILED','RECOVERY_FAILED') ORDER BY updated_at DESC LIMIT 10").map((s) => ({ id: s.id, issue: s.status, at: s.updated_at }))],
    webhookDeliveries: all('SELECT d.*, w.url FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id ORDER BY d.id DESC LIMIT 10'),
    database: { file: DB_FILE.split('/').slice(-2).join('/'), tables: Object.fromEntries(['transactions', 'approvals', 'recoveries', 'notifications', 'audit_log'].map((t) => [t, one(`SELECT COUNT(*) n FROM ${t}`).n])) },
  };
}
export const health = Router();
health.get('/', wrap(() => healthReport(false)));

/* ---------------- settings ---------------- */
export const settings = Router();
settings.get('/', wrap((req) => ({ settings: getSettings(), defaults: DEFAULT_SETTINGS, editable: req.user.role === 'admin' })));
const V = {
  thresholds: (v) => { const { medium, high, autoRecovery } = v; if (![medium, high, autoRecovery].every((x) => Number.isInteger(x) && x >= 1 && x <= 100) || !(medium < high && high <= autoRecovery)) throw new HttpError(400, 'Thresholds must be integers 1–100 with medium < high ≤ auto-recovery'); return { medium, high, autoRecovery }; },
  weights: (v) => { const o = {}; for (const k of Object.keys(DEFAULT_SETTINGS.weights)) { const x = Number(v[k]); if (!(x >= 0 && x <= 60)) throw new HttpError(400, `Weight ${k} must be 0–60`); o[k] = x; } if (Object.values(o).reduce((a, b) => a + b, 0) < 50) throw new HttpError(400, 'Weights should sum to at least 50'); return o; },
  policies: (v) => { const o = { holdHighRiskForFamily: !!v.holdHighRiskForFamily, reviewMediumRisk: !!v.reviewMediumRisk, approvalWindowSec: Number(v.approvalWindowSec), recoveryWindowSec: Number(v.recoveryWindowSec), impossibleTravelKmh: Number(v.impossibleTravelKmh) };
    if (!(o.approvalWindowSec >= 60 && o.approvalWindowSec <= 86400)) throw new HttpError(400, 'Approval window must be 1 min – 24 h'); if (!(o.recoveryWindowSec >= 60 && o.recoveryWindowSec <= 3600)) throw new HttpError(400, 'Recovery window must be 1–60 min'); if (!(o.impossibleTravelKmh >= 200)) throw new HttpError(400, 'Impossible-travel speed must be ≥ 200 km/h'); return o; },
  notifications: (v) => Object.fromEntries(['security', 'family', 'recovery', 'system', 'sound'].map((k) => [k, !!v[k]])),
  location: (v) => { const o = { requestBrowserLocation: !!v.requestBrowserLocation, showAccuracyRadius: !!v.showAccuracyRadius, familiarRadiusKm: Number(v.familiarRadiusKm) }; if (!(o.familiarRadiusKm >= 5 && o.familiarRadiusKm <= 300)) throw new HttpError(400, 'Familiar radius must be 5–300 km'); return o; },
  company: (v) => ({ name: String(v.name || '').slice(0, 80), supportEmail: String(v.supportEmail || '').slice(0, 120), timezone: String(v.timezone || 'Asia/Kolkata'), currency: 'INR' }),
  demo: (v) => { const o = { settlementDelayMs: Number(v.settlementDelayMs), reversalDelayMs: Number(v.reversalDelayMs), reversalFailureRate: Number(v.reversalFailureRate) }; if (!(o.settlementDelayMs >= 0 && o.settlementDelayMs <= 10000 && o.reversalDelayMs >= 0 && o.reversalDelayMs <= 15000 && o.reversalFailureRate >= 0 && o.reversalFailureRate <= 1)) throw new HttpError(400, 'Demo delays 0–15 s, failure rate 0–1'); return o; },
};
settings.put('/:group', requireRole('admin'), wrap((req) => {
  const g = req.params.group;
  if (!V[g]) throw new HttpError(404, 'Unknown settings group', 'NOT_FOUND');
  const value = V[g](req.body || {});
  const before = getSettings()[g];
  setSetting(g, value, req.user);
  audit(ctxOf(req.user), { action: `Settings updated: ${g}`, category: 'settings', entityType: 'settings', entityId: g, details: { before, after: value } });
  return { settings: getSettings() };
}));

/* ---------------- webhooks ---------------- */
export const webhooks = Router();
webhooks.use(requireRole('admin'));
webhooks.get('/', wrap(() => all('SELECT id, url, events, active, created_at, (SELECT ok FROM webhook_deliveries d WHERE d.webhook_id=w.id ORDER BY id DESC LIMIT 1) last_ok FROM webhooks w ORDER BY id')));
webhooks.post('/', wrap((req) => {
  const url = String(req.body?.url || '');
  try { const u = new URL(url); if (!['http:', 'https:'].includes(u.protocol)) throw 0; } catch { throw new HttpError(400, 'A valid http(s) URL is required', 'VALIDATION'); }
  const secret = crypto.randomBytes(24).toString('hex');
  const r = run('INSERT INTO webhooks(url, events, secret, active, created_at) VALUES (?,?,?,?,?)', url, String(req.body?.events || '*'), secret, 1, Date.now());
  audit(ctxOf(req.user), { action: `Webhook added: ${url}`, category: 'settings', entityType: 'webhook', entityId: String(r.lastInsertRowid) });
  return { id: Number(r.lastInsertRowid), url, secret, note: 'Store this signing secret now; it will not be shown again.' };
}));
webhooks.delete('/:id', wrap((req) => {
  run('DELETE FROM webhook_deliveries WHERE webhook_id=?', Number(req.params.id));
  const r = run('DELETE FROM webhooks WHERE id=?', Number(req.params.id));
  if (!r.changes) throw new HttpError(404, 'Webhook not found', 'NOT_FOUND');
  audit(ctxOf(req.user), { action: `Webhook removed #${req.params.id}`, category: 'settings', entityType: 'webhook', entityId: req.params.id });
  return { ok: true };
}));
webhooks.post('/:id/test', async (req, res, next) => {
  try {
    const h = one('SELECT * FROM webhooks WHERE id=?', Number(req.params.id));
    if (!h) throw new HttpError(404, 'Webhook not found', 'NOT_FOUND');
    await dispatchWebhooks('system.test', { message: 'Guardian webhook test', by: req.user.name });
    res.json(one('SELECT * FROM webhook_deliveries WHERE webhook_id=? ORDER BY id DESC LIMIT 1', h.id));
  } catch (e) { next(e); }
});

/* ---------------- users (role & permission view) ---------------- */
export const users = Router();
users.get('/', requireRole('admin', 'analyst'), wrap(() => all('SELECT id, name, email, title, role, customer_id FROM users ORDER BY role, name')));

/* ---------------- SSE stream ---------------- */
export const stream = Router();
stream.get('/', (req, res) => {
  res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
  addClient(res, req.user);
});
