// Guardian fraud engine — explainable, signal-based scoring over the customer's stored history.
// Every signal is computed from database records; the "anomaly model" is a multivariate
// z-distance over amount, distance and hour-of-day (a statistical model, not a language model).
import { all, one } from '../db.js';
import { getSettings } from './core.js';
import { analyseLocation } from './location.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 0; };

export function scoreTransaction(t, now) {
  const S = getSettings();
  const customer = one('SELECT * FROM customers WHERE id = ?', t.customer_id);
  const history = all(`SELECT id, amount, recipient_id, lat, lng, city, created_at, risk_level FROM transactions
    WHERE customer_id = ? AND created_at < ? AND id != ? AND status NOT IN ('BLOCKED','FAILED') ORDER BY created_at DESC LIMIT 400`,
    t.customer_id, t.created_at, t.id);

  /* amount deviation (log-space z-score vs baseline/history) */
  // Baseline uses only trusted (non-high-risk) behaviour so fraud does not poison the baseline.
  const trusted = history.filter((h) => h.risk_level !== 'high');
  const logs = trusted.map((h) => Math.log(h.amount));
  const useHist = trusted.length >= 8;
  const mu = useHist ? mean(logs) : Math.log(customer.baseline_amount);
  const sigma = Math.max(useHist ? std(logs) : customer.baseline_sigma, 0.35);
  const typical = Math.exp(mu);
  const z = (Math.log(t.amount) - mu) / sigma;
  const amountS = clamp((z - 1.2) / 2.3);

  /* recipient novelty */
  const prior = trusted.filter((h) => h.recipient_id === t.recipient_id).length;
  const recip = one('SELECT * FROM recipients WHERE id = ?', t.recipient_id);
  const recipientAgeH = (t.created_at - recip.first_seen) / 3.6e6;
  const recipientS = clamp((prior === 0 ? 0.85 : prior <= 2 ? 0.35 : 0) + (recipientAgeH < 24 ? 0.15 : 0));

  /* velocity */
  const n15 = history.filter((h) => t.created_at - h.created_at <= 15 * 60e3).length;
  const n60 = history.filter((h) => t.created_at - h.created_at <= 60 * 60e3).length;
  const toSameRecent = history.filter((h) => h.recipient_id === t.recipient_id && t.created_at - h.created_at <= 60 * 60e3).length;
  const velocityS = clamp(n15 / 3 + n60 / 10 + toSameRecent * 0.2);

  /* location */
  const loc = analyseLocation(t, customer, history, S);
  const locationS = loc.score;

  /* behaviour: unusual hour + repeat-to-new-recipient structuring */
  const hourOf = (ms) => new Date(ms + 5.5 * 3.6e6).getUTCHours(); // IST
  const hour = hourOf(t.created_at);
  const hours = trusted.map((h) => hourOf(h.created_at));
  const sameHourShare = hours.length ? hours.filter((h) => Math.min(Math.abs(h - hour), 24 - Math.abs(h - hour)) <= 2).length / hours.length : 0.5;
  const unusualHour = hours.length >= 8 && sameHourShare < 0.08;
  const behaviourS = clamp((unusualHour ? 0.55 : 0) + (prior === 0 && toSameRecent > 0 ? 0.5 : 0) + (z > 2.5 && prior === 0 ? 0.25 : 0));

  /* statistical anomaly model */
  const hourZ = unusualHour ? 2.2 : 0;
  const distZ = loc.distanceKm != null ? clamp(loc.distanceKm / 250, 0, 6) : 0;
  const D = Math.sqrt(Math.max(z, 0) ** 2 + distZ ** 2 + hourZ ** 2);
  const anomalyS = clamp((D - 1.8) / 4);

  const W = S.weights;
  const raw = [
    { key: 'location', label: 'Unusual Location', score: locationS, weight: W.location,
      evidence: loc.distanceKm != null ? `${Math.round(loc.distanceKm).toLocaleString('en-IN')} km from nearest familiar location (${loc.familiar?.city || '—'})${loc.impossibleTravel ? ` · impossible travel: ${Math.round(loc.prevDistanceKm)} km from previous payment ${Math.max(1, Math.round((t.created_at - loc.prev.at) / 60e3))} min earlier` : ''}` : 'No coordinates supplied' },
    { key: 'recipient', label: 'New Recipient', score: recipientS, weight: W.recipient,
      evidence: prior === 0 ? `First payment to ${recip.name}${recipientAgeH < 24 ? ' · recipient first seen on platform < 24h ago' : ''}` : `${prior} prior payment(s) to ${recip.name}` },
    { key: 'amount', label: 'Amount Anomaly', score: amountS, weight: W.amount,
      evidence: `₹${Math.round(t.amount).toLocaleString('en-IN')} is ${(t.amount / typical).toFixed(1)}× typical ₹${Math.round(typical).toLocaleString('en-IN')} (z = ${z.toFixed(2)})` },
    { key: 'behaviour', label: 'Behavioural Anomaly', score: behaviourS, weight: W.behaviour,
      evidence: [unusualHour ? `Payment at ${hour}:00 IST — ${Math.round(sameHourShare * 100)}% of history near this hour` : `Typical time of day`, prior === 0 && toSameRecent > 0 ? 'Repeat payments to a brand-new recipient' : null].filter(Boolean).join(' · ') },
    { key: 'velocity', label: 'Transaction Velocity', score: velocityS, weight: W.velocity,
      evidence: `${n15} payment(s) in prior 15 min, ${n60} in prior hour` },
    { key: 'anomaly', label: 'Anomaly Model', score: anomalyS, weight: W.anomaly,
      evidence: `Multivariate z-distance D = ${D.toFixed(2)} over amount, distance and hour` },
  ];
  const signals = raw.map((s) => ({ ...s, score: +s.score.toFixed(3), contribution: +(s.score * s.weight).toFixed(2) }));
  const riskScore = Math.min(100, Math.round(signals.reduce((a, s) => a + s.contribution, 0)));
  const T = S.thresholds;
  const riskLevel = riskScore >= T.high ? 'high' : riskScore >= T.medium ? 'medium' : 'low';

  const top = [...signals].filter((s) => s.contribution >= 3).sort((a, b) => b.contribution - a.contribution);
  const explanation = riskLevel === 'low'
    ? `Consistent with ${customer.name.split(' ')[0]}'s baseline: ${prior > 0 ? 'known recipient' : 'low-value payment'}, familiar location and normal velocity.`
    : `Flagged ${riskLevel} risk because ${top.slice(0, 3).map((s) => s.evidence.charAt(0).toLowerCase() + s.evidence.slice(1)).join('; ')}.`;
  const recommendedAction = riskLevel === 'high'
    ? (customer.family_protection && S.policies.holdHighRiskForFamily ? 'Hold payment and require trusted family approval before settlement' : 'Hold payment for analyst verification')
    : riskLevel === 'medium' ? (S.policies.reviewMediumRisk ? 'Route to analyst review before settlement' : 'Allow with monitoring') : 'Allow payment';

  return {
    riskScore, riskLevel, signals, explanation, recommendedAction,
    context: { typicalAmount: Math.round(typical), amountZ: +z.toFixed(2), priorToRecipient: prior, historyCount: history.length, n15, n60, hour, location: loc },
  };
}
