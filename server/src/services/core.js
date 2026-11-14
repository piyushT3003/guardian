// Cross-cutting services: settings, audit trail, system events, notifications + webhooks.
import crypto from 'node:crypto';
import { one, all, run } from '../db.js';
import { emit } from '../lib/events.js';

export const SYSTEM = { id: 0, name: 'Guardian Engine', role: 'system' };
export const ctxOf = (user, now = Date.now()) => ({ now, actor: user ? { id: user.id, name: user.name, role: user.role } : SYSTEM, live: true });

/* ---------------- settings ---------------- */
export const DEFAULT_SETTINGS = {
  thresholds: { medium: 40, high: 70, autoRecovery: 85 },
  weights: { location: 30, recipient: 22, amount: 22, velocity: 10, behaviour: 8, anomaly: 8 },
  policies: { holdHighRiskForFamily: true, reviewMediumRisk: true, approvalWindowSec: 900, recoveryWindowSec: 300, impossibleTravelKmh: 900 },
  notifications: { security: true, family: true, recovery: true, system: true, sound: false },
  location: { requestBrowserLocation: true, showAccuracyRadius: true, familiarRadiusKm: 50 },
  company: { name: 'Guardian Payments Pvt. Ltd.', supportEmail: 'security@guardian.example', timezone: 'Asia/Kolkata', currency: 'INR' },
  demo: { settlementDelayMs: 900, reversalDelayMs: 1800, reversalFailureRate: 0 },
};
export function getSettings() {
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of all('SELECT key, value FROM settings')) out[r.key] = { ...(out[r.key] || {}), ...JSON.parse(r.value) };
  return out;
}
export function setSetting(key, value, user) {
  if (!(key in DEFAULT_SETTINGS)) throw Object.assign(new Error(`Unknown settings group ${key}`), { status: 400 });
  run('INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by',
    key, JSON.stringify(value), Date.now(), user?.id ?? null);
}

/* ---------------- audit ---------------- */
export function audit(ctx, { action, category, entityType, entityId, prev = null, next = null, details = null }) {
  run('INSERT INTO audit_log(at,actor,actor_role,action,category,entity_type,entity_id,prev_state,next_state,details) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ctx.now, ctx.actor.name, ctx.actor.role, action, category, entityType ?? null, entityId ?? null, prev, next, details ? JSON.stringify(details) : null);
  if (ctx.live) emit('audit', { action, entityId });
}

export function systemEvent(level, source, message) {
  run('INSERT INTO system_events(at,level,source,message) VALUES (?,?,?,?)', Date.now(), level, source, String(message).slice(0, 500));
}

/* ---------------- notifications ---------------- */
export function notify(ctx, { channel, severity = 'info', title, body, transactionId = null, recipientRole = null, recipientUserId = null, action = null }) {
  const enabled = getSettings().notifications[channel];
  if (enabled === false) return null;
  const r = run('INSERT INTO notifications(channel,severity,title,body,transaction_id,recipient_role,recipient_user_id,action,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    channel, severity, title, body, transactionId, recipientRole, recipientUserId, action, ctx.now);
  if (ctx.live) {
    emit('notification', { id: Number(r.lastInsertRowid), channel, title, familyUserId: recipientUserId ?? undefined });
    dispatchWebhooks(`notification.${channel}`, { title, body, transactionId, severity });
  }
  return Number(r.lastInsertRowid);
}

/** Notifications visible to a user, by role. */
export function notificationScope(user) {
  if (user.role === 'family') return { sql: `(channel = 'family' AND recipient_user_id = ?)`, params: [user.id] };
  if (user.role === 'analyst') return { sql: `(channel IN ('security','system','recovery') OR (channel='family' AND 0))`, params: [] };
  return { sql: `(channel IN ('security','system','recovery'))`, params: [] };
}

/* ---------------- webhooks (outbound, HMAC-signed) ---------------- */
export async function dispatchWebhooks(event, payload) {
  const hooks = all('SELECT * FROM webhooks WHERE active = 1');
  for (const h of hooks) {
    const patterns = h.events.split(',').map((s) => s.trim());
    if (!patterns.some((p) => p === '*' || event.startsWith(p.replace('*', '')))) continue;
    const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
    const sig = crypto.createHmac('sha256', h.secret).update(body).digest('hex');
    try {
      const res = await fetch(h.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-guardian-signature': sig }, body, signal: AbortSignal.timeout(5000) });
      run('INSERT INTO webhook_deliveries(webhook_id,event,status_code,ok,error,at) VALUES (?,?,?,?,?,?)', h.id, event, res.status, res.ok ? 1 : 0, null, Date.now());
    } catch (e) {
      run('INSERT INTO webhook_deliveries(webhook_id,event,status_code,ok,error,at) VALUES (?,?,?,?,?,?)', h.id, event, null, 0, String(e.message).slice(0, 200), Date.now());
      systemEvent('warn', 'webhooks', `Delivery to ${h.url} failed: ${e.message}`);
    }
  }
}

export const familyUserFor = (familyMemberId) => one('SELECT user_id FROM family_members WHERE id = ?', familyMemberId)?.user_id ?? null;
