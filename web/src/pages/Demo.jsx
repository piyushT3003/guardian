import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Check, Loader2, Users, LifeBuoy, ShieldAlert, Bell, Activity, Lock, Repeat, ScanSearch, RotateCcw, CircleDot, ArrowRight } from 'lucide-react';
import { useApi, useServerNow } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/auth.jsx';
import { inr, mmss, timeS } from '../lib/format.js';
import { Card, CardHead, Score, Status, Seg, ErrorBox, Button, stagger, rise, ease, Notice, Source } from '../components/ui.jsx';
import { RiskBreakdown } from './Intelligence.jsx';

export const DEMO_KEY = 'guardian.demoRun';
const store = { get: () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch { return null; } }, set: (v) => { try { v ? localStorage.setItem(DEMO_KEY, JSON.stringify(v)) : localStorage.removeItem(DEMO_KEY); } catch {} } };
export const demoStore = store;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stages(run, scenario) {
  const f = run?.focus, a = run?.approval, r = run?.recovery, n = run?.notifications || [];
  const has = (ch) => n.some((x) => x.channel === ch);
  const base = [
    { k: 'seq', t: 'Transaction sequence begins', d: run ? `${run.index}/${run.steps.length} transactions ingested` : 'Three payments for the customer', done: run?.index > 0, active: run && run.index < run.steps.length },
    { k: 'analyse', t: 'Guardian analyses each payment', d: 'Behaviour · recipient · amount · velocity · location · anomaly model', done: !!f || run?.index > 0 },
    { k: 'flag', t: 'Suspicious transaction identified', d: f ? `${f.id} scored ${f.risk_score}/100` : 'Awaiting the third payment', done: f?.risk_level === 'high' },
    { k: 'alert', t: 'Company security team alerted', d: 'Notification in the security channel', done: has('security') },
    { k: 'family', t: `Family member notified (${run?.family?.name || 'trusted family'})`, d: 'Approval request delivered', done: has('family') },
    { k: 'pending', t: 'Payment held: PENDING_FAMILY_APPROVAL', d: 'The payment cannot complete without authorised approval', done: !!a, active: a?.status === 'PENDING' },
  ];
  if (scenario === 1) return [...base,
    { k: 'decide', t: 'Family member decides', d: a && a.status !== 'PENDING' ? `Decision: ${a.status}` : 'APPROVE PAYMENT or KEEP PAYMENT ON HOLD', done: a && a.status !== 'PENDING', action: a?.status === 'PENDING' ? 'family' : null },
    { k: 'final', t: 'Backend validates & updates state', d: f ? `Transaction is now ${f.status.replaceAll('_', ' ')}` : '', done: f && ['ON_HOLD', 'COMPLETED', 'BLOCKED'].includes(f.status) && a?.status !== 'PENDING' },
  ];
  return [...base,
    { k: 'mistake', t: 'Family member mistakenly approves', d: a?.status === 'APPROVED' ? 'Approved' : a?.status === 'HELD' ? 'Held — this scenario expects an approval' : 'Approve the payment as the family member', done: a?.status === 'APPROVED', action: a?.status === 'PENDING' ? 'family' : null },
    { k: 'settle', t: 'Payment simulator completes the payment', d: f?.completed_at ? `Settled ${timeS(f.completed_at)} · ${f.payment_ref}` : '', done: !!f?.completed_at, active: f?.status === 'PROCESSING' },
    { k: 'raise', t: 'Recovery request raised · 5-minute countdown', d: r ? `Deadline ${timeS(r.deadline)}` : '', done: !!r },
    { k: 'admin', t: 'Administrator alerted & decides', d: r && r.status !== 'OPEN' ? `Decision: ${r.status}` : 'INITIATE PAYMENT RECOVERY or DECLINE RECOVERY', done: r && r.status !== 'OPEN', action: r?.status === 'OPEN' ? 'admin' : null },
    { k: 'outcome', t: 'Outcome persisted across Guardian', d: f ? `Transaction is now ${f.status.replaceAll('_', ' ')}` : '', done: r && ['RECOVERED', 'DECLINED', 'EXPIRED', 'FAILED'].includes(r.status), active: r?.status === 'INITIATED' },
  ];
}

export default function Demo() {
  const nav = useNavigate();
  const toast = useToast();
  const { user, login } = useAuth();
  const [sp, setSp] = useSearchParams();
  const scenario = Number(sp.get('s') || store.get()?.scenario || 1);
  const runId = sp.get('run') || (store.get()?.scenario === scenario ? store.get()?.id : null);
  const defs = useApi('/demo/scenarios', { live: [] });
  const run = useApi(runId ? `/demo/runs/${runId}` : null, { skip: !runId, live: ['transaction', 'notification', 'audit'] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const now = useServerNow(run.data?.now, 250);
  const auto = useRef(false);
  const def = defs.data?.find((d) => d.id === scenario);
  const R = run.data;
  const st = stages(R, scenario);

  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api(`/demo/${scenario}/start`, { method: 'POST' });
      store.set({ id: r.id, scenario, returnEmail: user.email });
      setSp({ s: String(scenario), run: r.id }, { replace: true });
      auto.current = true;
    } catch (e) { setErr(e); setBusy(false); }
  };
  // Ingest the sequence one payment at a time so each analysis is visible.
  useEffect(() => {
    if (!auto.current || !R || R.id !== runId) return;
    if (R.index >= R.steps.length) { auto.current = false; setBusy(false); return; }
    let cancel = false;
    (async () => { await sleep(R.index === 0 ? 400 : 1300); if (cancel) return; try { const r = await api(`/demo/runs/${R.id}/next`, { method: 'POST', idempotent: `${R.id}-${R.index}` }); run.setData(r); } catch (e) { setErr(e); auto.current = false; setBusy(false); } })();
    return () => { cancel = true; };
  }, [R?.index, R?.id]); // eslint-disable-line

  const actAs = async (who) => {
    const accounts = await api('/auth/demo-accounts');
    const email = who === 'family' ? R.family.email : accounts.accounts.find((a) => a.role === 'admin')?.email;
    if (!accounts.password) { toast({ title: 'Demo sign-in unavailable', body: 'Sign in manually as the required user.', tone: 'warn' }); return; }
    store.set({ id: R.id, scenario, returnEmail: user.email });
    await login(email, accounts.password);
    nav(who === 'family' ? `/approvals/${R.approval.id}` : `/recovery/${R.recovery.id}`);
  };
  const reset = () => { store.set(null); auto.current = false; setBusy(false); setSp({ s: String(scenario) }, { replace: true }); };

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <Card variants={rise} className="hero-strip" style={{ padding: 24 }}>
        <div className="row wrap" style={{ gap: 18, justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 640 }}>
            <h3>Flagship demo scenarios</h3>
            <p>Each scenario runs on the live backend: real ingestion, real fraud scoring, real approval and recovery endpoints, and persisted database state. Decisions are made by signing in as the authorised user.</p>
          </div>
          <div className="seg" style={{ background: 'rgba(255,255,255,.2)' }}>
            {[1, 2].map((s) => <button key={s} className={scenario === s ? 'on' : ''} style={{ color: '#fff' }} onClick={() => { auto.current = false; setBusy(false); setSp({ s: String(s) }, { replace: true }); }}>
              {scenario === s && <motion.span layoutId="demo-seg" className="seg-pill" />}<span style={{ position: 'relative', color: scenario === s ? 'var(--brand)' : '#fff' }}>Scenario {s}</span></button>)}
          </div>
        </div>
      </Card>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', alignItems: 'start' }} data-resp="ov-row">
        <Card variants={rise}>
          <CardHead title={def ? `Scenario ${scenario} — ${def.title}` : 'Scenario'} right={R ? <button className="btn sm ghost" onClick={reset}><RotateCcw size={14} />New run</button> : null} />
          {!R ? (
            <div className="stack">
              <div className="small" style={{ color: 'var(--ink-2)' }}>{scenario === 1 ? 'A suspicious payment is held until the trusted family member decides. The payment must not complete before authorised approval.' : 'The family member approves a suspicious payment by mistake. Once the simulator settles it, Guardian opens a five-minute recovery window for the administrator.'}</div>
              <div className="stack" style={{ gap: 8 }}>
                {def?.steps.map((s, i) => <div key={i} className="queue-item row" style={{ cursor: 'default' }}><span className="avatar sm" style={{ background: i === 2 ? 'linear-gradient(135deg,#f97066,#e2342a)' : undefined }}>{i + 1}</span><div style={{ flex: 1 }}><b>{s.recipient.replace(' ····', '')}</b> · {inr(s.amount)} · {s.city}<div className="xs muted">{s.note}</div></div></div>)}
              </div>
              <ErrorBox error={err} />
              <Button className="primary lg" pending={busy} onClick={start}><Play />Start scenario {scenario}</Button>
            </div>
          ) : (
            <div className="stack">
              <div className="row small muted"><CircleDot size={14} color="var(--brand)" />Run <b style={{ color: 'var(--ink)' }}>{R.id}</b> · customer {R.customer.name} ({R.customer.home_city}) · family {R.family.name}</div>
              <AnimatePresence initial={false}>
                {R.steps.map((s, i) => { const t = R.transactions[i]; return (
                  <motion.div key={i} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`queue-item ${t?.risk_level === 'high' ? 'on' : ''}`} style={{ cursor: t ? 'pointer' : 'default', opacity: t ? 1 : 0.55 }} onClick={() => t && nav(`/intelligence/${t.id}`)}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="row" style={{ gap: 10 }}>{t ? <Score v={t.risk_score} level={t.risk_level} /> : <span className="score" style={{ background: '#f2f1f7' }}>{i === R.index && busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : '—'}</span>}
                        <span><b>{s.recipient}</b><div className="xs muted">{inr(s.amount)} · {s.city} {t && <Source s="demo" />}</div></span></span>
                      {t ? <Status s={t.status} /> : <span className="xs muted">{i === R.index && busy ? 'Analysing…' : 'Queued'}</span>}
                    </div>
                  </motion.div>); })}
              </AnimatePresence>
              {R.focus && <div><div className="bold small" style={{ margin: '6px 0' }}>Why {R.focus.id} was flagged</div><RiskBreakdown signals={JSON.parse(R.focus.signals).signals} score={R.focus.risk_score} />
                <div className="small" style={{ marginTop: 8 }}>{R.focus.explanation}</div></div>}
              {R.recovery?.status === 'OPEN' && <div className="notice" style={{ background: 'var(--bad-soft)' }}><LifeBuoy style={{ color: 'var(--bad-ink)' }} /><div><b className="tabular" style={{ fontSize: 18 }}>{mmss(R.recovery.deadline - now)}</b> left in the recovery window (backend deadline {timeS(R.recovery.deadline)}).</div></div>}
            </div>)}
        </Card>

        <Card variants={rise}>
          <CardHead icon={Activity} title="Scenario progress" sub="Driven by database state" />
          <div className="tl">
            {st.map((s, i) => (
              <motion.div key={s.k} className="tl-item" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04, ease }}>
                <div className="tl-node" style={{ background: s.done ? 'var(--good)' : s.active || s.action ? 'var(--brand)' : '#dcd8ea', color: '#fff' }}>{s.done ? <Check /> : s.active ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <span style={{ fontSize: 11, fontWeight: 800 }}>{i + 1}</span>}</div>
                <div style={{ padding: '6px 0 10px' }}>
                  <div className="bold small" style={{ color: s.done ? 'var(--ink)' : 'var(--ink-2)' }}>{s.t}</div>
                  <div className="xs muted">{s.d}</div>
                  {s.action === 'family' && <button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => actAs('family')}><Users size={14} />Sign in as {R.family.name} to decide</button>}
                  {s.action === 'admin' && <button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => actAs('admin')}><Repeat size={14} />Sign in as administrator to decide</button>}
                </div>
              </motion.div>))}
          </div>
          {R && (R.recovery ? ['RECOVERED', 'DECLINED', 'EXPIRED', 'FAILED'].includes(R.recovery.status) : scenario === 1 && R.approval && R.approval.status !== 'PENDING') && (
            <Notice icon={Check}><b>Scenario complete.</b> The dashboard, notifications, transaction history and audit trail now reflect this run. <a href="#" onClick={(e) => { e.preventDefault(); nav(`/intelligence/${R.focus.id}`); }}>Inspect {R.focus.id} <ArrowRight size={12} /></a></Notice>)}
        </Card>
      </div>

      {R && (
        <div className="grid g-2">
          <Card><CardHead icon={Bell} title="Notifications raised" sub={`${R.notifications.length}`} />
            {R.notifications.length === 0 ? <div className="small muted">None yet.</div> : R.notifications.map((n) => <div key={n.id} className="lrow"><div className={`l-ico ${n.channel === 'family' ? 'tone-good' : n.channel === 'recovery' ? 'tone-bad' : 'tone-warn'}`}>{n.channel === 'family' ? <Users /> : n.channel === 'recovery' ? <LifeBuoy /> : <ShieldAlert />}</div><div className="l-main"><div className="l-t">{n.title}</div><div className="l-s">{n.channel} · {timeS(n.created_at)}</div></div></div>)}
          </Card>
          <Card><CardHead icon={ScanSearch} title="Audit trail for this run" sub={`${R.audit.length} entries`} />
            <div style={{ maxHeight: 340, overflow: 'auto' }}>{R.audit.map((a) => <div key={a.id} className="row xs" style={{ gap: 10, padding: '6px 0', borderBottom: '1px solid #f3f1fa' }}><span className="muted tabular" style={{ width: 70 }}>{timeS(a.at)}</span><span style={{ flex: 1 }}>{a.action}</span><span className="muted">{a.actor}</span></div>)}</div>
          </Card>
        </div>)}
      {!R && <Notice icon={Lock}>Demo transactions use labelled <b>demo locations</b> and fresh recipient names. They are stored like any other transaction and appear in every workspace.</Notice>}
    </motion.div>
  );
}
