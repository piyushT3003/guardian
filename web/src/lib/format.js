export const inr = (n, d = 0) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d })}`);
export const compact = (n) => (n == null ? '—' : n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : inr(n));
export const int = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
const TZ = 'Asia/Kolkata';
export const time = (ms) => (ms ? new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ }) : '—');
export const timeS = (ms) => (ms ? new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: TZ }) : '—');
export const date = (ms) => (ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—');
export const dateTime = (ms) => (ms ? `${new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })}, ${time(ms)}` : '—');
export const dayLabel = (ms) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ });
export const hourLabel = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true, timeZone: TZ }).replace(' ', '').toUpperCase();
export function ago(ms, now = Date.now()) {
  if (!ms) return '—';
  const s = Math.round((now - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export const km = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('en-IN')} km`);
export const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const initials = (n = '') => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();

export const STATUS = {
  RECEIVED: ['Received', 'b-muted'], ANALYSING: ['Analysing', 'b-info'], COMPLETED: ['Completed', 'b-good'],
  UNDER_REVIEW: ['Under Review', 'b-info'], PENDING_FAMILY_APPROVAL: ['Pending Approval', 'b-warn'], ON_HOLD: ['On Hold', 'b-warn'],
  APPROVED: ['Approved', 'b-brand'], PROCESSING: ['Processing', 'b-brand'], BLOCKED: ['Blocked', 'b-bad'], FAILED: ['Failed', 'b-bad'],
  RECOVERY_PENDING: ['Recovery Pending', 'b-bad'], RECOVERING: ['Recovering', 'b-brand'], RECOVERED: ['Recovered', 'b-good'],
  RECOVERY_DECLINED: ['Recovery Declined', 'b-muted'], RECOVERY_EXPIRED: ['Recovery Expired', 'b-muted'], RECOVERY_FAILED: ['Recovery Failed', 'b-bad'],
  // approvals / recoveries / investigations
  PENDING: ['Pending', 'b-warn'], HELD: ['Kept on Hold', 'b-info'], EXPIRED: ['Expired', 'b-muted'], OPEN: ['Open', 'b-bad'], INITIATED: ['Initiated', 'b-brand'],
  DECLINED: ['Declined', 'b-muted'], IN_PROGRESS: ['In Progress', 'b-brand'], ESCALATED: ['Escalated', 'b-warn'], CONFIRMED_FRAUD: ['Confirmed Fraud', 'b-bad'], CLEARED: ['Cleared', 'b-good'],
};
export const riskColor = (l) => (l === 'high' ? 'var(--bad)' : l === 'medium' ? 'var(--warn)' : 'var(--good)');
export const levelOf = (s) => (s >= 70 ? 'high' : s >= 40 ? 'medium' : 'low');
export const SOURCE_LABEL = { live_gps: 'Live GPS', historical: 'Historical', demo: 'Demo location', seed: 'Historical' };
