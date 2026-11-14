// Guardian operations: ingestion → fraud analysis → risk decision → family approval →
// payment simulation → post-settlement recovery. Each step is persisted and audited.
import crypto from 'node:crypto';
import { one, all, run, tx, HttpError } from '../db.js';
import { audit, notify, getSettings, systemEvent, familyUserFor, dispatchWebhooks } from './core.js';
import { transition } from './stateMachine.js';
import { scoreTransaction } from './fraudEngine.js';
import { reverseGeocode } from '../lib/geo.js';
import { emit } from '../lib/events.js';

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const ref = (p) => `${p}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const later = (ctx, ms, fn) => {
  if (!ctx.live || ms <= 0) return fn({ ...ctx });
  setTimeout(() => { try { fn({ ...ctx, now: Date.now() }); } catch (e) { systemEvent('error', 'processing', e.message); console.error(e); } }, ms);
};

/* ---------------- ingestion ---------------- */
export function ingest(ctx, input) {
  const customer = one('SELECT * FROM customers WHERE id = ?', input.customer_id);
  if (!customer) throw new HttpError(400, 'Unknown customer', 'VALIDATION');
  const amount = Number(input.amount);
  if (!(amount > 0 && amount < 1e8)) throw new HttpError(400, 'Amount must be a positive number', 'VALIDATION');
  const rname = String(input.recipient || '').trim();
  if (!rname) throw new HttpError(400, 'Recipient is required', 'VALIDATION');
  const source = input.location_source || 'historical';
  if (!['historical', 'demo', 'live_gps', 'seed'].includes(source)) throw new HttpError(400, 'Invalid location_source', 'VALIDATION');
  const hasLoc = Number.isFinite(input.lat) && Number.isFinite(input.lng);

  return tx(() => {
    let recip = one('SELECT * FROM recipients WHERE name = ?', rname);
    if (!recip) {
      run('INSERT INTO recipients(name, category, vpa, first_seen) VALUES (?,?,?,?)', rname, input.recipient_category || 'Individual',
        input.vpa || `${rname.toLowerCase().replace(/[^a-z0-9]+/g, '')}@upi`, ctx.now);
      recip = one('SELECT * FROM recipients WHERE name = ?', rname);
    }
    const seq = (one('SELECT MAX(seq) m FROM transactions').m || 784000) + 1;
    const id = `TXN${seq}`;
    const place = hasLoc ? (input.city ? { city: input.city, region: input.region || '' } : reverseGeocode(input.lat, input.lng)) : { city: null, region: null };
    run(`INSERT INTO transactions(id,seq,customer_id,recipient_id,amount,channel,lat,lng,city,region,accuracy_m,location_source,status,scenario,scenario_run,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, seq, customer.id, recip.id, amount, input.channel || 'UPI',
      hasLoc ? input.lat : null, hasLoc ? input.lng : null, place.city, place.region, input.accuracy_m ?? null, source, 'RECEIVED',
      input.scenario ?? null, input.scenario_run ?? null, ctx.now, ctx.now);
    audit(ctx, { action: 'Transaction ingested', category: 'ingestion', entityType: 'transaction', entityId: id, next: 'RECEIVED',
      details: { customer: customer.name, recipient: rname, amount, location: place.city, source } });

    transition(ctx, id, 'ANALYSING', {}, { action: 'Fraud analysis started', category: 'analysis' });
    const t = one('SELECT * FROM transactions WHERE id = ?', id);
    const r = scoreTransaction(t, ctx.now);
    run('UPDATE transactions SET risk_score=?, risk_level=?, signals=?, explanation=?, recommended_action=?, analysed_at=? WHERE id=?',
      r.riskScore, r.riskLevel, JSON.stringify({ signals: r.signals, context: r.context }), r.explanation, r.recommendedAction, ctx.now, id);
    audit(ctx, { action: `Fraud analysis completed — score ${r.riskScore} (${r.riskLevel})`, category: 'analysis', entityType: 'transaction', entityId: id,
      details: { score: r.riskScore, signals: Object.fromEntries(r.signals.map((s) => [s.key, s.contribution])) } });
    decide(ctx, id, customer, r);
    return one('SELECT * FROM transactions WHERE id = ?', id);
  });
}

function decide(ctx, id, customer, r) {
  const S = getSettings();
  const t = one('SELECT t.*, rc.name recipient FROM transactions t JOIN recipients rc ON rc.id=t.recipient_id WHERE t.id=?', id);
  const summary = `${customer.name} → ${t.recipient} · ${inr(t.amount)}${t.city ? ` · ${t.city}` : ''}`;
  if (r.riskLevel === 'high') {
    const fm = one('SELECT * FROM family_members WHERE customer_id = ? ORDER BY id LIMIT 1', customer.id);
    openInvestigation(ctx, id, 'high');
    if (customer.family_protection && S.policies.holdHighRiskForFamily && fm) {
      transition(ctx, id, 'PENDING_FAMILY_APPROVAL', {}, { action: 'Risk decision: hold for family approval', category: 'decision', details: { score: r.riskScore } });
      createApproval(ctx, id, customer, fm, summary, r);
    } else {
      transition(ctx, id, 'ON_HOLD', {}, { action: 'Risk decision: payment held for analyst', category: 'decision', details: { score: r.riskScore } });
    }
    notify(ctx, { channel: 'security', severity: 'critical', title: `High-risk transaction detected · score ${r.riskScore}`, body: `${summary}. ${r.explanation}`, transactionId: id, recipientRole: 'analyst', action: 'investigate' });
    if (ctx.live) dispatchWebhooks('transaction.high_risk', { id, score: r.riskScore });
  } else if (r.riskLevel === 'medium' && S.policies.reviewMediumRisk) {
    openInvestigation(ctx, id, 'medium');
    transition(ctx, id, 'UNDER_REVIEW', {}, { action: 'Risk decision: analyst review', category: 'decision', details: { score: r.riskScore } });
    notify(ctx, { channel: 'security', severity: 'warning', title: `Transaction routed to review · score ${r.riskScore}`, body: summary, transactionId: id, recipientRole: 'analyst', action: 'investigate' });
  } else {
    transition(ctx, id, 'COMPLETED', { completed_at: ctx.now, payment_ref: ref('PSIM') }, { action: 'Risk decision: allowed · payment settled', category: 'payment', details: { score: r.riskScore } });
  }
}

/* ---------------- family approval ---------------- */
function createApproval(ctx, id, customer, fm, summary, r) {
  const deadline = ctx.now + getSettings().policies.approvalWindowSec * 1000;
  run('INSERT INTO approvals(transaction_id, customer_id, family_member_id, status, created_at, deadline) VALUES (?,?,?,?,?,?)', id, customer.id, fm.id, 'PENDING', ctx.now, deadline);
  audit(ctx, { action: `Family approval requested from ${fm.name}`, category: 'approval', entityType: 'transaction', entityId: id, details: { familyMember: fm.name, deadline } });
  notify(ctx, { channel: 'family', severity: 'critical', title: `Approval needed: ${inr(r ? one('SELECT amount FROM transactions WHERE id=?', id).amount : 0)} payment by ${customer.name.split(' ')[0]}`,
    body: `${summary}. Guardian is holding this payment until you approve it.`, transactionId: id, recipientUserId: fm.user_id, action: 'review_approval' });
}

export function decideApproval(ctx, approvalId, decision, user, note = null) {
  if (!['APPROVE', 'HOLD'].includes(decision)) throw new HttpError(400, 'decision must be APPROVE or HOLD', 'VALIDATION');
  const result = tx(() => {
    const a = one('SELECT a.*, fm.user_id fm_user, fm.name fm_name FROM approvals a JOIN family_members fm ON fm.id = a.family_member_id WHERE a.id = ?', approvalId);
    if (!a) throw new HttpError(404, 'Approval not found', 'NOT_FOUND');
    if (user.role !== 'family' || a.fm_user !== user.id) throw new HttpError(403, 'Only the designated trusted family member can decide this approval', 'FORBIDDEN');
    if (a.status !== 'PENDING') throw new HttpError(409, `Approval already ${a.status.toLowerCase()}`, 'ALREADY_DECIDED');
    if (ctx.now > a.deadline) throw new HttpError(410, 'Approval window has expired', 'EXPIRED');
    const status = decision === 'APPROVE' ? 'APPROVED' : 'HELD';
    const upd = run('UPDATE approvals SET status=?, decided_at=?, decided_by=?, note=? WHERE id=? AND status=?', status, ctx.now, user.id, note, a.id, 'PENDING');
    if (upd.changes !== 1) throw new HttpError(409, 'Approval already decided', 'ALREADY_DECIDED');
    if (decision === 'APPROVE') {
      transition(ctx, a.transaction_id, 'APPROVED', {}, { action: `Family decision: ${a.fm_name} approved payment`, category: 'family' });
      transition(ctx, a.transaction_id, 'PROCESSING', {}, { action: 'Payment submitted to payment simulator', category: 'payment' });
    } else {
      transition(ctx, a.transaction_id, 'ON_HOLD', {}, { action: `Family decision: ${a.fm_name} kept payment on hold`, category: 'family' });
    }
    notify(ctx, { channel: 'security', severity: decision === 'APPROVE' ? 'warning' : 'info',
      title: `${a.fm_name} ${decision === 'APPROVE' ? 'approved' : 'kept on hold'} ${a.transaction_id}`, body: note || '', transactionId: a.transaction_id, recipientRole: 'analyst', action: 'view_transaction' });
    return { approval: one('SELECT * FROM approvals WHERE id=?', a.id), txId: a.transaction_id };
  });
  if (decision === 'APPROVE') later(ctx, getSettings().demo.settlementDelayMs, (c) => settle(c, result.txId));
  return result.approval;
}

/** Payment simulator settlement. Settles PROCESSING → COMPLETED then runs post-settlement checks. */
export function settle(ctx, txId) {
  tx(() => {
    transition(ctx, txId, 'COMPLETED', { completed_at: ctx.now, payment_ref: ref('PSIM') }, { action: 'Payment simulator confirmed settlement', category: 'payment' });
    postSettlement(ctx, txId);
  });
}

function postSettlement(ctx, txId) {
  const S = getSettings();
  const t = one('SELECT t.*, c.name customer, rc.name recipient FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN recipients rc ON rc.id=t.recipient_id WHERE t.id=?', txId);
  if (t.risk_score < S.thresholds.autoRecovery) return;
  const deadline = t.completed_at + S.policies.recoveryWindowSec * 1000;
  transition(ctx, txId, 'RECOVERY_PENDING', {}, { action: `Recovery request raised automatically (score ${t.risk_score} ≥ ${S.thresholds.autoRecovery})`, category: 'recovery' });
  run('INSERT INTO recoveries(transaction_id,status,reason,opened_at,deadline) VALUES (?,?,?,?,?)', txId, 'OPEN',
    `Settled payment scored ${t.risk_score}, above the auto-recovery threshold of ${S.thresholds.autoRecovery}.`, ctx.now, deadline);
  notify(ctx, { channel: 'recovery', severity: 'critical', title: `Recovery window open · ${txId}`, body: `${t.customer} → ${t.recipient} · ${inr(t.amount)}. Administrator decision required within ${Math.round(S.policies.recoveryWindowSec / 60)} minutes.`, transactionId: txId, recipientRole: 'admin', action: 'open_recovery' });
  const fm = one('SELECT * FROM family_members WHERE customer_id=? ORDER BY id LIMIT 1', t.customer_id);
  if (fm) notify(ctx, { channel: 'family', severity: 'warning', title: `Guardian opened a recovery request for ${txId}`, body: `The payment you approved matches a high-risk pattern. The security team can attempt recovery for the next ${Math.round(S.policies.recoveryWindowSec / 60)} minutes.`, transactionId: txId, recipientUserId: fm.user_id });
}

/* ---------------- recovery ---------------- */
export function initiateRecovery(ctx, recoveryId, user, note = null) {
  const r = tx(() => {
    const rec = one('SELECT * FROM recoveries WHERE id=?', recoveryId);
    if (!rec) throw new HttpError(404, 'Recovery not found', 'NOT_FOUND');
    if (rec.status !== 'OPEN') throw new HttpError(409, `Recovery already ${rec.status.toLowerCase()}`, 'ALREADY_DECIDED');
    if (ctx.now > rec.deadline) throw new HttpError(410, 'Recovery window has expired', 'EXPIRED');
    const upd = run('UPDATE recoveries SET status=?, decided_at=?, decided_by=?, note=? WHERE id=? AND status=?', 'INITIATED', ctx.now, user.id, note, rec.id, 'OPEN');
    if (upd.changes !== 1) throw new HttpError(409, 'Recovery already decided', 'ALREADY_DECIDED');
    transition(ctx, rec.transaction_id, 'RECOVERING', {}, { action: `Administrator ${user.name} initiated payment recovery`, category: 'admin' });
    return rec;
  });
  later(ctx, getSettings().demo.reversalDelayMs, (c) => completeReversal(c, r.id));
  return one('SELECT * FROM recoveries WHERE id=?', r.id);
}

function completeReversal(ctx, recoveryId) {
  tx(() => {
    const rec = one('SELECT * FROM recoveries WHERE id=?', recoveryId);
    if (rec.status !== 'INITIATED') return;
    const fail = Math.random() < getSettings().demo.reversalFailureRate;
    const status = fail ? 'FAILED' : 'RECOVERED';
    run('UPDATE recoveries SET status=?, completed_at=?, reversal_ref=? WHERE id=? AND status=?', status, ctx.now, fail ? null : ref('REV'), rec.id, 'INITIATED');
    transition(ctx, rec.transaction_id, fail ? 'RECOVERY_FAILED' : 'RECOVERED', {}, { action: fail ? 'Payment simulator rejected reversal' : 'Payment simulator confirmed reversal — funds recovered', category: 'recovery' });
    notify(ctx, { channel: 'recovery', severity: fail ? 'critical' : 'success', title: fail ? `Recovery failed · ${rec.transaction_id}` : `Funds recovered · ${rec.transaction_id}`, body: '', transactionId: rec.transaction_id, recipientRole: 'admin', action: 'view_transaction' });
  });
}

export function declineRecovery(ctx, recoveryId, user, note = null) {
  return tx(() => {
    const rec = one('SELECT * FROM recoveries WHERE id=?', recoveryId);
    if (!rec) throw new HttpError(404, 'Recovery not found', 'NOT_FOUND');
    if (rec.status !== 'OPEN') throw new HttpError(409, `Recovery already ${rec.status.toLowerCase()}`, 'ALREADY_DECIDED');
    if (ctx.now > rec.deadline) throw new HttpError(410, 'Recovery window has expired', 'EXPIRED');
    const upd = run('UPDATE recoveries SET status=?, decided_at=?, decided_by=?, note=? WHERE id=? AND status=?', 'DECLINED', ctx.now, user.id, note, rec.id, 'OPEN');
    if (upd.changes !== 1) throw new HttpError(409, 'Recovery already decided', 'ALREADY_DECIDED');
    transition(ctx, rec.transaction_id, 'RECOVERY_DECLINED', {}, { action: `Administrator ${user.name} declined recovery`, category: 'admin', details: { note } });
    notify(ctx, { channel: 'recovery', severity: 'info', title: `Recovery declined · ${rec.transaction_id}`, body: note || '', transactionId: rec.transaction_id, recipientRole: 'admin' });
    return one('SELECT * FROM recoveries WHERE id=?', rec.id);
  });
}

/** Expire approvals and recovery windows whose backend deadline has passed. */
export function sweepDeadlines(ctx) {
  for (const rec of all("SELECT * FROM recoveries WHERE status='OPEN' AND deadline < ?", ctx.now)) {
    tx(() => {
      const u = run("UPDATE recoveries SET status='EXPIRED', completed_at=? WHERE id=? AND status='OPEN'", ctx.now, rec.id);
      if (u.changes) {
        transition(ctx, rec.transaction_id, 'RECOVERY_EXPIRED', {}, { action: 'Recovery window expired — action disabled', category: 'recovery' });
        notify(ctx, { channel: 'recovery', severity: 'warning', title: `Recovery window expired · ${rec.transaction_id}`, body: 'No administrator decision was recorded before the deadline.', transactionId: rec.transaction_id, recipientRole: 'admin' });
      }
    });
  }
  for (const a of all("SELECT * FROM approvals WHERE status='PENDING' AND deadline < ?", ctx.now)) {
    tx(() => {
      const u = run("UPDATE approvals SET status='EXPIRED', decided_at=? WHERE id=? AND status='PENDING'", ctx.now, a.id);
      if (u.changes) {
        transition(ctx, a.transaction_id, 'ON_HOLD', {}, { action: 'Family approval expired — payment remains on hold', category: 'approval' });
        notify(ctx, { channel: 'security', severity: 'warning', title: `Approval expired · ${a.transaction_id}`, body: 'Payment remains on hold pending analyst action.', transactionId: a.transaction_id, recipientRole: 'analyst' });
      }
    });
  }
}

/* ---------------- investigations ---------------- */
function openInvestigation(ctx, txId, priority) {
  run('INSERT OR IGNORE INTO investigations(transaction_id,status,priority,opened_at,updated_at) VALUES (?,?,?,?,?)', txId, 'OPEN', priority, ctx.now, ctx.now);
}

export function investigationDecision(ctx, invId, decision, user, note) {
  const allowed = ['START', 'RELEASE', 'BLOCK', 'ESCALATE_FAMILY', 'CONFIRM_FRAUD', 'CLEAR'];
  if (!allowed.includes(decision)) throw new HttpError(400, `decision must be one of ${allowed.join(', ')}`, 'VALIDATION');
  let settleTx = null;
  const out = tx(() => {
    const inv = one('SELECT * FROM investigations WHERE id=?', invId);
    if (!inv) throw new HttpError(404, 'Investigation not found', 'NOT_FOUND');
    if (['CONFIRMED_FRAUD', 'CLEARED'].includes(inv.status) && decision !== 'START') throw new HttpError(409, `Investigation already closed (${inv.status})`, 'CLOSED');
    const t = one('SELECT t.*, c.name customer FROM transactions t JOIN customers c ON c.id=t.customer_id WHERE t.id=?', inv.transaction_id);
    let next = inv.status;
    if (decision === 'START') { if (inv.status !== 'OPEN') throw new HttpError(409, 'Investigation already started', 'CONFLICT'); next = 'IN_PROGRESS'; }
    if (decision === 'RELEASE') {
      transition(ctx, t.id, 'PROCESSING', {}, { action: `Analyst ${user.name} released payment`, category: 'decision', details: { note } });
      settleTx = t.id; next = 'CLEARED';
    }
    if (decision === 'BLOCK') { transition(ctx, t.id, 'BLOCKED', {}, { action: `Analyst ${user.name} blocked payment`, category: 'decision', details: { note } }); next = 'CONFIRMED_FRAUD'; }
    if (decision === 'ESCALATE_FAMILY') {
      const fm = one('SELECT * FROM family_members WHERE customer_id=? ORDER BY id LIMIT 1', t.customer_id);
      if (!fm) throw new HttpError(409, 'Customer has no trusted family member configured', 'NO_FAMILY');
      transition(ctx, t.id, 'PENDING_FAMILY_APPROVAL', {}, { action: `Analyst ${user.name} escalated to family approval`, category: 'decision' });
      const c = one('SELECT * FROM customers WHERE id=?', t.customer_id);
      createApproval(ctx, t.id, c, fm, `${c.name} · ${inr(t.amount)}`, true);
      next = 'ESCALATED';
    }
    if (decision === 'CONFIRM_FRAUD') next = 'CONFIRMED_FRAUD';
    if (decision === 'CLEAR') next = 'CLEARED';
    run('UPDATE investigations SET status=?, decision=?, assignee_id=COALESCE(assignee_id, ?), updated_at=? WHERE id=?', next, decision, user.id, ctx.now, inv.id);
    if (note) run('INSERT INTO analyst_notes(investigation_id, author_id, body, created_at) VALUES (?,?,?,?)', inv.id, user.id, note, ctx.now);
    audit(ctx, { action: `Investigation ${inv.id}: ${decision.replace('_', ' ').toLowerCase()}`, category: 'investigation', entityType: 'transaction', entityId: t.id, prev: inv.status, next, details: { note } });
    if (ctx.live) emit('investigation', { id: inv.id });
    return one('SELECT * FROM investigations WHERE id=?', inv.id);
  });
  if (settleTx) later(ctx, getSettings().demo.settlementDelayMs, (c) => settle(c, settleTx));
  return out;
}
