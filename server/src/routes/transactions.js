import { Router } from 'express';
import { one, all, HttpError } from '../db.js';
import { requireRole } from '../lib/auth.js';
import { ctxOf } from '../services/core.js';
import { ingest } from '../services/operations.js';
import { familiarLocations } from '../services/location.js';
import { wrap, idempotent, TX_SELECT, txView, scopeCustomer, assertCanSeeCustomer, num } from './helpers.js';

const r = Router();
const SORTS = { created_at: 't.created_at', amount: 't.amount', risk_score: 't.risk_score', customer: 'c.name', recipient: 'rc.name', id: 't.seq', city: 't.city', status: 't.status' };
export const STATUS_GROUPS = {
  pending: ['PENDING_FAMILY_APPROVAL', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING'],
  held: ['ON_HOLD', 'BLOCKED'],
  completed: ['COMPLETED'],
  recovery: ['RECOVERY_PENDING', 'RECOVERING', 'RECOVERED', 'RECOVERY_DECLINED', 'RECOVERY_EXPIRED', 'RECOVERY_FAILED'],
};

export function buildTxFilter(q, user) {
  const where = [], p = [];
  const cust = scopeCustomer(user) ?? (q.customer ? Number(q.customer) : null);
  if (cust) { where.push('t.customer_id = ?'); p.push(cust); }
  if (q.q) { where.push('(t.id LIKE ? OR c.name LIKE ? OR rc.name LIKE ? OR t.city LIKE ?)'); const s = `%${q.q}%`; p.push(s, s, s, s); }
  if (q.status) {
    const list = STATUS_GROUPS[q.status] || String(q.status).split(',');
    where.push(`t.status IN (${list.map(() => '?').join(',')})`); p.push(...list);
  }
  if (q.risk) { const l = String(q.risk).split(','); where.push(`t.risk_level IN (${l.map(() => '?').join(',')})`); p.push(...l); }
  if (q.from) { where.push('t.created_at >= ?'); p.push(num(q.from, 0)); }
  if (q.to) { where.push('t.created_at <= ?'); p.push(num(q.to, Date.now())); }
  if (q.source) { where.push('t.location_source = ?'); p.push(q.source); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', p };
}

r.get('/', wrap((req) => {
  const { sql, p } = buildTxFilter(req.query, req.user);
  const sort = SORTS[req.query.sort] || 't.created_at';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const pageSize = Math.min(100, Math.max(5, num(req.query.pageSize, 12)));
  const page = Math.max(1, num(req.query.page, 1));
  const total = one(`SELECT COUNT(*) n FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN recipients rc ON rc.id=t.recipient_id ${sql}`, ...p).n;
  const items = all(`${TX_SELECT} ${sql} ORDER BY ${sort} ${dir}, t.seq DESC LIMIT ? OFFSET ?`, ...p, pageSize, (page - 1) * pageSize)
    .map((t) => ({ ...txView(t), signals: undefined, analysis: undefined }));
  return { items, total, page, pageSize };
}));

r.get('/:id', wrap((req) => {
  const t = txView(one(`${TX_SELECT} WHERE t.id = ?`, req.params.id));
  if (!t) throw new HttpError(404, 'Transaction not found', 'NOT_FOUND');
  assertCanSeeCustomer(req.user, t.customer_id);
  const customer = one('SELECT * FROM customers WHERE id=?', t.customer_id);
  const recipient = one('SELECT * FROM recipients WHERE id=?', t.recipient_id);
  const history = all(`${TX_SELECT} WHERE t.customer_id=? AND t.created_at < ? ORDER BY t.created_at DESC LIMIT 12`, t.customer_id, t.created_at).map((x) => ({ ...txView(x), signals: undefined }));
  const sequence = all(`${TX_SELECT} WHERE t.customer_id=? AND t.created_at BETWEEN ? AND ? ORDER BY t.created_at`, t.customer_id, t.created_at - 3 * 3.6e6, t.created_at + 3.6e6).map((x) => ({ ...txView(x), signals: undefined }));
  const recipientStats = one(`SELECT COUNT(*) payments, COUNT(DISTINCT customer_id) customers, COALESCE(SUM(amount),0) volume,
    SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) high_risk FROM transactions WHERE recipient_id=?`, t.recipient_id);
  const recipientTx = all(`${TX_SELECT} WHERE t.recipient_id=? AND t.id != ? ORDER BY t.created_at DESC LIMIT 8`, t.recipient_id, t.id).map((x) => ({ ...txView(x), signals: undefined }));
  const prior = all('SELECT amount, recipient_id, lat, lng, city, created_at, risk_level FROM transactions WHERE customer_id=? AND created_at < ?', t.customer_id, t.created_at);
  const baseline = one(`SELECT COUNT(*) n, AVG(amount) avg, MAX(amount) max, COUNT(DISTINCT recipient_id) recipients FROM transactions WHERE customer_id=? AND created_at < ? AND risk_level != 'high'`, t.customer_id, t.created_at);
  const approval = one(`SELECT a.*, fm.name family_name, fm.relation, u.name decided_by_name FROM approvals a JOIN family_members fm ON fm.id=a.family_member_id LEFT JOIN users u ON u.id=a.decided_by WHERE a.transaction_id=?`, t.id);
  const recovery = one('SELECT r.*, u.name decided_by_name FROM recoveries r LEFT JOIN users u ON u.id=r.decided_by WHERE r.transaction_id=?', t.id);
  const investigation = one('SELECT * FROM investigations WHERE transaction_id=?', t.id);
  const auditRows = all('SELECT * FROM audit_log WHERE entity_id=? ORDER BY id', t.id);
  const family = all('SELECT id, name, relation FROM family_members WHERE customer_id=?', t.customer_id);
  return { transaction: t, customer, recipient, recipientStats, recipientTx, history, sequence, baseline, familiar: familiarLocations(customer, prior), approval, recovery, investigation, audit: auditRows, family, serverNow: Date.now() };
}));

/** Ingest a transaction (used by the live-GPS simulator on the Geospatial page). */
r.post('/', requireRole('analyst', 'admin'), idempotent((req) => {
  const b = req.body || {};
  const t = ingest(ctxOf(req.user), {
    customer_id: Number(b.customer_id), recipient: b.recipient, amount: Number(b.amount),
    lat: b.lat == null ? undefined : Number(b.lat), lng: b.lng == null ? undefined : Number(b.lng), accuracy_m: b.accuracy_m == null ? null : Number(b.accuracy_m),
    location_source: b.location_source === 'live_gps' ? 'live_gps' : 'demo', channel: b.channel || 'UPI',
  });
  return txView(one(`${TX_SELECT} WHERE t.id=?`, t.id));
}));

export default r;
