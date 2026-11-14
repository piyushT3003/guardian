import { lazy, Suspense, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, CheckCircle2, Ban, Users, ShieldX, ShieldCheck, Send, Search, ScanSearch, MapPinned, StickyNote, Activity } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/auth.jsx';
import { inr, ago, dateTime, time, km, dayLabel, initials } from '../lib/format.js';
import { Card, CardHead, Score, Status, RiskRing, ErrorBox, Loading, Empty, Seg, Modal, Button, stagger, rise, Source } from '../components/ui.jsx';
import { RiskBreakdown } from './Intelligence.jsx';
const GeoMap = lazy(() => import('../components/GeoMap.jsx'));

const DECISIONS = {
  START: { label: 'Start investigation', icon: PlayCircle, cls: 'primary', note: false },
  RELEASE: { label: 'Release payment', icon: CheckCircle2, cls: 'good', note: true, desc: 'The payment will be submitted to the payment simulator and settled.' },
  BLOCK: { label: 'Block payment', icon: Ban, cls: 'danger-solid', note: true, desc: 'The payment will be permanently blocked and the investigation marked as confirmed fraud.' },
  ESCALATE_FAMILY: { label: 'Request family approval', icon: Users, cls: '', note: false, desc: "The customer's trusted family member will be asked to approve or hold the payment." },
  CONFIRM_FRAUD: { label: 'Confirm fraud', icon: ShieldX, cls: 'danger', note: true, desc: 'Closes the investigation as confirmed fraud.' },
  CLEAR: { label: 'Clear (no fraud)', icon: ShieldCheck, cls: '', note: true, desc: 'Closes the investigation as cleared.' },
};
function available(inv) {
  const s = inv.tx_status, closed = ['CONFIRMED_FRAUD', 'CLEARED'].includes(inv.status);
  if (closed) return [];
  const out = [];
  if (inv.status === 'OPEN') out.push('START');
  if (['UNDER_REVIEW', 'ON_HOLD'].includes(s)) out.push('RELEASE', 'BLOCK');
  if (s === 'UNDER_REVIEW') out.push('ESCALATE_FAMILY');
  if (!['UNDER_REVIEW', 'ON_HOLD', 'PENDING_FAMILY_APPROVAL'].includes(s)) out.push('CONFIRM_FRAUD', 'CLEAR');
  return out;
}

export default function Investigations() {
  const { id } = useParams();
  const nav = useNavigate();
  const [filter, setFilter] = useState('active');
  const { data, error, loading } = useApi(`/investigations?status=${filter}`, { live: ['transaction', 'investigation'] });
  const sel = id || data?.items?.[0]?.id;
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)', alignItems: 'start' }} data-resp="ov-row">
      <Card variants={rise} style={{ position: 'sticky', top: 96 }}>
        <CardHead title="Investigation queue" sub={data ? `${data.items.length} cases` : ''} />
        <Seg value={filter} onChange={setFilter} options={[{ value: 'active', label: `Active${data?.counts ? ` · ${(data.counts.OPEN || 0) + (data.counts.IN_PROGRESS || 0) + (data.counts.ESCALATED || 0)}` : ''}` }, { value: 'closed', label: 'Closed' }, { value: '', label: 'All' }]} />
        <div className="stack" style={{ gap: 10, marginTop: 14, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: 4 }}>
          <ErrorBox error={error} />
          {loading && !data ? <Loading rows={6} height={60} /> : data?.items.length === 0 ? <Empty icon={Search} title="Queue is clear">No investigations in this view.</Empty> :
            data?.items.map((i) => (
              <button key={i.id} className={`queue-item ${String(sel) === String(i.id) ? 'on' : ''}`} onClick={() => nav(`/investigations/${i.id}`)}>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="row" style={{ gap: 8 }}><Score v={i.risk_score} level={i.risk_level} /><b>{i.transaction_id}</b></span><Status s={i.status} /></div>
                <div className="small" style={{ marginTop: 8 }}>{i.customer} → {i.recipient}</div>
                <div className="row xs muted" style={{ justifyContent: 'space-between', marginTop: 4 }}><span>{i.city} · {ago(i.opened_at)}</span><b style={{ color: 'var(--ink)', fontSize: 12.5 }}>{inr(i.amount)}</b></div>
              </button>))}
        </div>
      </Card>
      <div>{sel ? <Workspace key={sel} id={sel} /> : !loading && <Card><Empty icon={Search} title="Select an investigation" /></Card>}</div>
    </motion.div>
  );
}

function Workspace({ id }) {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const inv = useApi(`/investigations/${id}`, { live: ['transaction', 'investigation'] });
  const txId = inv.data?.investigation.transaction_id;
  const tx = useApi(txId ? `/transactions/${txId}` : null, { skip: !txId });
  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState('');
  if (inv.error) return <ErrorBox error={inv.error} onRetry={inv.reload} />;
  if (!inv.data || !tx.data) return <Card><Loading rows={10} /></Card>;
  const I = inv.data.investigation, t = tx.data.transaction, d = tx.data;
  const actions = available(I);
  const decide = async () => {
    setPending(true);
    try {
      await api(`/investigations/${I.id}/decision`, { method: 'POST', body: { decision, note: note || undefined }, idempotent: true });
      toast({ title: DECISIONS[decision].label, body: `${I.transaction_id} updated`, tone: 'good' });
      setDecision(null); setNote(''); inv.reload(true); tx.reload(true);
    } catch (e) { toast({ title: 'Action failed', body: e.message, tone: 'bad' }); } finally { setPending(false); }
  };
  const addNote = async (e) => {
    e.preventDefault(); if (!draft.trim()) return;
    try { const notes = await api(`/investigations/${I.id}/notes`, { method: 'POST', body: { body: draft } }); inv.setData((x) => ({ ...x, notes })); setDraft(''); }
    catch (err) { toast({ title: 'Could not save note', body: err.message, tone: 'bad' }); }
  };
  return (
    <motion.div className="stack" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
      <Card>
        <div className="row wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
          <RiskRing score={t.risk_score} size={120} stroke={10} level={t.risk_level} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="row wrap" style={{ gap: 8 }}><span className="xs muted bold">CASE #{I.id}</span><Status s={I.status} /><span className={`badge ${I.priority === 'high' ? 'b-bad' : 'b-warn'}`}>{I.priority} priority</span></div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6 }}>{t.customer} → {t.recipient}</div>
            <div className="small muted">{t.id} · {inr(t.amount)} · {t.city} · {dateTime(t.created_at)} · Payment <Status s={t.status} /></div>
            <div className="small" style={{ marginTop: 10 }}>{t.explanation}</div>
            <div className="row wrap" style={{ marginTop: 14 }}>
              {user.role === 'family' ? null : actions.length === 0 ? <span className="small muted">Case closed{I.decision ? ` · decision: ${I.decision.replace('_', ' ').toLowerCase()}` : ''}{I.assignee ? ` by ${I.assignee}` : ''}.</span> :
                actions.map((a) => { const D = DECISIONS[a]; return <button key={a} className={`btn sm ${D.cls}`} onClick={() => (D.note || D.desc ? setDecision(a) : (setDecision(a), null))}><D.icon />{D.label}</button>; })}
              {t.status === 'PENDING_FAMILY_APPROVAL' && <span className="badge b-warn">Awaiting family decision — analysts cannot override</span>}
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => nav(`/intelligence/${t.id}`)}><ScanSearch />Intelligence</button>
            <button className="btn sm" onClick={() => nav(`/geo?tx=${t.id}`)}><MapPinned />Map</button>
          </div>
        </div>
      </Card>

      <div className="grid g-2">
        <Card><CardHead title="Fraud indicators" sub="Detection signals" /><RiskBreakdown signals={t.signals} score={t.risk_score} />
          <div className="sep" />
          <div className="stack" style={{ gap: 8 }}>{t.signals.filter((s) => s.contribution >= 3).map((s) => <div key={s.key} className="small"><b>{s.label}:</b> <span className="muted">{s.evidence}</span></div>)}</div>
        </Card>
        <Card className="flush">
          <div className="map-shell" style={{ borderRadius: 0, border: 0, boxShadow: 'none' }}><Suspense fallback={<div className="skel" style={{ height: 300 }} />}>{t.lat != null && <GeoMap height={300} focus={t} familiar={d.familiar} previous={t.analysis?.location?.prev} />}</Suspense></div>
          <div style={{ padding: 16 }} className="row wrap small"><b>Location evidence</b><span className="muted">{km(t.analysis?.location?.distanceKm)} from {t.analysis?.location?.familiar?.city}</span><Source s={t.location_source} /></div>
        </Card>
      </div>

      <div className="grid g-2">
        <Card>
          <CardHead icon={StickyNote} title="Analyst notes" sub={`${inv.data.notes.length}`} />
          <form onSubmit={addNote} className="row" style={{ marginBottom: 12 }}>
            <input className="input" style={{ flex: 1 }} placeholder="Add an investigation note…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="New note" />
            <button className="btn primary" disabled={!draft.trim()}><Send size={15} />Add</button>
          </form>
          <AnimatePresence initial={false}>
            {inv.data.notes.length === 0 ? <div className="small muted">No notes yet.</div> : inv.data.notes.map((n) => (
              <motion.div key={n.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="lrow" style={{ alignItems: 'flex-start' }}>
                <span className="avatar sm">{initials(n.author)}</span>
                <div className="l-main"><div className="small"><b>{n.author}</b> <span className="muted xs">· {dateTime(n.created_at)}</span></div><div className="small" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div></div>
              </motion.div>))}
          </AnimatePresence>
        </Card>
        <Card>
          <CardHead title="Related transactions" sub="Same recipient or flagged for this customer" />
          {inv.data.related.length === 0 ? <div className="small muted">No related transactions.</div> : inv.data.related.map((r) => (
            <div key={r.id} className="lrow clickable" onClick={() => nav(`/intelligence/${r.id}`)}>
              <Score v={r.risk_score} level={r.risk_level} />
              <div className="l-main"><div className="l-t">{r.customer} → {r.recipient}</div><div className="l-s">{r.id} · {r.city} · {dayLabel(r.created_at)}</div></div>
              <div style={{ textAlign: 'right' }}><div className="small bold">{inr(r.amount)}</div><Status s={r.status} /></div>
            </div>))}
        </Card>
      </div>

      <div className="grid g-2">
        <Card>
          <CardHead title="Customer history" right={<Link className="small bold" to={`/customers/${t.customer_id}`}>Profile →</Link>} />
          <div className="grid g-3" style={{ marginBottom: 12 }}>
            <div><div className="xs muted bold">PRIOR</div><b>{d.baseline.n}</b></div><div><div className="xs muted bold">AVG</div><b>{inr(d.baseline.avg)}</b></div><div><div className="xs muted bold">MAX</div><b>{inr(d.baseline.max)}</b></div>
          </div>
          {d.history.slice(0, 5).map((h) => <div key={h.id} className="row small" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f1fa' }}><span>{h.recipient} · <span className="muted">{h.city}</span></span><b>{inr(h.amount)}</b></div>)}
        </Card>
        <Card>
          <CardHead title="Recipient history" sub={d.recipient.name} />
          <div className="grid g-3" style={{ marginBottom: 12 }}>
            <div><div className="xs muted bold">PAYMENTS</div><b>{d.recipientStats.payments}</b></div><div><div className="xs muted bold">PAYERS</div><b>{d.recipientStats.customers}</b></div><div><div className="xs muted bold">HIGH RISK</div><b style={{ color: d.recipientStats.high_risk ? 'var(--bad-ink)' : undefined }}>{d.recipientStats.high_risk}</b></div>
          </div>
          {d.recipientTx.length === 0 ? <div className="small muted">First time this recipient has been paid on Guardian.</div> : d.recipientTx.slice(0, 5).map((h) => <div key={h.id} className="row small" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f1fa' }}><span>{h.customer} · <span className="muted">{dayLabel(h.created_at)}</span></span><b>{inr(h.amount)}</b></div>)}
        </Card>
      </div>

      <Card>
        <CardHead icon={Activity} title="Audit history" />
        {d.audit.map((a) => <div key={a.id} className="row small" style={{ padding: '7px 0', borderBottom: '1px solid #f3f1fa', gap: 14 }}><span className="muted tabular" style={{ width: 90 }}>{time(a.at)}</span><span style={{ flex: 1 }}>{a.action}</span><span className="muted">{a.actor}</span></div>)}
      </Card>

      <Modal open={!!decision} onClose={() => !pending && setDecision(null)}>
        {decision && (() => { const D = DECISIONS[decision]; return (
          <div className="stack" style={{ gap: 14 }}>
            <div className="row"><span className="k-ico tone-brand" style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center' }}><D.icon size={20} /></span><div><div className="bold" style={{ fontSize: 18 }}>{D.label}</div><div className="small muted">{t.id} · {inr(t.amount)} · {t.customer}</div></div></div>
            {D.desc && <div className="small">{D.desc}</div>}
            <div className="field"><label htmlFor="dn">Decision note {D.note ? '(recorded in the audit trail)' : '(optional)'}</label><textarea id="dn" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Verified with customer by phone" /></div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setDecision(null)} disabled={pending}>Cancel</button><Button className={D.cls || 'primary'} pending={pending} onClick={decide}>Confirm</Button></div>
          </div>); })()}
      </Modal>
    </motion.div>
  );
}
