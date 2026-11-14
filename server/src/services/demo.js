// Two flagship demo scenarios. Each step calls the real ingestion pipeline; decisions are made
// by real authenticated users (family member, administrator) through the normal endpoints.
import crypto from 'node:crypto';
import { one, all, run, HttpError } from '../db.js';
import { ingest } from './operations.js';
import { audit } from './core.js';
import { cityByName } from '../lib/geo.js';

const SCAM_SUFFIX = () => crypto.randomBytes(2).toString('hex').toUpperCase();

export const SCENARIOS = {
  1: {
    title: 'Family-assisted fraud prevention',
    customerEmail: 'ramesh.sharma@example.in',
    familyEmail: 'priya@guardian.example',
    build: (sfx) => [
      { recipient: 'Swiggy', amount: 349, city: 'Bengaluru', note: 'Routine food order at a familiar location' },
      { recipient: 'Airtel Recharge', amount: 599, city: 'Bengaluru', note: 'Known biller, typical amount' },
      { recipient: `TechMart Online ${sfx}`, amount: 9999, city: 'Hyderabad', category: 'Merchant', note: 'New recipient, ~7× typical amount, 500 km away minutes later', focus: true },
    ],
  },
  2: {
    title: 'Fraud recovery after mistaken approval',
    customerEmail: 'sunita.rao@example.in',
    familyEmail: 'arjun@guardian.example',
    build: (sfx) => [
      { recipient: 'BigBasket', amount: 1240, city: 'Pune', note: 'Routine grocery order' },
      { recipient: 'Amazon', amount: 2499, city: 'Pune', note: 'Known merchant' },
      { recipient: `NewPay Wallet ${sfx}`, amount: 25000, city: 'New Delhi', category: 'Wallet', note: 'Brand-new wallet, 14× typical amount, 1,170 km away', focus: true },
    ],
  },
};

const jitter = (v) => v + (Math.random() - 0.5) * 0.02;

export function startRun(ctx, scenario, user) {
  const S = SCENARIOS[scenario];
  if (!S) throw new HttpError(400, 'Scenario must be 1 or 2', 'VALIDATION');
  const customer = one('SELECT * FROM customers WHERE email=?', S.customerEmail);
  const id = `RUN-${scenario}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const steps = S.build(SCAM_SUFFIX());
  run('INSERT INTO demo_runs(id,scenario,customer_id,started_by,started_at,step) VALUES (?,?,?,?,?,?)', id, scenario, customer.id, user.id, ctx.now, JSON.stringify({ steps, index: 0 }));
  audit(ctx, { action: `Demo scenario ${scenario} started (${S.title})`, category: 'demo', entityType: 'demo_run', entityId: id });
  return getRun(id);
}

export function nextStep(ctx, runId) {
  const r = one('SELECT * FROM demo_runs WHERE id=?', runId);
  if (!r) throw new HttpError(404, 'Demo run not found', 'NOT_FOUND');
  const st = JSON.parse(r.step);
  if (st.index >= st.steps.length) throw new HttpError(409, 'All transactions in this sequence have been ingested', 'DONE');
  const s = st.steps[st.index];
  const c = cityByName(s.city);
  const t = ingest(ctx, { customer_id: r.customer_id, recipient: s.recipient, recipient_category: s.category, amount: s.amount,
    lat: jitter(c.lat), lng: jitter(c.lng), city: c.city, region: c.region, accuracy_m: 25, location_source: 'demo', scenario: `S${r.scenario}`, scenario_run: r.id });
  s.txId = t.id;
  st.index++;
  run('UPDATE demo_runs SET step=?, focus_tx=COALESCE(?, focus_tx) WHERE id=?', JSON.stringify(st), s.focus ? t.id : null, r.id);
  return getRun(r.id);
}

export function getRun(id) {
  const r = one('SELECT * FROM demo_runs WHERE id=?', id);
  if (!r) throw new HttpError(404, 'Demo run not found', 'NOT_FOUND');
  const st = JSON.parse(r.step);
  const S = SCENARIOS[r.scenario];
  const txs = st.steps.filter((s) => s.txId).map((s) => one('SELECT id,status,risk_score,risk_level,amount,city,explanation FROM transactions WHERE id=?', s.txId));
  const focus = r.focus_tx ? one('SELECT * FROM transactions WHERE id=?', r.focus_tx) : null;
  const approval = focus ? one('SELECT * FROM approvals WHERE transaction_id=?', focus.id) : null;
  const recovery = focus ? one('SELECT * FROM recoveries WHERE transaction_id=?', focus.id) : null;
  const family = one('SELECT id, name, email FROM users WHERE email=?', S.familyEmail);
  const customer = one('SELECT id, name, home_city FROM customers WHERE id=?', r.customer_id);
  const notifications = focus ? all('SELECT id, channel, title, created_at FROM notifications WHERE transaction_id=? ORDER BY id', focus.id) : [];
  const auditRows = all(`SELECT id, at, actor, action, category FROM audit_log WHERE entity_id IN (${st.steps.map(() => '?').join(',')}) ORDER BY id`, ...st.steps.map((s) => s.txId || '-'));
  return { id: r.id, scenario: r.scenario, title: S.title, startedAt: r.started_at, customer, family, steps: st.steps, index: st.index, transactions: txs, focus, approval, recovery, notifications, audit: auditRows, now: Date.now() };
}

export const listRuns = () => all('SELECT id, scenario, focus_tx, started_at FROM demo_runs ORDER BY started_at DESC LIMIT 20');
