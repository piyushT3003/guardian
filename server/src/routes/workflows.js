import { Router } from 'express';
import { one, all, HttpError } from '../db.js';
import { requireRole } from '../lib/auth.js';
import { ctxOf } from '../services/core.js';
import { decideApproval, initiateRecovery, declineRecovery, investigationDecision } from '../services/operations.js';
import { startRun, nextStep, getRun, listRuns, SCENARIOS } from '../services/demo.js';
import { run } from '../db.js';
import { wrap, idempotent, TX_SELECT, txView } from './helpers.js';

export const approvals = Router();
const APPROVAL_SELECT = `SELECT a.*, fm.name family_name, fm.relation, fm.user_id family_user_id, u.name decided_by_name,
  t.amount, t.city, t.region, t.lat, t.lng, t.location_source, t.risk_score, t.risk_level, t.explanation, t.status tx_status, t.created_at tx_created_at, t.signals,
  c.name customer, rc.name recipient FROM approvals a JOIN family_members fm ON fm.id=a.family_member_id JOIN transactions t ON t.id=a.transaction_id
  JOIN customers c ON c.id=a.customer_id JOIN recipients rc ON rc.id=t.recipient_id LEFT JOIN users u ON u.id=a.decided_by`;
const approvalView = (a) => a && ({ ...a, signals: a.signals ? JSON.parse(a.signals).signals : [] });

approvals.get('/', wrap((req) => {
  const where = [], p = [];
  if (req.user.role === 'family') { where.push('fm.user_id = ?'); p.push(req.user.id); }
  if (req.query.status) { where.push('a.status = ?'); p.push(req.query.status); }
  const items = all(`${APPROVAL_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (a.status='PENDING') DESC, a.created_at DESC LIMIT 200`, ...p).map(approvalView);
  return { items, serverNow: Date.now(), canDecide: req.user.role === 'family' };
}));
approvals.post('/:id/decision', requireRole('family'), idempotent((req) => {
  const a = decideApproval(ctxOf(req.user), Number(req.params.id), req.body?.decision, req.user, req.body?.note?.slice(0, 500) || null);
  return approvalView(one(`${APPROVAL_SELECT} WHERE a.id=?`, a.id));
}));

export const recoveries = Router();
const REC_SELECT = `SELECT r.*, u.name decided_by_name, t.amount, t.city, t.risk_score, t.status tx_status, t.completed_at tx_completed_at, t.created_at tx_created_at, t.payment_ref,
  c.name customer, c.id customer_id, c.phone customer_phone, rc.name recipient, rc.vpa recipient_vpa, a.status approval_status, a.decided_at approval_decided_at, fm.name family_name, fm.relation
  FROM recoveries r JOIN transactions t ON t.id=r.transaction_id JOIN customers c ON c.id=t.customer_id JOIN recipients rc ON rc.id=t.recipient_id
  LEFT JOIN approvals a ON a.transaction_id=t.id LEFT JOIN family_members fm ON fm.id=a.family_member_id LEFT JOIN users u ON u.id=r.decided_by`;
recoveries.get('/', requireRole('analyst', 'admin'), wrap((req) => {
  const items = all(`${REC_SELECT} ${req.query.status ? 'WHERE r.status = ?' : ''} ORDER BY (r.status IN ('OPEN','INITIATED')) DESC, r.opened_at DESC LIMIT 200`, ...(req.query.status ? [req.query.status] : []));
  return { items, serverNow: Date.now(), canDecide: req.user.role === 'admin' };
}));
recoveries.post('/:id/initiate', requireRole('admin'), idempotent((req) => {
  initiateRecovery(ctxOf(req.user), Number(req.params.id), req.user, req.body?.note || null);
  return one(`${REC_SELECT} WHERE r.id=?`, Number(req.params.id));
}));
recoveries.post('/:id/decline', requireRole('admin'), idempotent((req) => {
  declineRecovery(ctxOf(req.user), Number(req.params.id), req.user, req.body?.note || null);
  return one(`${REC_SELECT} WHERE r.id=?`, Number(req.params.id));
}));

export const investigations = Router();
const INV_SELECT = `SELECT i.*, u.name assignee, t.amount, t.city, t.risk_score, t.risk_level, t.status tx_status, t.created_at tx_created_at, c.name customer, rc.name recipient
  FROM investigations i JOIN transactions t ON t.id=i.transaction_id JOIN customers c ON c.id=t.customer_id JOIN recipients rc ON rc.id=t.recipient_id LEFT JOIN users u ON u.id=i.assignee_id`;
investigations.use(requireRole('analyst', 'admin'));
investigations.get('/', wrap((req) => {
  const where = [], p = [];
  if (req.query.status === 'active') where.push("i.status IN ('OPEN','IN_PROGRESS','ESCALATED')");
  else if (req.query.status === 'closed') where.push("i.status IN ('CONFIRMED_FRAUD','CLEARED')");
  else if (req.query.status) { where.push('i.status = ?'); p.push(req.query.status); }
  if (req.query.priority) { where.push('i.priority = ?'); p.push(req.query.priority); }
  const items = all(`${INV_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (i.status IN ('OPEN','IN_PROGRESS','ESCALATED')) DESC, t.risk_score DESC, i.opened_at DESC LIMIT 200`, ...p);
  const counts = Object.fromEntries(all('SELECT status, COUNT(*) n FROM investigations GROUP BY status').map((x) => [x.status, x.n]));
  return { items, counts };
}));
investigations.get('/:id', wrap((req) => {
  const inv = one(`${INV_SELECT} WHERE i.id=?`, Number(req.params.id));
  if (!inv) throw new HttpError(404, 'Investigation not found', 'NOT_FOUND');
  const notes = all('SELECT n.*, u.name author, u.title FROM analyst_notes n JOIN users u ON u.id=n.author_id WHERE investigation_id=? ORDER BY n.created_at DESC', inv.id);
  const related = all(`${TX_SELECT} WHERE (t.recipient_id = (SELECT recipient_id FROM transactions WHERE id=?) OR (t.customer_id = (SELECT customer_id FROM transactions WHERE id=?) AND t.risk_level != 'low')) AND t.id != ? ORDER BY t.created_at DESC LIMIT 10`, inv.transaction_id, inv.transaction_id, inv.transaction_id).map((x) => ({ ...txView(x), signals: undefined }));
  return { investigation: inv, notes, related };
}));
investigations.post('/:id/decision', idempotent((req) => investigationDecision(ctxOf(req.user), Number(req.params.id), req.body?.decision, req.user, req.body?.note?.slice(0, 1000) || null)));
investigations.post('/:id/notes', wrap((req) => {
  const body = String(req.body?.body || '').trim();
  if (!body) throw new HttpError(400, 'Note cannot be empty', 'VALIDATION');
  const inv = one('SELECT * FROM investigations WHERE id=?', Number(req.params.id));
  if (!inv) throw new HttpError(404, 'Investigation not found', 'NOT_FOUND');
  run('INSERT INTO analyst_notes(investigation_id, author_id, body, created_at) VALUES (?,?,?,?)', inv.id, req.user.id, body.slice(0, 2000), Date.now());
  run('UPDATE investigations SET updated_at=? WHERE id=?', Date.now(), inv.id);
  return all('SELECT n.*, u.name author, u.title FROM analyst_notes n JOIN users u ON u.id=n.author_id WHERE investigation_id=? ORDER BY n.created_at DESC', inv.id);
}));

export const demo = Router();
demo.use(requireRole('analyst', 'admin'));
demo.get('/scenarios', wrap(() => Object.entries(SCENARIOS).map(([k, s]) => ({ id: Number(k), title: s.title, familyEmail: s.familyEmail, steps: s.build('····').map(({ recipient, amount, city, note }) => ({ recipient, amount, city, note })) }))));
demo.get('/runs', wrap(() => listRuns()));
demo.post('/:scenario/start', wrap((req) => startRun(ctxOf(req.user), Number(req.params.scenario), req.user)));
demo.post('/runs/:id/next', idempotent((req) => nextStep(ctxOf(req.user), req.params.id)));
// Run status is readable by any authenticated user (the family member follows along too).
export const demoStatus = Router();
demoStatus.get('/runs/:id', wrap((req) => getRun(req.params.id)));
