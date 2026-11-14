import { Router } from 'express';
import { one, all, run, HttpError } from '../db.js';
import { requireRole, hashPassword } from '../lib/auth.js';
import { audit, ctxOf } from '../services/core.js';
import { familiarLocations } from '../services/location.js';
import { haversineKm } from '../lib/geo.js';
import { wrap, TX_SELECT, txView, assertCanSeeCustomer, num } from './helpers.js';
import { healthReport } from './platform.js';

const HOUR = 3.6e6, DAY = 864e5;

/* ---------------- overview ---------------- */
export const overview = Router();
overview.get('/', requireRole('analyst', 'admin'), wrap(() => {
  const now = Date.now();
  const k = (sql, ...p) => one(sql, ...p).n;
  const win = (from, to) => ({
    total: k('SELECT COUNT(*) n FROM transactions WHERE created_at BETWEEN ? AND ?', from, to),
    high: k("SELECT COUNT(*) n FROM transactions WHERE risk_level='high' AND created_at BETWEEN ? AND ?", from, to),
    completed: k("SELECT COUNT(*) n FROM transactions WHERE completed_at BETWEEN ? AND ?", from, to),
  });
  const cur = win(now - 7 * DAY, now), prev = win(now - 14 * DAY, now - 7 * DAY);
  const kpis = {
    total: k('SELECT COUNT(*) n FROM transactions'),
    analysed: k('SELECT COUNT(*) n FROM transactions WHERE analysed_at IS NOT NULL'),
    highRisk: k("SELECT COUNT(*) n FROM transactions WHERE risk_level='high'"),
    pendingApprovals: k("SELECT COUNT(*) n FROM approvals WHERE status='PENDING'"),
    onHold: k("SELECT COUNT(*) n FROM transactions WHERE status IN ('ON_HOLD','UNDER_REVIEW')"),
    completed: k("SELECT COUNT(*) n FROM transactions WHERE completed_at IS NOT NULL"),
    recoveryRequests: k('SELECT COUNT(*) n FROM recoveries'),
    recovered: k("SELECT COUNT(*) n FROM recoveries WHERE status='RECOVERED'"),
    openRecoveries: k("SELECT COUNT(*) n FROM recoveries WHERE status IN ('OPEN','INITIATED')"),
    protectedValue: one("SELECT COALESCE(SUM(t.amount),0) n FROM transactions t WHERE status IN ('BLOCKED','RECOVERED','ON_HOLD')").n,
    weekOverWeek: { total: pct(cur.total, prev.total), high: pct(cur.high, prev.high), completed: pct(cur.completed, prev.completed) },
  };
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    const from = Math.floor((now - i * HOUR) / HOUR) * HOUR;
    const row = one("SELECT COUNT(*) n, SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) h, SUM(CASE WHEN risk_level='medium' THEN 1 ELSE 0 END) m FROM transactions WHERE created_at >= ? AND created_at < ?", from, from + HOUR);
    hours.push({ t: from, total: row.n, high: row.h || 0, medium: row.m || 0 });
  }
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const from = startOfDayIST(now) - i * DAY;
    const row = one("SELECT COUNT(*) n, SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) h FROM transactions WHERE created_at >= ? AND created_at < ?", from, from + DAY);
    days.push({ t: from, total: row.n, high: row.h || 0 });
  }
  const dist = Object.fromEntries(all('SELECT risk_level l, COUNT(*) n FROM transactions GROUP BY risk_level').map((x) => [x.l, x.n]));
  const alerts = all("SELECT * FROM notifications WHERE channel IN ('security','recovery') ORDER BY created_at DESC, id DESC LIMIT 6");
  const suspicious = all(`${TX_SELECT} WHERE t.risk_level IN ('high','medium') ORDER BY t.created_at DESC LIMIT 6`).map((x) => ({ ...txView(x), signals: undefined, analysis: undefined }));
  return { kpis, hours, days, distribution: { low: dist.low || 0, medium: dist.medium || 0, high: dist.high || 0 }, alerts, suspicious, health: healthReport(true), serverNow: now };
}));
const pct = (a, b) => (b ? +(((a - b) / b) * 100).toFixed(1) : null);
const startOfDayIST = (ms) => { const off = 5.5 * HOUR; return Math.floor((ms + off) / DAY) * DAY - off; };

/* ---------------- analytics ---------------- */
export const analytics = Router();
analytics.get('/', requireRole('analyst', 'admin'), wrap((req) => {
  const days = Math.min(90, Math.max(7, num(req.query.days, 30)));
  const now = Date.now(), from = startOfDayIST(now) - (days - 1) * DAY;
  const txs = all('SELECT id, amount, risk_score, risk_level, status, signals, created_at, city, customer_id FROM transactions WHERE created_at >= ?', from);
  const daily = Array.from({ length: days }, (_, i) => ({ t: from + i * DAY, total: 0, low: 0, medium: 0, high: 0, volume: 0 }));
  const signalFreq = {}, signalSum = {};
  const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((b) => ({ range: `${b}–${b + 9}`, n: 0 }));
  const amountDev = [{ label: '< 1×', n: 0 }, { label: '1–2×', n: 0 }, { label: '2–5×', n: 0 }, { label: '5–10×', n: 0 }, { label: '> 10×', n: 0 }];
  const geo = [{ label: '< 50 km', n: 0 }, { label: '50–300 km', n: 0 }, { label: '300–1,000 km', n: 0 }, { label: '> 1,000 km', n: 0 }];
  let novel = 0, velocityHits = 0, impossible = 0;
  for (const t of txs) {
    const d = daily[Math.floor((t.created_at - from) / DAY)];
    if (d) { d.total++; d[t.risk_level]++; d.volume += t.amount; }
    buckets[Math.min(9, Math.floor((t.risk_score || 0) / 10))].n++;
    const s = t.signals ? JSON.parse(t.signals) : null;
    if (!s) continue;
    for (const g of s.signals) { if (g.contribution >= 3) signalFreq[g.key] = (signalFreq[g.key] || 0) + 1; signalSum[g.key] = (signalSum[g.key] || 0) + g.contribution; }
    const ratio = t.amount / (s.context.typicalAmount || 1);
    amountDev[ratio < 1 ? 0 : ratio < 2 ? 1 : ratio < 5 ? 2 : ratio < 10 ? 3 : 4].n++;
    const dk = s.context.location?.distanceKm;
    if (dk != null) geo[dk < 50 ? 0 : dk < 300 ? 1 : dk < 1000 ? 2 : 3].n++;
    if (s.context.priorToRecipient === 0) novel++;
    if (s.context.n15 >= 1) velocityHits++;
    if (s.context.location?.impossibleTravel) impossible++;
  }
  const labels = { location: 'Unusual location', recipient: 'New recipient', amount: 'Amount anomaly', behaviour: 'Behavioural', velocity: 'Velocity', anomaly: 'Anomaly model' };
  const signals = Object.keys(labels).map((k) => ({ key: k, label: labels[k], fired: signalFreq[k] || 0, avgContribution: txs.length ? +((signalSum[k] || 0) / txs.length).toFixed(2) : 0 }));
  const outcome = (sql) => Object.fromEntries(all(sql, from).map((x) => [x.status, x.n]));
  return {
    days, from, total: txs.length, daily, scoreBuckets: buckets, signals, amountDeviation: amountDev, geoDistance: geo,
    novelty: { novel, known: txs.length - novel }, velocityHits, impossibleTravel: impossible,
    approvals: outcome('SELECT status, COUNT(*) n FROM approvals WHERE created_at >= ? GROUP BY status'),
    holds: outcome("SELECT status, COUNT(*) n FROM transactions WHERE created_at >= ? AND id IN (SELECT transaction_id FROM investigations) GROUP BY status"),
    recoveries: outcome('SELECT status, COUNT(*) n FROM recoveries WHERE opened_at >= ? GROUP BY status'),
    byCity: all("SELECT city, COUNT(*) n, SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) high FROM transactions WHERE created_at >= ? AND city IS NOT NULL GROUP BY city ORDER BY high DESC, n DESC LIMIT 10", from),
  };
}));

/* ---------------- customers ---------------- */
export const customers = Router();
customers.get('/', wrap((req) => {
  const scope = req.user.role === 'family' ? 'WHERE c.id = ?' : '';
  return all(`SELECT c.*, COUNT(t.id) tx_count, COALESCE(SUM(t.amount),0) volume, SUM(CASE WHEN t.risk_level='high' THEN 1 ELSE 0 END) high_risk, MAX(t.created_at) last_tx,
    (SELECT COUNT(*) FROM family_members f WHERE f.customer_id=c.id) family_count FROM customers c LEFT JOIN transactions t ON t.customer_id=c.id ${scope} GROUP BY c.id ORDER BY c.name`, ...(scope ? [req.user.customer_id] : []));
}));
customers.get('/:id', wrap((req) => {
  const id = Number(req.params.id);
  assertCanSeeCustomer(req.user, id);
  const c = one('SELECT * FROM customers WHERE id=?', id);
  if (!c) throw new HttpError(404, 'Customer not found', 'NOT_FOUND');
  const txs = all(`${TX_SELECT} WHERE t.customer_id=? ORDER BY t.created_at DESC`, id).map((x) => ({ ...txView(x), signals: undefined, analysis: undefined }));
  const trusted = txs.filter((t) => t.risk_level !== 'high');
  const recipients = all(`SELECT rc.name, rc.category, COUNT(*) n, SUM(t.amount) total, MAX(t.created_at) last FROM transactions t JOIN recipients rc ON rc.id=t.recipient_id WHERE t.customer_id=? AND t.risk_level='low' GROUP BY rc.id ORDER BY n DESC LIMIT 10`, id);
  const amounts = trusted.map((t) => t.amount).sort((a, b) => a - b);
  const hours = Array(24).fill(0); trusted.forEach((t) => hours[new Date(t.created_at + 5.5 * HOUR).getUTCHours()]++);
  const baseline = { count: trusted.length, median: amounts[Math.floor(amounts.length / 2)] || 0, p90: amounts[Math.floor(amounts.length * 0.9)] || 0, avgPerDay: +(trusted.length / 30).toFixed(1), hours };
  const familiar = familiarLocations(c, txs);
  const locations = all("SELECT city, AVG(lat) lat, AVG(lng) lng, COUNT(*) n, SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) high FROM transactions WHERE customer_id=? AND lat IS NOT NULL GROUP BY city ORDER BY n DESC", id);
  const family = all('SELECT f.*, u.email FROM family_members f LEFT JOIN users u ON u.id=f.user_id WHERE f.customer_id=?', id);
  const approvals = all(`SELECT a.*, t.amount, rc.name recipient, fm.name family_name FROM approvals a JOIN transactions t ON t.id=a.transaction_id JOIN recipients rc ON rc.id=t.recipient_id JOIN family_members fm ON fm.id=a.family_member_id WHERE a.customer_id=? ORDER BY a.created_at DESC`, id);
  const recoveries = all('SELECT r.*, t.amount FROM recoveries r JOIN transactions t ON t.id=r.transaction_id WHERE t.customer_id=? ORDER BY r.opened_at DESC', id);
  const holds = all("SELECT DISTINCT a.entity_id id, a.at, a.action FROM audit_log a JOIN transactions t ON t.id=a.entity_id WHERE t.customer_id=? AND a.next_state IN ('ON_HOLD','BLOCKED','UNDER_REVIEW','PENDING_FAMILY_APPROVAL') ORDER BY a.at DESC LIMIT 30", id);
  const riskHistory = txs.slice(0, 60).reverse().map((t) => ({ t: t.created_at, score: t.risk_score, id: t.id }));
  return { customer: c, transactions: txs.slice(0, 50), totals: { count: txs.length, volume: txs.reduce((s, t) => s + t.amount, 0), high: txs.filter((t) => t.risk_level === 'high').length, medium: txs.filter((t) => t.risk_level === 'medium').length },
    recipients, baseline, familiar, locations, family, approvals, recoveries, holds, riskHistory, suspicious: txs.filter((t) => t.risk_level !== 'low').slice(0, 20) };
}));
customers.patch('/:id', requireRole('admin'), wrap((req) => {
  const id = Number(req.params.id);
  const c = one('SELECT * FROM customers WHERE id=?', id);
  if (!c) throw new HttpError(404, 'Customer not found', 'NOT_FOUND');
  if (typeof req.body?.family_protection !== 'boolean') throw new HttpError(400, 'family_protection (boolean) required', 'VALIDATION');
  run('UPDATE customers SET family_protection=? WHERE id=?', req.body.family_protection ? 1 : 0, id);
  audit(ctxOf(req.user), { action: `Family protection ${req.body.family_protection ? 'enabled' : 'disabled'} for ${c.name}`, category: 'settings', entityType: 'customer', entityId: String(id) });
  return one('SELECT * FROM customers WHERE id=?', id);
}));
customers.post('/:id/family', requireRole('admin'), wrap((req) => {
  const id = Number(req.params.id);
  const c = one('SELECT * FROM customers WHERE id=?', id);
  if (!c) throw new HttpError(404, 'Customer not found', 'NOT_FOUND');
  const { name, relation, phone, email, password } = req.body || {};
  if (!name || !email || !password || String(password).length < 8) throw new HttpError(400, 'name, email and a password of at least 8 characters are required', 'VALIDATION');
  if (one('SELECT 1 FROM users WHERE email=?', email)) throw new HttpError(409, 'A user with that email already exists', 'CONFLICT');
  const u = run('INSERT INTO users(email,name,title,role,password_hash,customer_id,created_at) VALUES (?,?,?,?,?,?,?)', email, name, `Trusted family · ${relation || 'Family'} of ${c.name.split(' ')[0]}`, 'family', hashPassword(password), id, Date.now());
  run('INSERT INTO family_members(customer_id,user_id,name,relation,phone,created_at) VALUES (?,?,?,?,?,?)', id, Number(u.lastInsertRowid), name, relation || null, phone || null, Date.now());
  audit(ctxOf(req.user), { action: `Trusted family member ${name} added for ${c.name}`, category: 'settings', entityType: 'customer', entityId: String(id) });
  return all('SELECT f.*, u.email FROM family_members f LEFT JOIN users u ON u.id=f.user_id WHERE f.customer_id=?', id);
}));

/* ---------------- geospatial ---------------- */
export const geo = Router();
geo.get('/', wrap((req) => {
  const where = ['t.lat IS NOT NULL'], p = [];
  let customerId = req.user.role === 'family' ? req.user.customer_id : (req.query.customer ? Number(req.query.customer) : null);
  let focus = null;
  if (req.query.tx) {
    focus = txView(one(`${TX_SELECT} WHERE t.id=?`, req.query.tx));
    if (!focus) throw new HttpError(404, 'Transaction not found', 'NOT_FOUND');
    assertCanSeeCustomer(req.user, focus.customer_id);
    customerId = focus.customer_id;
  }
  if (customerId) { where.push('t.customer_id=?'); p.push(customerId); }
  if (req.query.from) { where.push('t.created_at >= ?'); p.push(num(req.query.from, 0)); }
  if (req.query.to) { where.push('t.created_at <= ?'); p.push(num(req.query.to, Date.now())); }
  if (req.query.risk) { const l = String(req.query.risk).split(','); where.push(`t.risk_level IN (${l.map(() => '?').join(',')})`); p.push(...l); }
  const points = all(`SELECT t.id, t.customer_id, c.name customer, rc.name recipient, t.amount, t.lat, t.lng, t.city, t.region, t.accuracy_m, t.location_source, t.risk_score, t.risk_level, t.status, t.created_at
    FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN recipients rc ON rc.id=t.recipient_id WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC LIMIT ${customerId ? 600 : 1500}`, ...p);
  let familiar = [], trail = [], analysis = null;
  if (customerId) {
    const c = one('SELECT * FROM customers WHERE id=?', customerId);
    familiar = familiarLocations(c, all('SELECT * FROM transactions WHERE customer_id=?', customerId));
    trail = points.slice(0, 25).reverse();
  }
  if (focus) {
    const loc = focus.analysis?.location || null;
    analysis = { tx: { ...focus, signals: focus.signals.filter((s) => s.key === 'location') }, location: loc,
      familiarDistanceKm: loc?.distanceKm ?? null, previous: loc?.prev ?? null, prevDistanceKm: loc?.prevDistanceKm ?? null };
  }
  const suspiciousMoves = [];
  const byCust = {};
  for (const pt of [...points].reverse()) {
    const prev = byCust[pt.customer_id];
    if (prev) { const d = haversineKm(prev, pt); const hrs = (pt.created_at - prev.created_at) / HOUR; if (d > 300 && hrs < 6) suspiciousMoves.push({ from: prev, to: pt, km: Math.round(d), hours: +hrs.toFixed(2) }); }
    byCust[pt.customer_id] = pt;
  }
  return { points, familiar, trail, analysis, suspiciousMoves: suspiciousMoves.slice(-20).reverse(), customerId };
}));

/* ---------------- scam pattern timeline ---------------- */
export const timeline = Router();
timeline.get('/', wrap((req) => {
  const customerId = req.user.role === 'family' ? req.user.customer_id : num(req.query.customer, null);
  const days = Math.min(30, Math.max(1, num(req.query.days, 7)));
  const from = Date.now() - days * DAY;
  const p = [from]; let w = 't.created_at >= ?';
  if (customerId) { w += ' AND t.customer_id = ?'; p.push(customerId); }
  if (req.query.tx) { const t = one('SELECT customer_id, created_at FROM transactions WHERE id=?', req.query.tx); if (t) { w = 't.customer_id = ? AND t.created_at BETWEEN ? AND ?'; p.splice(0, p.length, t.customer_id, t.created_at - DAY, t.created_at + 6 * HOUR); } }
  const txs = all(`${TX_SELECT} WHERE ${w} ORDER BY t.created_at ASC`, ...p).map(txView);
  const events = [];
  const lastToRecipient = {};
  for (const t of txs) {
    const tags = [];
    const sg = Object.fromEntries(t.signals.map((s) => [s.key, s]));
    if (sg.recipient?.contribution >= 10) tags.push({ k: 'new_recipient', label: 'New recipient', evidence: sg.recipient.evidence });
    if (sg.amount?.contribution >= 6) tags.push({ k: 'unusual_amount', label: 'Unusual amount', evidence: sg.amount.evidence });
    if (sg.location?.contribution >= 6) tags.push({ k: 'location_change', label: 'Location change', evidence: sg.location.evidence });
    if (sg.behaviour?.contribution >= 3) tags.push({ k: 'behaviour', label: 'Behavioural deviation', evidence: sg.behaviour.evidence });
    if (sg.velocity?.contribution >= 4) tags.push({ k: 'velocity', label: 'High velocity', evidence: sg.velocity.evidence });
    const key = `${t.customer_id}:${t.recipient_id}`;
    if (lastToRecipient[key] && t.created_at - lastToRecipient[key] < 2 * HOUR) tags.push({ k: 'repeat', label: 'Repeated payment', evidence: `Another payment to ${t.recipient} within ${Math.round((t.created_at - lastToRecipient[key]) / 60e3)} min` });
    lastToRecipient[key] = t.created_at;
    if (t.risk_level === 'high') tags.push({ k: 'alert', label: 'Fraud alert', evidence: t.explanation });
    if (!tags.length && req.query.all !== '1') continue;
    events.push({ id: t.id, at: t.created_at, customer: t.customer, customer_id: t.customer_id, recipient: t.recipient, amount: t.amount, city: t.city, risk_score: t.risk_score, risk_level: t.risk_level, status: t.status, tags, signals: t.signals, explanation: t.explanation,
      audit: all('SELECT at, actor, action FROM audit_log WHERE entity_id=? ORDER BY id', t.id) });
  }
  return { from, days, events: events.reverse(), customerId };
}));

/* ---------------- reports ---------------- */
export const reports = Router();
reports.use(requireRole('analyst', 'admin'));
const REPORTS = {
  fraud: { title: 'Fraud detection report', q: (f, t) => all(`SELECT t.id, datetime(t.created_at/1000,'unixepoch','+330 minutes') AS created_ist, c.name customer, rc.name recipient, t.amount, t.city, t.risk_score, t.risk_level, t.status, t.explanation FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN recipients rc ON rc.id=t.recipient_id WHERE t.risk_level IN ('high','medium') AND t.created_at BETWEEN ? AND ? ORDER BY t.created_at DESC`, f, t) },
  transactions: { title: 'Transaction report', q: (f, t) => all(`SELECT t.id, datetime(t.created_at/1000,'unixepoch','+330 minutes') AS created_ist, c.name customer, rc.name recipient, t.amount, t.channel, t.city, t.location_source, t.risk_score, t.risk_level, t.status, t.payment_ref FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN recipients rc ON rc.id=t.recipient_id WHERE t.created_at BETWEEN ? AND ? ORDER BY t.created_at DESC`, f, t) },
  risk: { title: 'Risk distribution report', q: (f, t) => all(`SELECT date(t.created_at/1000,'unixepoch','+330 minutes') AS day, COUNT(*) total, SUM(t.risk_level='low') low, SUM(t.risk_level='medium') medium, SUM(t.risk_level='high') high, ROUND(AVG(t.risk_score),1) avg_score, ROUND(SUM(t.amount)) volume FROM transactions t WHERE t.created_at BETWEEN ? AND ? GROUP BY day ORDER BY day DESC`, f, t) },
  customers: { title: 'Customer safety report', q: (f, t) => all(`SELECT c.name customer, c.home_city, c.segment, CASE c.family_protection WHEN 1 THEN 'on' ELSE 'off' END family_protection, COUNT(t.id) transactions, SUM(t.risk_level='high') high_risk, SUM(t.status='BLOCKED') blocked, SUM(t.status='RECOVERED') recovered, ROUND(COALESCE(SUM(t.amount),0)) volume FROM customers c LEFT JOIN transactions t ON t.customer_id=c.id AND t.created_at BETWEEN ? AND ? GROUP BY c.id ORDER BY high_risk DESC`, f, t) },
  recovery: { title: 'Recovery report', q: (f, t) => all(`SELECT r.id recovery_id, r.transaction_id, c.name customer, rc.name recipient, tx.amount, r.status, datetime(r.opened_at/1000,'unixepoch','+330 minutes') opened_ist, datetime(r.deadline/1000,'unixepoch','+330 minutes') deadline_ist, datetime(r.decided_at/1000,'unixepoch','+330 minutes') decided_ist, u.name decided_by, r.reversal_ref, r.note FROM recoveries r JOIN transactions tx ON tx.id=r.transaction_id JOIN customers c ON c.id=tx.customer_id JOIN recipients rc ON rc.id=tx.recipient_id LEFT JOIN users u ON u.id=r.decided_by WHERE r.opened_at BETWEEN ? AND ? ORDER BY r.opened_at DESC`, f, t) },
  investigations: { title: 'Investigation report', q: (f, t) => all(`SELECT i.id investigation_id, i.transaction_id, c.name customer, tx.amount, tx.risk_score, i.priority, i.status, i.decision, u.name assignee, datetime(i.opened_at/1000,'unixepoch','+330 minutes') opened_ist, (SELECT COUNT(*) FROM analyst_notes n WHERE n.investigation_id=i.id) notes FROM investigations i JOIN transactions tx ON tx.id=i.transaction_id JOIN customers c ON c.id=tx.customer_id LEFT JOIN users u ON u.id=i.assignee_id WHERE i.opened_at BETWEEN ? AND ? ORDER BY i.opened_at DESC`, f, t) },
};
reports.get('/', wrap(() => Object.entries(REPORTS).map(([id, r]) => ({ id, title: r.title }))));
reports.get('/:type', (req, res, next) => {
  try {
    const R = REPORTS[req.params.type];
    if (!R) throw new HttpError(404, 'Unknown report', 'NOT_FOUND');
    const to = num(req.query.to, Date.now()), from = num(req.query.from, to - 30 * DAY);
    const rows = R.q(from, to);
    audit(ctxOf(req.user), { action: `Report generated: ${R.title} (${req.query.format || 'json'})`, category: 'report', entityType: 'report', entityId: req.params.type });
    if (req.query.format === 'csv') {
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
      res.set('content-type', 'text/csv; charset=utf-8').set('content-disposition', `attachment; filename="guardian-${req.params.type}-report.csv"`);
      return res.send([cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
    }
    res.json({ title: R.title, from, to, generatedAt: Date.now(), rows });
  } catch (e) { next(e); }
});
