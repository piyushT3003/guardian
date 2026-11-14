// Seeds the Guardian database with a reproducible 30-day dataset. Every seeded transaction is
// passed through the real ingestion → fraud engine → decision pipeline (with a historical clock),
// and seeded outcomes are produced by calling the same approval / recovery / investigation services.
import fs from 'node:fs';
import { one, run, tx, DB_FILE } from './db.js';
import { hashPassword } from './lib/auth.js';
import { cityByName } from './lib/geo.js';
import { SYSTEM } from './services/core.js';
import { ingest, decideApproval, initiateRecovery, declineRecovery, investigationDecision, sweepDeadlines } from './services/operations.js';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261109);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const CUSTOMERS = [
  { name: 'Ramesh Sharma', email: 'ramesh.sharma@example.in', city: 'Bengaluru', alt: 'Mysuru', base: 1200, sigma: 0.8, segment: 'Senior citizen', fam: ['Priya Sharma', 'Daughter', 'priya@guardian.example'],
    recips: ['Swiggy', 'Airtel Recharge', 'BESCOM Electricity', 'Apollo Pharmacy', 'BigBasket', 'Sharma Kirana Store', 'Ola'] },
  { name: 'Meena Krishnan', email: 'meena.k@example.in', city: 'Bengaluru', alt: 'Chennai', base: 900, sigma: 0.7, segment: 'Retail', fam: ['Lakshmi Krishnan', 'Sister', 'lakshmi@guardian.example'],
    recips: ['Swiggy', 'Zomato', 'Myntra', 'Uber', 'Jio Recharge', 'BookMyShow'] },
  { name: 'Sunita Rao', email: 'sunita.rao@example.in', city: 'Pune', alt: 'Mumbai', base: 1800, sigma: 0.75, segment: 'Senior citizen', fam: ['Arjun Rao', 'Son', 'arjun@guardian.example'],
    recips: ['BigBasket', 'Amazon', 'MSEDCL Electricity', 'Apollo Pharmacy', 'Uber', 'Rao Medicals'] },
  { name: 'Vikram Mehta', email: 'vikram.mehta@example.in', city: 'Mumbai', alt: 'Pune', base: 4200, sigma: 0.9, segment: 'Premium', fam: ['Kavya Mehta', 'Spouse', 'kavya@guardian.example'],
    recips: ['Amazon', 'Flipkart', 'IRCTC', 'Zomato', 'Uber', 'Netflix', 'Croma'] },
  { name: 'Farhan Qureshi', email: 'farhan.q@example.in', city: 'Hyderabad', alt: 'Bengaluru', base: 2500, sigma: 0.8, segment: 'Retail', fam: ['Ayesha Qureshi', 'Spouse', 'ayesha@guardian.example'],
    recips: ['Swiggy', 'Amazon', 'TSSPDCL Electricity', 'Ola', 'Paradise Biryani', 'Jio Recharge'] },
  { name: 'Anjali Iyer', email: 'anjali.iyer@example.in', city: 'Chennai', alt: 'Bengaluru', base: 1500, sigma: 0.7, segment: 'Retail', fam: ['Ravi Iyer', 'Father', 'ravi@guardian.example'],
    recips: ['Zomato', 'Amazon', 'TNEB Electricity', 'Uber', 'Saravana Stores', 'Airtel Recharge'] },
  { name: 'Harpreet Singh', email: 'harpreet.s@example.in', city: 'Chandigarh', alt: 'New Delhi', base: 3000, sigma: 0.85, segment: 'SME', fam: null,
    recips: ['Amazon', 'IRCTC', 'Zomato', 'Punjab Traders', 'Airtel Recharge', 'Ola'] },
  { name: 'Debashis Ghosh', email: 'debashis.g@example.in', city: 'Kolkata', alt: 'Bhubaneswar', base: 1100, sigma: 0.7, segment: 'Senior citizen', fam: ['Mitali Ghosh', 'Daughter', 'mitali@guardian.example'],
    recips: ['BigBasket', 'CESC Electricity', 'Apollo Pharmacy', 'Jio Recharge', 'Uber', 'Ghosh Sweets'] },
];
const SCAM_RECIPIENTS = ['QuickLoan Services', 'KYC Update Desk', 'CryptoGain Pro', 'Lucky Draw Rewards', 'Parcel Customs Fee', 'ElectroBill Refund', 'InstaCash Wallet', 'Prime Rewards Hub'];
const FAR = ['New Delhi', 'Kolkata', 'Guwahati', 'Jaipur', 'Lucknow', 'Patna', 'Dubai', 'Ahmedabad', 'Mumbai', 'Hyderabad'];

export function seed({ reset = false } = {}) {
  if (!reset && one('SELECT COUNT(*) n FROM users').n > 0) return false;
  if (reset) {
    for (const t of ['webhook_deliveries', 'webhooks', 'demo_runs', 'idempotency', 'system_events', 'settings', 'audit_log', 'notifications', 'analyst_notes', 'investigations', 'recoveries', 'approvals', 'transactions', 'recipients', 'family_members', 'users', 'customers']) run(`DELETE FROM ${t}`);
  }
  const NOW = Date.now();
  const t0 = NOW - 30 * 864e5;
  const pw = hashPassword(process.env.GUARDIAN_DEMO_PASSWORD || 'guardian123');
  run('INSERT INTO users(email,name,title,role,password_hash,created_at) VALUES (?,?,?,?,?,?)', 'aarav@guardian.example', 'Aarav Sharma', 'Security Analyst', 'analyst', pw, t0);
  run('INSERT INTO users(email,name,title,role,password_hash,created_at) VALUES (?,?,?,?,?,?)', 'neha@guardian.example', 'Neha Kapoor', 'Operations Administrator', 'admin', pw, t0);

  const famUsers = {};
  for (const c of CUSTOMERS) {
    const home = cityByName(c.city);
    const r = run('INSERT INTO customers(name,email,phone,segment,home_city,home_lat,home_lng,baseline_amount,baseline_sigma,active_hours,family_protection,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      c.name, c.email, `+91 9${Math.floor(rnd() * 1e9).toString().padStart(9, '0')}`, c.segment, c.city, home.lat, home.lng, c.base, c.sigma, '08-22', c.fam ? 1 : 0, t0 - 400 * 864e5);
    c.id = Number(r.lastInsertRowid);
    if (c.fam) {
      const u = run('INSERT INTO users(email,name,title,role,password_hash,customer_id,created_at) VALUES (?,?,?,?,?,?,?)', c.fam[2], c.fam[0], `Trusted family · ${c.fam[1]} of ${c.name.split(' ')[0]}`, 'family', pw, c.id, t0);
      run('INSERT INTO family_members(customer_id,user_id,name,relation,phone,created_at) VALUES (?,?,?,?,?,?)', c.id, Number(u.lastInsertRowid), c.fam[0], c.fam[1], `+91 98${Math.floor(rnd() * 1e8).toString().padStart(8, '0')}`, t0);
      famUsers[c.id] = one('SELECT * FROM users WHERE email=?', c.fam[2]);
    }
    for (const name of c.recips) if (!one('SELECT 1 FROM recipients WHERE name=?', name)) run('INSERT INTO recipients(name,category,vpa,first_seen) VALUES (?,?,?,?)', name, 'Merchant', `${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}@upi`, t0 - 500 * 864e5);
  }
  const admin = one("SELECT * FROM users WHERE role='admin'");
  const analyst = one("SELECT * FROM users WHERE role='analyst'");

  // Build a chronological event plan.
  const plan = [];
  for (const c of CUSTOMERS) {
    for (let d = 0; d < 30; d++) {
      const n = Math.floor(1 + rnd() * 3);
      const away = rnd() < 0.12; // trip to the customer's second familiar city
      for (let i = 0; i < n; i++) {
        const hour = 8 + Math.floor(rnd() * 14);
        const at = t0 + d * 864e5 + (hour - 5.5) * 3.6e6 + Math.floor(rnd() * 3.6e6);
        plan.push({ at, c, kind: 'normal', city: away ? c.alt : c.city });
      }
    }
  }
  // Fraud attempts spread across the period (and a couple in the last hours).
  const fraudDays = [27, 25, 24, 22, 20, 19, 17, 15, 14, 12, 11, 9, 8, 7, 5, 4, 3, 2, 1.5, 1, 0.6, 0.35];
  fraudDays.forEach((ago, i) => {
    const c = CUSTOMERS[i % CUSTOMERS.length];
    const at = NOW - ago * 864e5 + Math.floor(rnd() * 3e6);
    plan.push({ at: at - 9 * 60e3, c, kind: 'normal', city: c.city });
    plan.push({ at, c, kind: 'fraud', city: pick(FAR.filter((f) => f !== c.city && f !== c.alt)), idx: i });
  });
  // A few open items left for live handling (not auto-resolved by the seed).
  const H = CUSTOMERS.find((c) => c.fam === null), V = CUSTOMERS[3], F = CUSTOMERS[4], D = CUSTOMERS[7];
  plan.push({ at: NOW - 38 * 60e3, c: H, kind: 'fraud', city: 'Kolkata', idx: 3 });
  plan.push({ at: NOW - 26 * 60e3, c: V, kind: 'unusual', city: 'Jaipur', live: true });
  plan.push({ at: NOW - 14 * 60e3, c: F, kind: 'unusual', city: 'Chennai', live: true });
  plan.push({ at: NOW - 4 * 60e3, c: D, kind: 'fraud', city: 'Guwahati', idx: 6 });
  // Medium-risk unusual-but-legit payments.
  for (let i = 0; i < 26; i++) { const c = pick(CUSTOMERS); plan.push({ at: t0 + rnd() * 29 * 864e5, c, kind: 'unusual', city: rnd() < 0.5 ? c.alt : pick(FAR) }); }
  plan.sort((a, b) => a.at - b.at);

  const ctxAt = (at, actor = SYSTEM) => ({ now: Math.round(at), actor, live: false });
  tx(() => {
    for (const p of plan) {
      if (p.at > NOW - 60e3) continue;
      const city = cityByName(p.city);
      const jit = () => (rnd() - 0.5) * 0.08;
      let amount, recipient;
      if (p.kind === 'normal') { amount = Math.max(49, Math.round(p.c.base * Math.exp(gauss() * p.c.sigma * 0.8))); recipient = pick(p.c.recips); }
      if (p.kind === 'unusual') { amount = Math.round(p.c.base * (3 + rnd() * 4)); recipient = rnd() < 0.5 ? pick(['Croma', 'MakeMyTrip', 'Tanishq', 'Reliance Digital']) : pick(p.c.recips); }
      if (p.kind === 'fraud') { amount = Math.round(p.c.base * (10 + rnd() * 30) / 100) * 100 - 1; recipient = SCAM_RECIPIENTS[p.idx % SCAM_RECIPIENTS.length] + (p.idx >= SCAM_RECIPIENTS.length ? ` ${p.idx}` : ''); }
      const t = ingest(ctxAt(p.at), { customer_id: p.c.id, recipient, amount, lat: city.lat + jit(), lng: city.lng + jit(), city: city.city, region: city.region,
        accuracy_m: Math.round(10 + rnd() * 40), location_source: 'historical', recipient_category: p.kind === 'fraud' ? 'Unverified' : 'Merchant' });
      resolveSeeded(t, p, ctxAt, admin, analyst, famUsers, NOW);
    }
    sweepDeadlines(ctxAt(NOW));
    run('INSERT INTO system_events(at,level,source,message) VALUES (?,?,?,?)', NOW, 'info', 'seed', `Seeded ${one('SELECT COUNT(*) n FROM transactions').n} transactions through the live pipeline`);
  });
  return true;
}

function resolveSeeded(t, p, ctxAt, admin, analyst, famUsers, NOW) {
  const recent = NOW - t.created_at < 45 * 60e3; // leave very recent items for live handling
  if (recent) return;
  const asActor = (u) => ({ id: u.id, name: u.name, role: u.role });
  const after = (min, u) => ctxAt(t.created_at + min * 60e3, u ? asActor(u) : undefined);
  if (t.status === 'PENDING_FAMILY_APPROVAL') {
    const a = one('SELECT * FROM approvals WHERE transaction_id=?', t.id);
    const fu = famUsers[t.customer_id];
    const approve = rnd() < 0.3;
    decideApproval(after(2 + rnd() * 6, fu), a.id, approve ? 'APPROVE' : 'HOLD', fu, approve ? 'I know this merchant' : 'Dad did not make this payment');
    const after2 = one('SELECT * FROM transactions WHERE id=?', t.id);
    if (after2.status === 'RECOVERY_PENDING') {
      const rec = one('SELECT * FROM recoveries WHERE transaction_id=?', t.id);
      const r = rnd();
      const c = ctxAt(rec.opened_at + (1 + rnd() * 2) * 60e3, asActor(admin));
      if (r < 0.6) initiateRecovery(c, rec.id, admin, 'Customer confirmed scam call');
      else if (r < 0.85) declineRecovery(c, rec.id, admin, 'Customer confirmed legitimate purchase');
    }
    if (after2.status === 'ON_HOLD') {
      const inv = one('SELECT * FROM investigations WHERE transaction_id=?', t.id);
      investigationDecision(after(30, analyst), inv.id, 'BLOCK', analyst, 'Family confirmed fraud attempt; recipient reported.');
    }
  } else if (t.status === 'ON_HOLD' || t.status === 'UNDER_REVIEW') {
    const inv = one('SELECT * FROM investigations WHERE transaction_id=?', t.id);
    const c = after(10 + rnd() * 40, analyst);
    investigationDecision(c, inv.id, 'START', analyst);
    const legit = p.kind !== 'fraud' && rnd() < 0.8;
    investigationDecision(after(60, analyst), inv.id, legit ? 'RELEASE' : 'BLOCK', analyst,
      legit ? 'Verified with customer by phone — legitimate purchase.' : 'Customer did not recognise payment; blocked.');
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const reset = process.argv.includes('--reset');
  const did = seed({ reset });
  console.log(did ? `Seeded ${one('SELECT COUNT(*) n FROM transactions').n} transactions into ${DB_FILE}` : 'Database already seeded (use --reset).');
}
