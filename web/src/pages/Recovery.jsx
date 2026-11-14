import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Repeat, ShieldCheck, XCircle, ArrowLeft, LifeBuoy, CheckCircle2, Hourglass, Loader2, Info, User, Store, Clock, Wallet, Users, UserCog, Hash } from 'lucide-react';
import { useApi, useServerNow } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/auth.jsx';
import { inr, dateTime, timeS, ago, mmss, time } from '../lib/format.js';
import Burst from '../components/Burst.jsx';
import { Card, CardHead, Status, ErrorBox, Loading, Empty, Seg, Modal, Button, stagger, rise, Notice, ease } from '../components/ui.jsx';

export default function Recovery() {
  const { id } = useParams();
  const nav = useNavigate();
  const [view, setView] = useState('all');
  const { data, error, loading, reload } = useApi('/recoveries', { live: ['transaction', 'notification'] });
  const now = useServerNow(data?.serverNow, 200);
  const items = data?.items || [];
  const list = items.filter((r) => (view === 'active' ? ['OPEN', 'INITIATED'].includes(r.status) : view === 'done' ? !['OPEN', 'INITIATED'].includes(r.status) : true));
  const active = items.filter((r) => r.status === 'OPEN' && r.deadline > now);
  const sel = items.find((r) => String(r.id) === id) || active[0] || list[0];
  const { user } = useAuth();
  const switchAdmin = useSwitchToAdmin();
  return (
    <div className="stack">
    {data && (active.length === 0 || user.role !== 'admin') && (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="hero-strip" style={{ padding: 22 }}>
        <div className="row wrap" style={{ gap: 18, justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 680 }}>
            <h3>{active.length === 0 ? 'No payment is inside a recovery window right now' : `${active.length} payment${active.length > 1 ? 's are' : ' is'} waiting for an administrator`}</h3>
            <p>{active.length === 0
              ? 'Guardian opens a five-minute recovery window automatically when a high-risk payment settles after a family member approves it. The requests listed below have already been decided or have expired, so they have no recovery buttons. Run Scenario 2 to create a new one.'
              : `Only administrators can initiate or decline a recovery. You're signed in as ${user.name} (${user.title}).`}</p>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            {active.length === 0 && <button className="scenario-btn" onClick={() => nav('/demo?s=2')}><span className="play"><Play size={18} /></span><span><span className="xs bold" style={{ color: 'var(--brand)' }}>Scenario 2</span><br /><b>Open a recovery window</b></span></button>}
            {user.role !== 'admin' && switchAdmin.available && <button className="scenario-btn" onClick={() => switchAdmin.run(active[0] ? `/recovery/${active[0].id}` : '/recovery')}><span className="play"><Repeat size={18} /></span><span><span className="xs bold" style={{ color: 'var(--brand)' }}>Administrator</span><br /><b>Sign in as Neha Kapoor</b></span></button>}
          </div>
        </div>
      </motion.div>)}
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: 'minmax(290px, 360px) minmax(0, 1fr)', alignItems: 'start' }} data-resp="ov-row">
      <Card variants={rise}>
        <CardHead title="Recovery queue" />
        <Seg value={view} onChange={setView} options={[{ value: 'active', label: `Active · ${items.filter((r) => ['OPEN', 'INITIATED'].includes(r.status)).length}` }, { value: 'done', label: 'History' }, { value: 'all', label: 'All' }]} />
        <div className="stack" style={{ gap: 10, marginTop: 14 }}>
          <ErrorBox error={error} onRetry={reload} />
          {loading && !data ? <Loading rows={4} height={64} /> : list.length === 0 ? <Empty icon={LifeBuoy} title={view === 'active' ? 'No active recovery windows' : 'No recovery history'}>{view === 'active' ? 'When a high-risk payment settles after approval, Guardian opens a five-minute recovery window here.' : ''}</Empty> :
            list.map((r) => {
              const left = r.deadline - now;
              return (
                <button key={r.id} className={`queue-item ${sel?.id === r.id ? 'on' : ''}`} onClick={() => nav(`/recovery/${r.id}`)}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b>{r.transaction_id}</b>{r.status === 'OPEN' && left > 0 ? <span className="badge b-bad tabular">{mmss(left)}</span> : <Status s={r.status} />}</div>
                  <div className="small" style={{ marginTop: 4 }}>{r.customer} → {r.recipient}</div>
                  <div className="row xs muted" style={{ justifyContent: 'space-between', marginTop: 4 }}><span>Opened {ago(r.opened_at, now)}</span><b style={{ color: 'var(--ink)', fontSize: 12.5 }}>{inr(r.amount)}</b></div>
                </button>);
            })}
        </div>
      </Card>
      <AnimatePresence mode="wait">{sel ? <Detail key={sel.id} r={sel} now={now} canDecide={data.canDecide} reload={reload} /> : <Card><Empty icon={LifeBuoy} title="Select a recovery request" /></Card>}</AnimatePresence>
    </motion.div>
    </div>
  );
}

function Countdown({ r, now }) {
  const [celebrate, setCelebrate] = useState(0);
  const prev = useRef(r.status);
  useEffect(() => { if (prev.current !== 'RECOVERED' && r.status === 'RECOVERED') setCelebrate((n) => n + 1); prev.current = r.status; }, [r.status]);
  const total = r.deadline - r.opened_at, left = Math.max(0, r.deadline - now);
  const frac = r.status === 'OPEN' ? left / total : r.status === 'INITIATED' ? 1 : 0;
  const size = 230, stroke = 16, rad = (size - stroke) / 2, C = 2 * Math.PI * rad;
  const urgent = r.status === 'OPEN' && left < 60000;
  const colors = r.status === 'RECOVERED' ? ['#4ee39a', '#0e9f5e'] : urgent ? ['#ff8a7a', '#e2342a'] : ['#a48bff', '#4f6bff'];
  const center = {
    OPEN: left > 0 ? [mmss(left), 'Remaining'] : ['00:00', 'Window closed'],
    INITIATED: [null, 'Reversing payment…'], RECOVERED: [null, 'Funds recovered'], DECLINED: [null, 'Recovery declined'], EXPIRED: ['00:00', 'Window expired'], FAILED: [null, 'Reversal failed'],
  }[r.status];
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <div style={{ position: 'absolute', inset: -120, pointerEvents: 'none' }}><Burst fire={celebrate} /></div>
      {urgent && <motion.div style={{ position: 'absolute', inset: 6, borderRadius: '50%', boxShadow: '0 0 0 0 rgba(240,68,56,.5)' }} animate={{ boxShadow: ['0 0 0 0 rgba(240,68,56,.45)', '0 0 0 22px rgba(240,68,56,0)'] }} transition={{ duration: 1.3, repeat: Infinity }} />}
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 16px 26px ${colors[1]}55)` }}>
        <defs><linearGradient id="cdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={colors[0]} /><stop offset="1" stopColor={colors[1]} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={rad} stroke="#efecf8" strokeWidth={stroke} fill="none" />
        {Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * 2 * Math.PI; const r1 = rad - stroke / 2 - 8, r2 = r1 - (i % 5 === 0 ? 7 : 3); return <line key={i} x1={size / 2 + r1 * Math.cos(a)} y1={size / 2 + r1 * Math.sin(a)} x2={size / 2 + r2 * Math.cos(a)} y2={size / 2 + r2 * Math.sin(a)} stroke="#d9d3f0" strokeWidth={i % 5 === 0 ? 2 : 1} />; })}
        <motion.circle cx={size / 2} cy={size / 2} r={rad} stroke="url(#cdg)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - frac) }} transition={{ duration: 0.3, ease: 'linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <AnimatePresence mode="wait">
          <motion.div key={r.status} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.35, ease }}>
            {center[0] ? <div className="tabular" style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: urgent ? 'var(--bad-ink)' : 'var(--ink)' }}>{center[0]}</div> :
              r.status === 'INITIATED' ? <Loader2 size={44} color="var(--brand)" style={{ animation: 'spin 1s linear infinite' }} /> :
              r.status === 'RECOVERED' ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}><CheckCircle2 size={56} color="var(--good)" /></motion.div> :
              r.status === 'FAILED' ? <XCircle size={52} color="var(--bad)" /> : <Hourglass size={44} color="var(--ink-3)" />}
            <div className="small muted bold" style={{ marginTop: 6 }}>{center[1]}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Detail({ r, now, canDecide, reload }) {
  const { user } = useAuth();
  const switchAdmin = useSwitchToAdmin();
  const toast = useToast();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const tx = useApi(`/transactions/${r.transaction_id}`, { live: ['transaction', 'audit'] });
  const open = r.status === 'OPEN' && r.deadline > now;
  useEffect(() => { if (r.status === 'OPEN' && r.deadline <= now) { const t = setTimeout(() => reload(true), 2500); return () => clearTimeout(t); } }, [r.status, r.deadline <= now]); // eslint-disable-line
  const act = async () => {
    setPending(true);
    try {
      await api(`/recoveries/${r.id}/${confirm === 'INITIATE' ? 'initiate' : 'decline'}`, { method: 'POST', body: { note: note || undefined }, idempotent: true });
      toast({ title: confirm === 'INITIATE' ? 'Recovery initiated' : 'Recovery declined', body: confirm === 'INITIATE' ? 'Waiting for the payment simulator to confirm the reversal…' : r.transaction_id, tone: 'info' });
      setConfirm(null); setNote(''); reload(true); tx.reload(true);
    } catch (e) { toast({ title: 'Action rejected', body: e.message, tone: 'bad' }); reload(true); } finally { setPending(false); }
  };
  const recoveryAudit = tx.data?.audit?.filter((a) => a.at >= (r.opened_at - 60 * 60e3)) || [];
  return (
    <motion.div className="stack" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.4, ease }}>
      <Card style={{ background: r.status === 'RECOVERED' ? 'radial-gradient(600px 300px at 20% 0%, #e6f9ef, #fff 60%)' : open ? 'radial-gradient(600px 300px at 20% 0%, #f1ecff, #fff 60%)' : undefined }}>
        <div className="row wrap" style={{ gap: 30, alignItems: 'center' }}>
          <Countdown r={r} now={now} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => nav('/recovery')} aria-label="Back to queue"><ArrowLeft size={16} /></button>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Recovery request — {r.transaction_id}</div>
              {open ? <span className="badge b-bad">Urgent</span> : <Status s={r.status} />}
            </div>
            <dl className="kv" style={{ marginTop: 16, maxWidth: 520 }}>
              <dt><Wallet />Amount</dt><dd style={{ fontSize: 18 }}>{inr(r.amount)}</dd>
              <dt><Store />Recipient</dt><dd>{r.recipient}</dd>
              <dt><Clock />Completed at</dt><dd>{timeS(r.tx_completed_at)}</dd>
              <dt><Hourglass />Recovery deadline</dt><dd style={{ color: open ? 'var(--bad-ink)' : undefined }}>{timeS(r.deadline)} ({Math.round((r.deadline - r.opened_at) / 60000)} minutes)</dd>
            </dl>
            {r.status === 'OPEN' && (
              <div className="row wrap" style={{ marginTop: 20, gap: 12 }}>
                <Button className="primary lg" disabled={!open || !canDecide} onClick={() => setConfirm('INITIATE')}><ShieldCheck />INITIATE PAYMENT RECOVERY</Button>
                <Button className="danger lg" disabled={!open || !canDecide} onClick={() => setConfirm('DECLINE')}><XCircle />DECLINE RECOVERY</Button>
              </div>)}
            {r.status === 'OPEN' && open && !canDecide && (
              <div className="row wrap" style={{ marginTop: 10, gap: 10 }}>
                <span className="xs muted">Only administrators can decide recovery requests. You're signed in as {user.title}.</span>
                {switchAdmin.available && <button className="btn sm primary" onClick={() => switchAdmin.run(`/recovery/${r.id}`)}><Repeat size={14} />Sign in as administrator</button>}
              </div>)}
            {r.status === 'OPEN' && !open && <div className="xs bold" style={{ marginTop: 8, color: 'var(--bad-ink)' }}>The recovery window has closed. Actions are disabled.</div>}
            {r.status === 'INITIATED' && <Notice icon={Loader2}>Reversal submitted at {timeS(r.decided_at)} by {r.decided_by_name}. Guardian will report success only after the payment simulator confirms the reversal.</Notice>}
            {r.status === 'RECOVERED' && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="notice" style={{ marginTop: 16, background: 'linear-gradient(135deg,#ebfaf2,#f3fff8)' }}><CheckCircle2 style={{ color: 'var(--good)' }} /><div><b>Funds recovered.</b> The payment simulator confirmed reversal <b>{r.reversal_ref}</b> at {timeS(r.completed_at)}.</div></motion.div>}
            {r.status === 'DECLINED' && <Notice>Declined by {r.decided_by_name} at {timeS(r.decided_at)}{r.note ? ` — “${r.note}”` : ''}.</Notice>}
            {r.status === 'EXPIRED' && <Notice icon={Hourglass}>No administrator decision was recorded before the five-minute deadline, so the recovery action is now disabled.</Notice>}
            {!['OPEN', 'INITIATED'].includes(r.status) && (
              <div className="row wrap" style={{ marginTop: 14, gap: 10 }}>
                <span className="small muted">This request is closed, so there is nothing to initiate. Recovery buttons appear only while a window is open.</span>
                {user.role !== 'family' && <button className="btn sm primary" onClick={() => nav('/demo?s=2')}><Play size={14} />Open a new recovery window</button>}
              </div>)}
          </div>
        </div>
      </Card>

      <div className="grid g-3">
        <Card><CardHead title="Original transaction" />
          <dl className="kv"><dt><Hash />ID</dt><dd>{r.transaction_id}</dd><dt>Created</dt><dd>{dateTime(r.tx_created_at)}</dd><dt>Settled</dt><dd>{dateTime(r.tx_completed_at)}</dd><dt>Payment ref</dt><dd>{r.payment_ref}</dd><dt>Risk score</dt><dd>{r.risk_score}/100</dd><dt>Status</dt><dd><Status s={r.tx_status} /></dd></dl>
          <button className="btn sm" style={{ marginTop: 12 }} onClick={() => nav(`/intelligence/${r.transaction_id}`)}>Open intelligence</button>
        </Card>
        <Card><CardHead title="Parties" />
          <dl className="kv"><dt><User />Customer</dt><dd>{r.customer}</dd><dt>Phone</dt><dd>{r.customer_phone}</dd><dt><Store />Recipient</dt><dd>{r.recipient}</dd><dt>VPA</dt><dd className="small">{r.recipient_vpa}</dd><dt>Location</dt><dd>{r.city}</dd></dl>
        </Card>
        <Card><CardHead title="Approval & administration" />
          <dl className="kv"><dt><Users />Family</dt><dd>{r.family_name ? `${r.family_name} (${r.relation})` : '—'}</dd><dt>Family decision</dt><dd>{r.approval_status ? <Status s={r.approval_status} /> : '—'}</dd><dt>Decided</dt><dd>{r.approval_decided_at ? time(r.approval_decided_at) : '—'}</dd>
            <dt><UserCog />Administrator</dt><dd>{r.decided_by_name || 'Awaiting decision'}</dd><dt>Admin decision</dt><dd>{r.decided_at ? timeS(r.decided_at) : '—'}</dd></dl>
        </Card>
      </div>
      <Card>
        <CardHead title="Recovery history" sub="From the audit trail" />
        {!tx.data ? <Loading rows={4} /> : recoveryAudit.map((a) => <div key={a.id} className="row small" style={{ padding: '8px 0', borderBottom: '1px solid #f3f1fa', gap: 14 }}><span className="muted tabular" style={{ width: 100 }}>{timeS(a.at)}</span><span style={{ flex: 1 }}>{a.action}</span><span className="muted">{a.actor}</span></div>)}
        <div className="xs muted" style={{ marginTop: 10 }}><Info size={12} style={{ verticalAlign: -2 }} /> Reason: {r.reason}</div>
      </Card>

      <Modal open={!!confirm} onClose={() => !pending && setConfirm(null)}>
        {confirm && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="bold" style={{ fontSize: 18 }}>{confirm === 'INITIATE' ? 'Initiate payment recovery?' : 'Decline recovery?'}</div>
            <div className="small">{confirm === 'INITIATE' ? `A reversal of ${inr(r.amount)} from ${r.recipient} will be submitted to the payment simulator.` : 'The settled payment will remain with the recipient. This cannot be undone.'} Time remaining: <b className="tabular">{mmss(r.deadline - now)}</b>.</div>
            <div className="field"><label htmlFor="rn">Note (optional)</label><textarea id="rn" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setConfirm(null)} disabled={pending}>Cancel</button><Button className={confirm === 'INITIATE' ? 'primary' : 'danger-solid'} pending={pending} disabled={!open} onClick={act}>{confirm === 'INITIATE' ? 'Initiate recovery' : 'Decline recovery'}</Button></div>
          </div>)}
      </Modal>
    </motion.div>
  );
}

/** Demo convenience: signs in as the seeded administrator (real sign-in, so the API still enforces roles). */
function useSwitchToAdmin() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [acc, setAcc] = useState(null);
  useEffect(() => { api('/auth/demo-accounts').then(setAcc).catch(() => setAcc(null)); }, []);
  const admin = acc?.accounts?.find((a) => a.role === 'admin');
  return {
    available: !!(admin && acc?.password),
    run: async (to) => { await login(admin.email, acc.password); nav(to); },
  };
}
