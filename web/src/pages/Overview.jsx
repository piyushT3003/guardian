import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, ShieldAlert, Users, Radio, Lock, PauseCircle, CheckCircle2, LifeBuoy, ShieldCheck, ScanLine, Play, AlertTriangle, BellRing, ArrowRight, Activity, MapPinned, Search, FileBarChart } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { ago, hourLabel, inr, compact } from '../lib/format.js';
import { Card, CardHead, Kpi, Score, Status, ErrorBox, PageLoading, stagger, DataTag, TopbarActions, Empty } from '../components/ui.jsx';
import { AreaTrend, Donut, LegendList, C } from '../components/charts.jsx';
const Shield3D = lazy(() => import('../components/Shield3D.jsx'));

const HEALTH_TONE = { operational: 'var(--good)', degraded: 'var(--warn)', down: 'var(--bad)', not_configured: 'var(--ink-4)' };

export default function Overview() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi('/overview', { live: ['transaction', 'notification'] });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <PageLoading />;
  const k = data.kpis, d = data.distribution, tot = d.low + d.medium + d.high;
  const seg = [{ label: 'Low risk', value: d.low, color: C.good }, { label: 'Medium risk', value: d.medium, color: C.warn }, { label: 'High risk', value: d.high, color: C.bad }];
  const peak = data.hours.reduce((m, h) => (h.total > m.total ? h : m), data.hours[0]);
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <TopbarActions><button className="btn primary" onClick={() => nav('/demo')}><Play size={16} />Run demo</button></TopbarActions>
      <CommandHero data={data} nav={nav} />
      <div className="kpis">
        <Kpi icon={BarChart3} tone="brand" value={k.total} label="Total transactions" delta={k.weekOverWeek.total} onClick={() => nav('/transactions')} />
        <Kpi icon={ScanLine} tone="info" value={k.analysed} label="Transactions analysed" onClick={() => nav('/analytics')} />
        <Kpi icon={ShieldAlert} tone="bad" value={k.highRisk} label="High-risk transactions" delta={k.weekOverWeek.high} deltaGoodWhenUp={false} onClick={() => nav('/transactions?risk=high')} />
        <Kpi icon={Users} tone="warn" value={k.pendingApprovals} label="Pending family approvals" onClick={() => nav('/approvals')} />
        <Kpi icon={PauseCircle} tone="info" value={k.onHold} label="Payments on hold / review" onClick={() => nav('/investigations')} />
        <Kpi icon={CheckCircle2} tone="good" value={k.completed} label="Completed payments" delta={k.weekOverWeek.completed} onClick={() => nav('/transactions?status=completed')} />
        <Kpi icon={LifeBuoy} tone="brand" value={k.recoveryRequests} label={`Recovery requests${k.openRecoveries ? ` · ${k.openRecoveries} open` : ''}`} onClick={() => nav('/recovery')} />
        <Kpi icon={ShieldCheck} tone="good" value={k.recovered} label="Payments recovered (simulated)" onClick={() => nav('/recovery')} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.7fr) minmax(280px, 0.9fr)' }} data-resp="ov-row">
        <Card>
          <CardHead title="Transaction activity" sub="Last 24 hours" right={<DataTag />} />
          <div className="row small muted" style={{ marginTop: -8, marginBottom: 6 }}>Peak <b style={{ color: 'var(--ink)', margin: '0 4px' }}>{peak.total}</b> transactions at {hourLabel(peak.t)}</div>
          <AreaTrend data={data.hours} height={250} xFormat={hourLabel} series={[{ key: 'total', label: 'All transactions', color: C.c1 }, { key: 'high', label: 'High risk', color: C.c4 }]} />
          <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: C.c1 }} />All transactions</span><span><i style={{ background: C.c4 }} />High risk</span></div>
        </Card>
        <Card>
          <CardHead title="Risk distribution" sub="All time" />
          <div style={{ display: 'grid', placeItems: 'center', margin: '4px 0 18px' }}><Donut segments={seg} centerLabel="Transactions" /></div>
          <LegendList items={seg} total={tot} />
        </Card>
      </div>

      <div className="grid g-3">
        <Card>
          <CardHead title="Recent alerts" right={<button className="btn ghost sm" onClick={() => nav('/notifications')}>View all <ArrowRight size={14} /></button>} />
          {data.alerts.length === 0 ? <Empty icon={BellRing} title="No alerts" /> : data.alerts.map((a) => (
            <div key={a.id} className="lrow clickable" onClick={() => a.transaction_id ? nav(`/intelligence/${a.transaction_id}`) : nav('/notifications')}>
              <div className={`l-ico ${a.severity === 'critical' ? 'tone-bad' : a.severity === 'success' ? 'tone-good' : 'tone-warn'}`}>{a.channel === 'recovery' ? <LifeBuoy /> : <AlertTriangle />}</div>
              <div className="l-main"><div className="l-t">{a.title}</div><div className="l-s">{a.body}</div></div>
              <span className="xs muted" style={{ whiteSpace: 'nowrap' }}>{ago(a.created_at, data.serverNow)}</span>
            </div>))}
        </Card>
        <Card>
          <CardHead title="Latest suspicious transactions" right={<button className="btn ghost sm" onClick={() => nav('/transactions?risk=high,medium')}>All <ArrowRight size={14} /></button>} />
          {data.suspicious.map((t) => (
            <div key={t.id} className="lrow clickable" onClick={() => nav(`/intelligence/${t.id}`)}>
              <Score v={t.risk_score} level={t.risk_level} />
              <div className="l-main"><div className="l-t">{t.customer} → {t.recipient}</div><div className="l-s">{t.id} · {t.city} · {ago(t.created_at, data.serverNow)}</div></div>
              <div style={{ textAlign: 'right' }}><div className="bold small tabular">{inr(t.amount)}</div><Status s={t.status} /></div>
            </div>))}
        </Card>
        <div className="stack">
          <Card>
            <CardHead title="System health" right={<button className="btn ghost sm" onClick={() => nav('/health')}>Details <ArrowRight size={14} /></button>} />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {data.health.checks.map((c) => (
                <div key={c.key} className="row small" style={{ gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: HEALTH_TONE[c.status], boxShadow: `0 0 0 4px ${HEALTH_TONE[c.status]}22` }} />
                  <span className="ellipsis">{c.label}</span>
                </div>))}
            </div>
            {data.health.errors24 > 0 && <div className="xs muted" style={{ marginTop: 10 }}>{data.health.errors24} warning/error event(s) in 24h</div>}
          </Card>
          <Card>
            <CardHead title="Quick access" />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[[Activity, 'Live stream', '/transactions'], [Search, 'Investigate', '/investigations'], [MapPinned, 'Geo intel', '/geo'], [FileBarChart, 'Reports', '/reports']].map(([I, l, to]) => (
                <button key={to} className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => nav(to)}><I color="var(--brand)" />{l}</button>))}
            </div>
          </Card>
        </div>
      </div>

      <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }} className="hero-strip">
        <div className="row wrap" style={{ gap: 20, justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 520 }}>
            <h3>Run demo scenarios</h3>
            <p>Run Guardian's two end-to-end workflows on the live backend: fraud prevention with family approval, and recovery after a mistaken approval.</p>
          </div>
          <div className="row wrap" style={{ gap: 12 }}>
            <button className="scenario-btn" onClick={() => nav('/demo?s=1')}><span className="play"><Play size={18} /></span><span><span className="xs bold" style={{ color: 'var(--brand)' }}>Scenario 1</span><br /><b>Family-assisted fraud prevention</b></span></button>
            <button className="scenario-btn" onClick={() => nav('/demo?s=2')}><span className="play"><Play size={18} /></span><span><span className="xs bold" style={{ color: 'var(--brand)' }}>Scenario 2</span><br /><b>Recovery after mistaken approval</b></span></button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Signature hero: live protection status, rotating feed of flagged payments, and the 3D shield. */
function CommandHero({ data, nav }) {
  const k = data.kpis;
  const feed = data.suspicious;
  const [i, setI] = useState(0);
  useEffect(() => { if (feed.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % feed.length), 3600); return () => clearInterval(t); }, [feed.length]);
  const cur = feed[i];
  const online = data.health.checks.every((c) => c.status !== 'down');
  const blockedRate = k.highRisk ? Math.round(((k.highRisk - (k.recoveryRequests - k.recovered)) / k.highRisk) * 100) : 100;
  const held = feed.find((t) => ['PENDING_FAMILY_APPROVAL', 'ON_HOLD', 'UNDER_REVIEW'].includes(t.status));
  return (
    <motion.section className="card command-hero" initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
      <div className="ch-copy">
        <span className="ch-eyebrow"><Radio size={13} />{online ? 'Live · all protection services online' : 'Service disruption detected'}</span>
        <h2>Every payment scored.<br /><span className="grad">Every risky one held.</span></h2>
        <div className="muted" style={{ maxWidth: 480, fontSize: 14.5 }}>Guardian has analysed {k.analysed.toLocaleString('en-IN')} payments and kept {compact(k.protectedValue)} from leaving customer accounts through holds, blocks and recoveries.</div>
        <div className="ch-stats">
          <div className="ch-stat"><b className="tabular">{compact(k.protectedValue)}</b><span>Value protected</span></div>
          <div className="ch-stat"><b className="tabular">{Math.max(0, Math.min(100, blockedRate))}%</b><span>High-risk stopped or recovered</span></div>
          <div className="ch-stat"><b className="tabular">{k.pendingApprovals + k.onHold + k.openRecoveries}</b><span>Awaiting a decision</span></div>
        </div>
        {cur && (
          <button className="ticker" style={{ border: 0, cursor: 'pointer', textAlign: 'left', color: '#fff', width: '100%' }} onClick={() => nav(`/intelligence/${cur.id}`)}>
            <span className="tk-dot" />
            <span style={{ opacity: 0.6, fontWeight: 600 }}>Latest flagged</span>
            <span style={{ position: 'relative', flex: 1, height: 18, overflow: 'hidden' }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={cur.id} style={{ position: 'absolute', inset: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={{ duration: 0.45 }}>
                  <b>{cur.id}</b> · {cur.customer} → {cur.recipient} · {inr(cur.amount)} · score {cur.risk_score}
                </motion.span>
              </AnimatePresence>
            </span>
            <ArrowRight size={14} />
          </button>)}
        <div className="row wrap">
          <button className="btn primary lg" onClick={() => nav('/demo')}><Play size={17} />Run a live scenario</button>
          <button className="btn lg" onClick={() => nav('/transactions')}><Activity size={17} />Open live stream</button>
        </div>
      </div>
      <div className="ch-scene">
        <Suspense fallback={<div style={{ height: 380 }} />}><Shield3D height={380} /></Suspense>
        {held && (
          <motion.div className="float-chip" style={{ top: 34, right: 26 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0, y: [0, -6, 0] }} transition={{ delay: 0.6, y: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }}>
            <span className="k-ico tone-warn" style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center' }}><Lock size={15} /></span>
            <span><b>{inr(held.amount)} held</b><br /><span className="muted">{held.id} · score {held.risk_score}</span></span>
          </motion.div>)}
        <motion.div className="float-chip" style={{ bottom: 34, left: 18 }} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0, y: [0, 6, 0] }} transition={{ delay: 0.8, y: { duration: 6, repeat: Infinity, ease: 'easeInOut' } }}>
          <span className="k-ico tone-good" style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center' }}><ShieldCheck size={15} /></span>
          <span><b>{k.recovered} payments recovered</b><br /><span className="muted">{k.recoveryRequests} recovery windows opened</span></span>
        </motion.div>
      </div>
    </motion.section>
  );
}
