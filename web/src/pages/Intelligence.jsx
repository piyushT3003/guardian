import { lazy, Suspense, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, UserPlus, Coins, Fingerprint, Gauge, BrainCircuit, Sparkles, ShieldCheck, Wallet, User, Store, Calendar, Activity, Search, MapPinned, GitCommitVertical, FileSearch, ChevronRight, Check, Hash } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { inr, dateTime, km, time, ago, dayLabel } from '../lib/format.js';
import { Card, CardHead, Score, Status, RiskRing, Tabs, ErrorBox, PageLoading, stagger, Source, Empty, TopbarActions, ease } from '../components/ui.jsx';
import { C } from '../components/charts.jsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, ReferenceLine } from 'recharts';
const GeoMap = lazy(() => import('../components/GeoMap.jsx'));

export const SIG_ICON = { location: MapPin, recipient: UserPlus, amount: Coins, behaviour: Fingerprint, velocity: Gauge, anomaly: BrainCircuit };
const barColor = (s) => (s.score >= 0.66 ? 'linear-gradient(90deg,#ff8a7a,#f04438)' : s.score >= 0.33 ? 'linear-gradient(90deg,#ffc46b,#f79009)' : 'linear-gradient(90deg,#7ee2b0,#12b76a)');

export default function Intelligence() {
  const { id } = useParams();
  return id ? <Detail id={id} /> : <Picker />;
}

function Picker() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data, error } = useApi('/transactions?risk=high,medium&pageSize=12');
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <Card>
        <CardHead title="Analyse a transaction" sub="Open any transaction for a full risk breakdown" />
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/intelligence/${q.trim().toUpperCase()}`); }}>
          <div className="search-input" style={{ flex: 1 }}><Search /><input className="input" placeholder="Enter transaction ID, e.g. TXN784538" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className="btn primary"><FileSearch />Analyse</button>
        </form>
      </Card>
      <Card>
        <CardHead title="Recently flagged" sub="Medium and high risk" />
        <ErrorBox error={error} />
        <div className="grid g-3">
          {data?.items.map((t) => (
            <button key={t.id} className="queue-item" onClick={() => nav(`/intelligence/${t.id}`)}>
              <div className="row" style={{ justifyContent: 'space-between' }}><b>{t.id}</b><Score v={t.risk_score} level={t.risk_level} /></div>
              <div className="small" style={{ marginTop: 6 }}>{t.customer} → {t.recipient}</div>
              <div className="row small muted" style={{ justifyContent: 'space-between', marginTop: 4 }}><span>{t.city} · {ago(t.created_at)}</span><b style={{ color: 'var(--ink)' }}>{inr(t.amount)}</b></div>
            </button>))}
        </div>
      </Card>
    </motion.div>
  );
}

function Detail({ id }) {
  const nav = useNavigate();
  const [tab, setTab] = useState('overview');
  const { data, error, loading, reload } = useApi(`/transactions/${id}`);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <PageLoading />;
  const t = data.transaction;
  const level = t.risk_level;
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <TopbarActions>
        <button className="btn" onClick={() => nav(`/geo?tx=${t.id}`)}><MapPinned size={16} />Map</button>
        {data.investigation && <button className="btn primary" onClick={() => nav(`/investigations/${data.investigation.id}`)}><Search size={16} />Investigation</button>}
      </TopbarActions>
      <Card>
        <div className="row wrap" style={{ gap: 18 }}>
          <div className="k-ico tone-brand" style={{ width: 54, height: 54, borderRadius: 17, display: 'grid', placeItems: 'center' }}><FileSearch size={24} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="xs muted bold"><Link to="/intelligence">Transaction Intelligence</Link> <ChevronRight size={11} style={{ verticalAlign: -1 }} /> {t.id}</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Transaction analysis · {t.id}</div>
            <div className="small muted">{t.customer} → {t.recipient} · {inr(t.amount)} · {dateTime(t.created_at)}</div>
          </div>
          <Status s={t.status} />
          <span className={`badge ${level === 'high' ? 'b-bad' : level === 'medium' ? 'b-warn' : 'b-good'}`} style={{ height: 34, padding: '0 14px', fontSize: 13, boxShadow: level === 'high' ? '0 8px 20px -8px rgba(240,68,56,.6)' : undefined }}>{level.toUpperCase()} RISK ({t.risk_score}/100)</span>
        </div>
      </Card>
      <div>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'signals', label: 'Detection Signals' }, { id: 'location', label: 'Location Analysis' }, { id: 'history', label: 'Customer History' }, { id: 'timeline', label: 'Timeline' }]} />
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
          {tab === 'overview' && <OverviewTab d={data} />}
          {tab === 'signals' && <SignalsTab t={t} />}
          {tab === 'location' && <LocationTab d={data} />}
          {tab === 'history' && <HistoryTab d={data} />}
          {tab === 'timeline' && <TimelineTab d={data} />}
        </motion.div>
      </div>
    </motion.div>
  );
}

export function RiskBreakdown({ signals, score }) {
  const total = signals.reduce((a, s) => a + s.contribution, 0) || 1;
  return (
    <div>
      {[...signals].sort((a, b) => b.contribution - a.contribution).map((s, i) => {
        const I = SIG_ICON[s.key] || Activity;
        const pct = Math.round((s.contribution / total) * 100);
        return (
          <div key={s.key} className="rbar" title={s.evidence}>
            <span className="rb-ico"><I /></span>
            <span className="small" style={{ fontWeight: 600 }}>{s.label}</span>
            <span className="track"><motion.span className="fill" style={{ display: 'block', background: barColor(s) }} initial={{ width: 0 }} animate={{ width: `${s.score * 100}%` }} transition={{ duration: 1, ease, delay: 0.1 + i * 0.08 }} /></span>
            <span className="small bold tabular" style={{ textAlign: 'right' }}>{score ? `${pct}%` : '0%'}</span>
          </div>);
      })}
      <div className="xs muted" style={{ marginTop: 6 }}>Bars show each signal's strength (0–1). Percentages show its share of the final score.</div>
    </div>
  );
}

function Pipeline({ t, d }) {
  const steps = [
    ['Ingested', Wallet, dateTime(t.created_at)], ['Behaviour', Fingerprint, `${t.analysis?.historyCount ?? 0} prior payments`], ['Recipient', UserPlus, t.analysis?.priorToRecipient ? `${t.analysis.priorToRecipient} prior` : 'New'],
    ['Amount', Coins, `${(t.amount / (t.analysis?.typicalAmount || t.amount)).toFixed(1)}× typical`], ['Location', MapPin, km(t.analysis?.location?.distanceKm)], ['Decision', ShieldCheck, t.recommended_action?.split(' ').slice(0, 3).join(' ')],
  ];
  return (
    <div className="pipeline">
      {steps.map(([l, I, v], i) => (
        <motion.div key={l} className="pipe-step done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.12, duration: 0.45, ease }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><I size={16} color="var(--brand)" /><span style={{ width: 18, height: 18, borderRadius: 6, background: 'var(--good-soft)', display: 'grid', placeItems: 'center' }}><Check size={12} color="var(--good-ink)" /></span></div>
          <div className="bold small" style={{ marginTop: 8 }}>{l}</div><div className="xs muted ellipsis">{v}</div>
        </motion.div>))}
    </div>
  );
}

function OverviewTab({ d }) {
  const t = d.transaction;
  return (
    <div className="stack">
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr) minmax(220px,.7fr)' }} data-resp="ov-row">
        <Card>
          <CardHead title="Transaction details" />
          <dl className="kv">
            <dt><Wallet />Amount</dt><dd>{inr(t.amount)}</dd>
            <dt><User />Customer</dt><dd><Link to={`/customers/${t.customer_id}`}>{t.customer}</Link></dd>
            <dt><Store />Recipient</dt><dd>{t.recipient}</dd>
            <dt><Hash />Recipient VPA</dt><dd className="small">{d.recipient.vpa}</dd>
            <dt><Calendar />Date & time</dt><dd>{dateTime(t.created_at)}</dd>
            <dt><MapPin />Location</dt><dd>{t.city || '—'} <Source s={t.location_source} /></dd>
            <dt><Activity />Status</dt><dd><Status s={t.status} /></dd>
          </dl>
        </Card>
        <Card><CardHead title="Risk breakdown" sub="Signal contribution" /><RiskBreakdown signals={t.signals} score={t.risk_score} /></Card>
        <Card style={{ display: 'grid', placeItems: 'center' }}><RiskRing score={t.risk_score} size={170} level={t.risk_level} /><div className="small muted" style={{ textAlign: 'center' }}>Thresholds: medium ≥ 40 · high ≥ 70</div></Card>
      </div>
      <Card><CardHead title="Analysis pipeline" sub="How Guardian processed this payment" /><Pipeline t={t} d={d} /></Card>
      <div className="grid g-2">
        <Card>
          <CardHead icon={Sparkles} title="Guardian explanation" sub="Generated from detection signals" />
          <p style={{ margin: 0, lineHeight: 1.65 }}>{t.explanation}</p>
          <div className="xs muted" style={{ marginTop: 10 }}>Signals are scored by Guardian's rules engine and a statistical anomaly model (multivariate z-distance) over this customer's stored history.</div>
        </Card>
        <Card>
          <CardHead icon={ShieldCheck} title="Recommended action" />
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t.recommended_action}</div>
          {d.approval && <div className="small" style={{ marginTop: 10 }}>Family approval: <b>{d.approval.family_name}</b> ({d.approval.relation}) · <Status s={d.approval.status} /></div>}
          {d.recovery && <div className="small" style={{ marginTop: 6 }}>Recovery: <Status s={d.recovery.status} /></div>}
        </Card>
      </div>
    </div>
  );
}

function SignalsTab({ t }) {
  let run = 0;
  const water = [...t.signals].sort((a, b) => b.contribution - a.contribution).map((s) => { const r = { label: s.label, base: run, value: +s.contribution.toFixed(1) }; run += s.contribution; return r; });
  return (
    <div className="stack">
      <div className="grid g-3">
        {t.signals.map((s, i) => { const I = SIG_ICON[s.key]; return (
          <Card key={s.key} tilt>
            <div className="row"><span className={`k-ico ${s.score >= 0.66 ? 'tone-bad' : s.score >= 0.33 ? 'tone-warn' : 'tone-good'}`} style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}><I size={18} /></span>
              <div style={{ flex: 1 }}><div className="bold">{s.label}</div><div className="xs muted">weight {s.weight} · strength {s.score.toFixed(2)}</div></div>
              <div style={{ fontSize: 22, fontWeight: 800 }} className="tabular">+{s.contribution.toFixed(1)}</div></div>
            <div className="track" style={{ height: 6, borderRadius: 3, background: '#f0eef7', marginTop: 14, overflow: 'hidden' }}><motion.div style={{ height: '100%', background: barColor(s) }} initial={{ width: 0 }} animate={{ width: `${s.score * 100}%` }} transition={{ duration: 0.9, delay: i * 0.06, ease }} /></div>
            <div className="small" style={{ marginTop: 12, color: 'var(--ink-2)' }}>{s.evidence}</div>
          </Card>); })}
      </div>
      <Card>
        <CardHead title="Score composition" sub={`Signals accumulate to ${t.risk_score}/100`} />
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={water} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} stroke="none" interval={0} />
            <YAxis domain={[0, 100]} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} stroke="none" />
            <Tooltip cursor={{ fill: 'rgba(109,76,246,.06)' }} content={({ active, payload }) => active && payload?.length ? <div className="chart-tip"><div className="tt">{payload[0].payload.label}</div>+{payload[0].payload.value} → {(payload[0].payload.base + payload[0].payload.value).toFixed(1)}</div> : null} />
            <ReferenceLine y={70} stroke={C.bad} strokeDasharray="4 4" label={{ value: 'High ≥ 70', fill: C.bad, fontSize: 11, position: 'insideTopRight' }} />
            <ReferenceLine y={40} stroke={C.warn} strokeDasharray="4 4" label={{ value: 'Medium ≥ 40', fill: '#b54708', fontSize: 11, position: 'insideTopRight' }} />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="value" stackId="w" fill={C.c1} radius={[4, 4, 4, 4]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function LocationTab({ d }) {
  const t = d.transaction, loc = t.analysis?.location;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(280px,.8fr)' }} data-resp="ov-row">
      <div className="map-shell"><Suspense fallback={<div className="skel" style={{ height: 460 }} />}>
        {t.lat != null ? <GeoMap height={460} focus={t} familiar={d.familiar} previous={loc?.prev} /> : <Empty title="No location supplied" />}
      </Suspense></div>
      <Card>
        <CardHead title="Location analysis" />
        <dl className="kv">
          <dt>Current location</dt><dd>{t.city}, {t.region}</dd>
          <dt>Coordinates</dt><dd className="small">{t.lat?.toFixed(4)}° N, {t.lng?.toFixed(4)}° E</dd>
          <dt>Accuracy</dt><dd>± {t.accuracy_m ?? '—'} m</dd>
          <dt>Source</dt><dd><Source s={t.location_source} /></dd>
          <dt>Nearest familiar</dt><dd>{loc?.familiar?.city || '—'}</dd>
          <dt>Distance</dt><dd style={{ color: loc?.distanceKm > 300 ? 'var(--bad-ink)' : undefined }}>{km(loc?.distanceKm)}</dd>
          <dt>Previous txn</dt><dd>{loc?.prev ? `${loc.prev.city} · ${km(loc.prevDistanceKm)}` : '—'}</dd>
          <dt>Implied travel</dt><dd>{loc?.prev ? (loc.impossibleTravel ? <span className="badge b-bad">Impossible</span> : `${Math.round(loc.speedKmh)} km/h`) : '—'}</dd>
        </dl>
        <div className="sep" />
        <div className="small">{t.signals.find((s) => s.key === 'location')?.evidence}</div>
      </Card>
    </div>
  );
}

function HistoryTab({ d }) {
  const t = d.transaction;
  const series = [...d.history].reverse().map((h) => ({ id: h.id, amount: h.amount, level: h.risk_level, current: false })).concat([{ id: t.id, amount: t.amount, level: t.risk_level, current: true }]);
  return (
    <div className="stack">
      <div className="grid g-4">
        <Card><div className="xs muted bold">TYPICAL AMOUNT</div><div style={{ fontSize: 22, fontWeight: 800 }}>{inr(t.analysis?.typicalAmount)}</div></Card>
        <Card><div className="xs muted bold">AMOUNT DEVIATION</div><div style={{ fontSize: 22, fontWeight: 800 }}>{(t.amount / (t.analysis?.typicalAmount || t.amount)).toFixed(1)}× <span className="small muted">z {t.analysis?.amountZ}</span></div></Card>
        <Card><div className="xs muted bold">PRIOR PAYMENTS</div><div style={{ fontSize: 22, fontWeight: 800 }}>{d.baseline.n}</div><div className="xs muted">{d.baseline.recipients} distinct recipients</div></Card>
        <Card><div className="xs muted bold">VELOCITY</div><div style={{ fontSize: 22, fontWeight: 800 }}>{t.analysis?.n15} <span className="small muted">in 15 min</span></div><div className="xs muted">{t.analysis?.n60} in the prior hour</div></Card>
      </div>
      <Card>
        <CardHead title="Amount vs. previous transactions" sub="Most recent 12 + this payment" />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="id" tick={{ fill: C.axis, fontSize: 10 }} tickLine={false} stroke="none" tickFormatter={(v) => v.slice(-3)} />
            <YAxis tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} stroke="none" tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
            <Tooltip cursor={{ fill: 'rgba(109,76,246,.06)' }} content={({ active, payload }) => active && payload?.length ? <div className="chart-tip"><div className="tt">{payload[0].payload.id}{payload[0].payload.current ? ' (this payment)' : ''}</div>{inr(payload[0].value)}</div> : null} />
            <ReferenceLine y={t.analysis?.typicalAmount} stroke={C.c2} strokeDasharray="4 4" label={{ value: 'Typical', fill: C.c2, fontSize: 11, position: 'insideTopLeft' }} />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={30}>{series.map((s) => <Cell key={s.id} fill={s.current ? C.bad : '#c9bdfb'} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card className="flush">
        <div style={{ padding: '18px 18px 0' }}><CardHead title="Previous transaction history" /></div>
        <div className="table-wrap"><table className="t"><thead><tr><th>ID</th><th>Recipient</th><th style={{ textAlign: 'right' }}>Amount</th><th>Location</th><th>Score</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>{d.history.map((h) => <tr key={h.id}><td><Link to={`/intelligence/${h.id}`}><b>{h.id}</b></Link></td><td>{h.recipient}</td><td className="tabular bold" style={{ textAlign: 'right' }}>{inr(h.amount)}</td><td>{h.city}</td><td><Score v={h.risk_score} level={h.risk_level} /></td><td><Status s={h.status} /></td><td className="small">{dayLabel(h.created_at)}, {time(h.created_at)}</td></tr>)}</tbody></table></div>
      </Card>
      <Card>
        <CardHead title="Recipient intelligence" sub={d.recipient.name} />
        <div className="grid g-4">
          <div><div className="xs muted bold">PAYMENTS RECEIVED</div><div className="bold" style={{ fontSize: 18 }}>{d.recipientStats.payments}</div></div>
          <div><div className="xs muted bold">DISTINCT PAYERS</div><div className="bold" style={{ fontSize: 18 }}>{d.recipientStats.customers}</div></div>
          <div><div className="xs muted bold">HIGH-RISK PAYMENTS</div><div className="bold" style={{ fontSize: 18, color: d.recipientStats.high_risk ? 'var(--bad-ink)' : undefined }}>{d.recipientStats.high_risk}</div></div>
          <div><div className="xs muted bold">FIRST SEEN</div><div className="bold" style={{ fontSize: 18 }}>{dayLabel(d.recipient.first_seen)}</div></div>
        </div>
      </Card>
    </div>
  );
}

function TimelineTab({ d }) {
  return (
    <div className="grid g-2">
      <Card>
        <CardHead icon={GitCommitVertical} title="Transaction sequence" sub="Same customer, 3 h before → 1 h after" />
        <div className="tl">
          {d.sequence.map((s) => (
            <div key={s.id} className="tl-item">
              <div className="tl-node" style={{ background: s.risk_level === 'high' ? 'var(--bad)' : s.risk_level === 'medium' ? 'var(--warn)' : 'var(--good)' }}><span style={{ width: 6, height: 6, borderRadius: 3, background: '#fff' }} /></div>
              <div className={`queue-item ${s.id === d.transaction.id ? 'on' : ''}`} style={{ cursor: 'default' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><b>{s.id}</b><span className="small muted">{time(s.created_at)}</span></div>
                <div className="small">{s.recipient} · {inr(s.amount)} · {s.city}</div>
                <div className="row" style={{ marginTop: 6 }}><Score v={s.risk_score} level={s.risk_level} /><Status s={s.status} /></div>
              </div>
            </div>))}
        </div>
      </Card>
      <Card>
        <CardHead title="Audit history" sub="Every state change for this transaction" />
        {d.audit.map((a) => (
          <div key={a.id} className="lrow">
            <div className="l-ico tone-brand"><Activity /></div>
            <div className="l-main"><div className="l-t" style={{ whiteSpace: 'normal' }}>{a.action}</div><div className="l-s">{a.actor} · {a.category}{a.prev_state ? ` · ${a.prev_state} → ${a.next_state}` : ''}</div></div>
            <span className="xs muted">{time(a.at)}</span>
          </div>))}
      </Card>
    </div>
  );
}
