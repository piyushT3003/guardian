import { lazy, Suspense, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ShieldCheck, PauseCircle, CheckCircle2, Clock, User, Store, MapPin, Wallet, Users, Info, Hourglass } from 'lucide-react';
import { useApi, useServerNow } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/auth.jsx';
import { inr, dateTime, ago, mmss, initials } from '../lib/format.js';
import { Card, CardHead, Score, Status, RiskRing, ErrorBox, Loading, Empty, Seg, Modal, Button, stagger, rise, Source, Notice, ease } from '../components/ui.jsx';
import Burst from '../components/Burst.jsx';
import { RiskBreakdown } from './Intelligence.jsx';
const GeoMap = lazy(() => import('../components/GeoMap.jsx'));

export default function Approvals() {
  const { user } = useAuth();
  const { id } = useParams();
  const nav = useNavigate();
  const [view, setView] = useState('PENDING');
  const { data, error, loading, reload } = useApi('/approvals', { live: ['transaction', 'notification'] });
  const now = useServerNow(data?.serverNow, 1000);
  const items = data?.items || [];
  const list = items.filter((a) => (view === 'PENDING' ? a.status === 'PENDING' : a.status !== 'PENDING'));
  const selected = items.find((a) => String(a.id) === id) || list[0];
  const family = user.role === 'family';
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      {!family && <Notice icon={Info}>You are viewing the Family Approval Centre as <b>{user.title}</b>. Only the customer's designated trusted family member can approve or hold a protected payment, and the backend enforces this. Use <b>Switch demo account</b> in the profile menu to act as a family member.</Notice>}
      {family && <Card variants={rise} className="hero-strip" style={{ padding: 22 }}>
        <div className="row wrap" style={{ gap: 16 }}><span style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,.2)', display: 'grid', placeItems: 'center' }}><Users size={26} /></span>
          <div style={{ flex: 1 }}><h3>Hi {user.name.split(' ')[0]}, you're a trusted guardian</h3><p>Guardian holds risky payments until you confirm them. Nothing leaves the account until you approve.</p></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 30, fontWeight: 800 }}>{items.filter((a) => a.status === 'PENDING').length}</div><div className="small" style={{ opacity: 0.85 }}>awaiting you</div></div></div>
      </Card>}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(290px, 360px) minmax(0, 1fr)', alignItems: 'start' }} data-resp="ov-row">
        <Card variants={rise}>
          <CardHead title={family ? 'Your requests' : 'Approval requests'} />
          <Seg value={view} onChange={setView} options={[{ value: 'PENDING', label: `Pending · ${items.filter((a) => a.status === 'PENDING').length}` }, { value: 'DONE', label: 'Previous decisions' }]} />
          <div className="stack" style={{ gap: 10, marginTop: 14 }}>
            <ErrorBox error={error} onRetry={reload} />
            {loading && !data ? <Loading rows={4} height={64} /> : list.length === 0 ? <Empty icon={ShieldCheck} title={view === 'PENDING' ? 'No pending approvals' : 'No previous decisions'}>{view === 'PENDING' ? 'Protected payments that need a decision will appear here instantly.' : ''}</Empty> :
              list.map((a) => (
                <button key={a.id} className={`queue-item ${selected?.id === a.id ? 'on' : ''}`} onClick={() => nav(`/approvals/${a.id}`)}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontSize: 16 }}>{inr(a.amount)}</b><Status s={a.status} /></div>
                  <div className="small" style={{ marginTop: 4 }}>{a.customer} → {a.recipient}</div>
                  <div className="row xs muted" style={{ justifyContent: 'space-between', marginTop: 4 }}><span>{a.transaction_id} · {a.city}</span>
                    {a.status === 'PENDING' ? <span className="bold" style={{ color: 'var(--warn-ink)' }}><Clock size={11} style={{ verticalAlign: -1 }} /> {mmss(a.deadline - now)}</span> : <span>{ago(a.decided_at || a.created_at, now)}</span>}</div>
                </button>))}
          </div>
        </Card>
        <AnimatePresence mode="wait">
          {selected ? <Detail key={selected.id} a={selected} now={now} canDecide={data?.canDecide && selected.family_user_id === user.id} reload={reload} /> : <Card><Empty icon={Users} title="Select a request" /></Card>}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Detail({ a, now, canDecide, reload }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const remaining = a.deadline - now;
  const pendingState = a.status === 'PENDING';
  const expired = pendingState && remaining <= 0;
  const decide = async () => {
    setPending(true);
    try {
      const r = await api(`/approvals/${a.id}/decision`, { method: 'POST', body: { decision: confirm, note: note || undefined }, idempotent: true });
      setResult(r.status); setConfirm(null); setNote('');
      toast({ title: confirm === 'APPROVE' ? 'Payment approved' : 'Payment kept on hold', body: confirm === 'APPROVE' ? 'Guardian released the payment to the payment network.' : 'The payment will not be sent.', tone: confirm === 'APPROVE' ? 'warn' : 'good' });
      reload(true);
    } catch (e) { toast({ title: 'Decision not recorded', body: e.message, tone: 'bad' }); reload(true); } finally { setPending(false); }
  };
  const tx = { id: a.transaction_id, lat: a.lat, lng: a.lng, city: a.city, region: a.region, risk_level: a.risk_level, location_source: a.location_source, accuracy_m: null };
  return (
    <motion.div className="stack" initial={{ opacity: 0, rotateY: -6, x: 20 }} animate={{ opacity: 1, rotateY: 0, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.45, ease }} style={{ transformPerspective: 1200 }}>
      <Card style={{ overflow: 'hidden' }}>
        <Burst fire={result ? result : null} origin={[0.12, 0.3]} />
        <div className="row wrap" style={{ gap: 22, alignItems: 'center' }}>
          <motion.div initial={{ scale: 0.8, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }}
            style={{ width: 84, height: 84, borderRadius: 26, display: 'grid', placeItems: 'center', background: pendingState ? 'linear-gradient(145deg,#fff6e8,#ffe2b8)' : a.status === 'APPROVED' ? 'linear-gradient(145deg,#ebfaf2,#c9f0dc)' : 'linear-gradient(145deg,#eef4ff,#d9e6ff)', boxShadow: 'var(--sh-2)' }}>
            {pendingState ? <Lock size={38} color="#b54708" /> : a.status === 'APPROVED' ? <CheckCircle2 size={38} color="#067647" /> : a.status === 'EXPIRED' ? <Hourglass size={36} color="#4a4566" /> : <PauseCircle size={38} color="#175cd3" />}
          </motion.div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="xs muted bold">{a.transaction_id} · REQUESTED {dateTime(a.created_at).toUpperCase()}</div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.1 }}>{inr(a.amount)}</div>
            <div className="small">{a.customer} wants to pay <b>{a.recipient}</b></div>
          </div>
          {pendingState && (
            <div style={{ textAlign: 'center', padding: '10px 18px', borderRadius: 16, background: expired ? 'var(--bad-soft)' : 'var(--warn-soft)' }}>
              <div className="xs bold" style={{ color: expired ? 'var(--bad-ink)' : 'var(--warn-ink)' }}>{expired ? 'WINDOW CLOSED' : 'DECIDE WITHIN'}</div>
              <div style={{ fontSize: 26, fontWeight: 800 }} className="tabular">{mmss(remaining)}</div>
            </div>)}
        </div>
        {pendingState && <div className="notice" style={{ marginTop: 18, background: 'linear-gradient(135deg,#fff8ec,#fff1f0)' }}><Lock style={{ color: 'var(--warn-ink)' }} /><div><b>This payment is on hold.</b> Guardian will not send it until {a.family_name} approves. If no decision is made before the deadline it stays on hold for the security team.</div></div>}
        {!pendingState && <div className="notice" style={{ marginTop: 18 }}><Info /><div><b>Decision recorded:</b> <Status s={a.status} /> {a.decided_at && <>on {dateTime(a.decided_at)}</>} {a.decided_by_name && <>by {a.decided_by_name}</>}{a.note && <> · “{a.note}”</>}. Payment status: <Status s={a.tx_status} /></div></div>}
        {pendingState && (
          <div className="grid g-2" style={{ marginTop: 18 }}>
            <Button className="good lg" disabled={!canDecide || expired} onClick={() => setConfirm('APPROVE')}><ShieldCheck />APPROVE PAYMENT</Button>
            <Button className="danger lg" disabled={!canDecide || expired} onClick={() => setConfirm('HOLD')}><PauseCircle />KEEP PAYMENT ON HOLD</Button>
          </div>)}
        {pendingState && !canDecide && <div className="xs muted" style={{ marginTop: 8, textAlign: 'center' }}>Only {a.family_name} ({a.relation}) can decide this request.</div>}
        <AnimatePresence>{result && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="badge b-good" style={{ marginTop: 12 }}>✓ Decision saved: {result}</motion.div>}</AnimatePresence>
      </Card>

      <div className="grid g-2">
        <Card>
          <CardHead title="Transaction information" />
          <dl className="kv">
            <dt><Wallet />Amount</dt><dd>{inr(a.amount)}</dd>
            <dt><User />Customer</dt><dd>{a.customer}</dd>
            <dt><Store />Recipient</dt><dd>{a.recipient}</dd>
            <dt><MapPin />Location</dt><dd>{a.city}, {a.region} <Source s={a.location_source} /></dd>
            <dt><Clock />Deadline</dt><dd>{dateTime(a.deadline)}</dd>
            <dt><Users />Trusted family</dt><dd><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}><span className="avatar sm family">{initials(a.family_name)}</span>{a.family_name} · {a.relation}</span></dd>
          </dl>
        </Card>
        <Card style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <RiskRing score={a.risk_score} size={130} stroke={11} level={a.risk_level} />
          <div style={{ flex: 1, minWidth: 0 }}><div className="bold">Why Guardian flagged this</div><div className="small" style={{ marginTop: 6, color: 'var(--ink-2)' }}>{a.explanation}</div></div>
        </Card>
      </div>
      <div className="grid g-2">
        <Card><CardHead title="Fraud detection signals" /><RiskBreakdown signals={a.signals} score={a.risk_score} /></Card>
        <div className="map-shell"><Suspense fallback={<div className="skel" style={{ height: 300 }} />}>{a.lat != null && <GeoMap height={330} focus={tx} familiar={[]} fitKey={a.id} tiles />}</Suspense></div>
      </div>

      <Modal open={!!confirm} onClose={() => !pending && setConfirm(null)}>
        {confirm && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="row"><span className={`k-ico ${confirm === 'APPROVE' ? 'tone-good' : 'tone-info'}`} style={{ width: 48, height: 48, borderRadius: 15, display: 'grid', placeItems: 'center' }}>{confirm === 'APPROVE' ? <ShieldCheck size={22} /> : <PauseCircle size={22} />}</span>
              <div><div className="bold" style={{ fontSize: 18 }}>{confirm === 'APPROVE' ? 'Approve this payment?' : 'Keep this payment on hold?'}</div><div className="small muted">{inr(a.amount)} to {a.recipient}</div></div></div>
            <div className="small">{confirm === 'APPROVE' ? `Guardian rated this payment ${a.risk_score}/100 (${a.risk_level} risk). Only approve if you have confirmed with ${a.customer.split(' ')[0]} that they intended to make it.` : 'The payment will not be sent. The security team is notified and can follow up with the customer.'}</div>
            <div className="field"><label htmlFor="an">Note (optional)</label><textarea id="an" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={confirm === 'APPROVE' ? 'e.g. Spoke to Dad, he made this purchase' : 'e.g. Dad did not make this payment'} /></div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setConfirm(null)} disabled={pending}>Cancel</button>
              <Button className={confirm === 'APPROVE' ? 'good' : 'primary'} pending={pending} onClick={decide}>{confirm === 'APPROVE' ? 'Yes, approve payment' : 'Keep on hold'}</Button></div>
          </div>)}
      </Modal>
    </motion.div>
  );
}
