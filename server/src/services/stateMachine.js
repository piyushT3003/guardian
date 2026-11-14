// Transaction state machine. Every status change goes through `transition`, which performs a
// compare-and-set on (status, version) so duplicate or out-of-order requests cannot double-apply.
import { one, run, HttpError } from '../db.js';
import { audit } from './core.js';
import { emit } from '../lib/events.js';

export const STATES = {
  RECEIVED: ['ANALYSING'],
  ANALYSING: ['COMPLETED', 'UNDER_REVIEW', 'PENDING_FAMILY_APPROVAL', 'ON_HOLD'],
  UNDER_REVIEW: ['PROCESSING', 'BLOCKED', 'PENDING_FAMILY_APPROVAL'],
  PENDING_FAMILY_APPROVAL: ['APPROVED', 'ON_HOLD'],
  ON_HOLD: ['PROCESSING', 'BLOCKED'],
  APPROVED: ['PROCESSING'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['RECOVERY_PENDING'],
  RECOVERY_PENDING: ['RECOVERING', 'RECOVERY_DECLINED', 'RECOVERY_EXPIRED'],
  RECOVERING: ['RECOVERED', 'RECOVERY_FAILED'],
  BLOCKED: [], FAILED: [], RECOVERED: [], RECOVERY_DECLINED: [], RECOVERY_EXPIRED: [], RECOVERY_FAILED: [],
};

export function transition(ctx, txId, to, extra = {}, auditInfo = {}) {
  const t = one('SELECT id, status, version FROM transactions WHERE id = ?', txId);
  if (!t) throw new HttpError(404, `Transaction ${txId} not found`, 'NOT_FOUND');
  if (!STATES[t.status]?.includes(to)) {
    throw new HttpError(409, `Invalid state transition ${t.status} → ${to} for ${txId}`, 'INVALID_TRANSITION');
  }
  const cols = Object.keys(extra);
  const set = ['status = ?', 'updated_at = ?', 'version = version + 1', ...cols.map((c) => `${c} = ?`)].join(', ');
  const r = run(`UPDATE transactions SET ${set} WHERE id = ? AND status = ? AND version = ?`,
    to, ctx.now, ...cols.map((c) => extra[c]), txId, t.status, t.version);
  if (r.changes !== 1) throw new HttpError(409, `Concurrent update on ${txId}; please retry`, 'CONFLICT');
  audit(ctx, { action: auditInfo.action || `Status ${t.status} → ${to}`, category: auditInfo.category || 'state', entityType: 'transaction', entityId: txId, prev: t.status, next: to, details: auditInfo.details });
  if (ctx.live) emit('transaction', { id: txId, status: to });
  return { from: t.status, to };
}
