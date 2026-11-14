import { lazy, Suspense, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, MapPin, Phone, Mail, ShieldCheck, Users, UserPlus, Wallet, ShieldAlert, AlertTriangle, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { useApi } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/auth.jsx';
import { inr, compact, int, dateTime, dayLabel, time, initials, ago } from '../lib/format.js';
import { Card, CardHead, Kpi, Score, Status, Tabs, ErrorBox, PageLoading, Empty, Switch, Modal, Button, stagger, rise, ease } from '../components/ui.jsx';
import { Bars, C } from '../components/charts.jsx';
const GeoMap = lazy(() => import('../components/GeoMap.jsx'));

export default function Customers() {
  const { id } = useParams();
  const { user } = useAuth();
  if (user.role === 'family' && !id) return <Profile id={user.customer_id} />;
  return id ? <Profile id={Number(id)} /> : <List />;
}

function List() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data, error, loading } = useApi('/customers', { live: ['transaction'] });
  const items = (data || []).filter((c) => `${c.name} ${c.home_city} ${c.segment}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <Card variants={rise} style={{ padding: 14 }}><div className="search-input"><Search /><input className="input" placeholder="Search customers by name, city or segment…" value={q} onChange={(e) => setQ(e.target.value)} /></div></Card>
      <ErrorBox error={error} />
      {loading && !data ? <PageLoading /> : (
        <motion.div variants={stagger} className="grid g-3">
          {items.map((c) => (
            <Card key={c.id} tilt onClick={() => nav(`/customers/${c.id}`)} style={{ cursor: 'pointer' }}>
              <div className="row"><span className="avatar" style={{ width: 46, height: 46, borderRadius: 15 }}>{initials(c.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div className="bold" style={{ fontSize: 15.5 }}>{c.name}</div><div className="small muted">{c.segment} · {c.home_city}</div></div>
                {c.family_protection ? <span className="badge b-good"><ShieldCheck size={12} />Protected</span> : <span className="badge b-muted">No family</span>}</div>
              <div className="grid g-3" style={{ marginTop: 16 }}>
                <div><div className="xs muted bold">PAYMENTS</div><b>{int(c.tx_count)}</b></div>
                <div><div className="xs muted bold">VOLUME</div><b>{compact(c.volume)}</b></div>
                <div><div className="xs muted bold">HIGH RISK</div><b style={{ color: c.high_risk ? 'var(--bad-ink)' : undefined }}>{c.high_risk}</b></div>
              </div>
              <div className="xs muted" style={{ marginTop: 12 }}>Last payment {ago(c.last_tx)} · {c.family_count} trusted family member{c.family_count === 1 ? '' : 's'}</div>
            </Card>))}
          {items.length === 0 && <Card><Empty title="No customers match" /></Card>}
        </motion.div>)}
    </motion.div>
  );
}

function Profile({ id }) {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState('baseline');
  const [addOpen, setAddOpen] = useState(false);
  const { data, error, loading, reload, setData } = useApi(`/customers/${id}`, { live: ['transaction'] });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <PageLoading />;
  const c = data.customer;
  const toggle = async (v) => {
    try { const u = await api(`/customers/${id}`, { method: 'PATCH', body: { family_protection: v } }); setData((d) => ({ ...d, customer: u })); toast({ title: `Family protection ${v ? 'enabled' : 'disabled'}`, tone: 'good' }); }
    catch (e) { toast({ title: 'Update failed', body: e.message, tone: 'bad' }); }
  };
  const hours = data.baseline.hours.map((n, h) => ({ h: `${h}`, n }));
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <Card variants={rise}>
        <div className="row wrap" style={{ gap: 18 }}>
          <span className="avatar" style={{ width: 64, height: 64, borderRadius: 20, fontSize: 20 }}>{initials(c.name)}</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            {user.role !== 'family' && <div className="xs muted bold"><Link to="/customers">Customer Profiles</Link> / {c.name}</div>}
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{c.name}</div>
            <div className="row wrap small muted" style={{ gap: 14, marginTop: 4 }}><span><MapPin size={13} style={{ verticalAlign: -2 }} /> {c.home_city}</span><span><Phone size={13} style={{ verticalAlign: -2 }} /> {c.phone}</span><span><Mail size={13} style={{ verticalAlign: -2 }} /> {c.email}</span><span className="badge b-brand">{c.segment}</span></div>
          </div>
          <div className="row" style={{ gap: 10, padding: '10px 14px', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <ShieldCheck size={18} color={c.family_protection ? 'var(--good)' : 'var(--ink-4)'} />
            <div><div className="small bold">Family protection</div><div className="xs muted">{c.family_protection ? 'High-risk payments need family approval' : 'High-risk payments held for analysts'}</div></div>
            <Switch on={!!c.family_protection} onChange={toggle} disabled={user.role !== 'admin'} label="Family protection" />
          </div>
        </div>
      </Card>
      <div className="kpis">
        <Kpi icon={BarChart3} value={data.totals.count} label="Transactions" />
        <Kpi icon={Wallet} tone="info" value={data.totals.volume} format={(v) => compact(v)} label="Total volume" />
        <Kpi icon={ShieldAlert} tone="bad" value={data.totals.high} label="High-risk transactions" />
        <Kpi icon={AlertTriangle} tone="warn" value={data.totals.medium} label="Medium-risk transactions" />
      </div>
      <div>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'baseline', label: 'Behavioural baseline' }, { id: 'tx', label: 'Transaction history', count: data.totals.count }, { id: 'risk', label: 'Risk history' }, { id: 'family', label: 'Trusted family', count: data.family.length }, { id: 'holds', label: 'Holds & recovery' }]} />
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
          {tab === 'baseline' && (
            <div className="stack">
              <div className="grid g-4">
                <Card><div className="xs muted bold">MEDIAN PAYMENT</div><div style={{ fontSize: 22, fontWeight: 800 }}>{inr(data.baseline.median)}</div></Card>
                <Card><div className="xs muted bold">90TH PERCENTILE</div><div style={{ fontSize: 22, fontWeight: 800 }}>{inr(data.baseline.p90)}</div></Card>
                <Card><div className="xs muted bold">PAYMENTS / DAY</div><div style={{ fontSize: 22, fontWeight: 800 }}>{data.baseline.avgPerDay}</div></Card>
                <Card><div className="xs muted bold">TRUSTED SAMPLE</div><div style={{ fontSize: 22, fontWeight: 800 }}>{data.baseline.count}</div><div className="xs muted">non-high-risk payments</div></Card>
              </div>
              <div className="grid g-2">
                <Card><CardHead title="Active hours" sub="Trusted payments by hour (IST)" /><Bars data={hours} x="h" y="n" height={200} name="Payments" /></Card>
                <Card><CardHead title="Familiar recipients" />
                  {data.recipients.map((r) => <div key={r.name} className="row small" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f1fa' }}><span><b>{r.name}</b> <span className="muted">· {r.n} payments</span></span><span className="muted">{inr(r.total)}</span></div>)}
                </Card>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }} data-resp="ov-row">
                <div className="map-shell"><Suspense fallback={<div className="skel" style={{ height: 380 }} />}><GeoMap height={380} points={data.locations.map((l, i) => ({ id: `${l.city}-${i}`, lat: l.lat, lng: l.lng, city: l.city, customer: c.name, recipient: `${l.n} payments`, amount: 0, risk_score: l.high, risk_level: l.high ? 'high' : 'low', location_source: 'historical' }))} familiar={data.familiar} fitKey={id} /></Suspense></div>
                <Card><CardHead title="Historical transaction locations" />
                  {data.locations.map((l) => <div key={l.city} className="row small" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f1fa' }}><span><b>{l.city}</b>{data.familiar.some((f) => f.city === l.city) && <span className="badge b-good" style={{ height: 20, marginLeft: 6 }}>Familiar</span>}</span><span className="muted">{l.n} payments{l.high ? <b style={{ color: 'var(--bad-ink)' }}> · {l.high} high risk</b> : ''}</span></div>)}
                </Card>
              </div>
            </div>)}
          {tab === 'tx' && (
            <Card className="flush"><div className="table-wrap"><table className="t"><thead><tr><th>ID</th><th>Recipient</th><th style={{ textAlign: 'right' }}>Amount</th><th>Location</th><th>Score</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>{data.transactions.map((t) => <tr key={t.id} className="clickable" onClick={() => nav(user.role === 'family' ? `/timeline?tx=${t.id}` : `/intelligence/${t.id}`)}><td><span className={`rail ${t.risk_level}`} /><b>{t.id}</b></td><td>{t.recipient}</td><td className="tabular bold" style={{ textAlign: 'right' }}>{inr(t.amount)}</td><td>{t.city}</td><td><Score v={t.risk_score} level={t.risk_level} /></td><td><Status s={t.status} /></td><td className="small">{dayLabel(t.created_at)}, {time(t.created_at)}</td></tr>)}</tbody></table></div>
              <div className="xs muted" style={{ padding: 14 }}>Showing the 50 most recent of {data.totals.count} transactions.</div></Card>)}
          {tab === 'risk' && (
            <div className="grid g-2">
              <Card><CardHead title="Risk score history" sub="Last 60 payments" />
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.riskHistory} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="t" tickFormatter={dayLabel} tick={{ fill: C.axis, fontSize: 11 }} stroke="none" tickLine={false} minTickGap={30} /><YAxis domain={[0, 100]} tick={{ fill: C.axis, fontSize: 11 }} stroke="none" tickLine={false} />
                    <ReferenceLine y={70} stroke={C.bad} strokeDasharray="4 4" /><ReferenceLine y={40} stroke={C.warn} strokeDasharray="4 4" />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="chart-tip"><div className="tt">{payload[0].payload.id}</div>Score {payload[0].value} · {dateTime(payload[0].payload.t)}</div> : null} />
                    <Line type="monotone" dataKey="score" stroke={C.c1} strokeWidth={2} dot={{ r: 3, fill: C.c1, stroke: '#fff', strokeWidth: 1 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer></Card>
              <Card><CardHead title="Suspicious transactions" />
                {data.suspicious.length === 0 ? <Empty title="No suspicious transactions" /> : data.suspicious.map((t) => <div key={t.id} className="lrow clickable" onClick={() => user.role !== 'family' && nav(`/intelligence/${t.id}`)}><Score v={t.risk_score} level={t.risk_level} /><div className="l-main"><div className="l-t">{t.recipient}</div><div className="l-s">{t.id} · {t.city} · {dayLabel(t.created_at)}</div></div><div style={{ textAlign: 'right' }}><div className="small bold">{inr(t.amount)}</div><Status s={t.status} /></div></div>)}
              </Card>
            </div>)}
          {tab === 'family' && (
            <div className="grid g-2">
              <Card><CardHead icon={Users} title="Trusted family members" right={user.role === 'admin' && <button className="btn sm" onClick={() => setAddOpen(true)}><UserPlus size={14} />Add</button>} />
                {data.family.length === 0 ? <Empty icon={Users} title="No trusted family configured">High-risk payments for this customer are held for analysts instead.</Empty> : data.family.map((f) => (
                  <div key={f.id} className="lrow"><span className="avatar family">{initials(f.name)}</span><div className="l-main"><div className="l-t">{f.name}</div><div className="l-s">{f.relation} · {f.phone} · {f.email}</div></div><span className="badge b-good">Approver</span></div>))}
              </Card>
              <Card><CardHead title="Family approval history" />
                {data.approvals.length === 0 ? <div className="small muted">No approval requests yet.</div> : data.approvals.map((a) => <div key={a.id} className="lrow"><div className="l-main"><div className="l-t">{inr(a.amount)} → {a.recipient}</div><div className="l-s">{a.transaction_id} · {a.family_name} · {dateTime(a.decided_at || a.created_at)}</div></div><Status s={a.status} /></div>)}
              </Card>
            </div>)}
          {tab === 'holds' && (
            <div className="grid g-2">
              <Card><CardHead title="Payment hold history" />{data.holds.length === 0 ? <div className="small muted">No holds.</div> : data.holds.map((h, i) => <div key={i} className="lrow"><div className="l-main"><div className="l-t" style={{ whiteSpace: 'normal' }}>{h.action}</div><div className="l-s">{h.id} · {dateTime(h.at)}</div></div></div>)}</Card>
              <Card><CardHead title="Recovery history" />{data.recoveries.length === 0 ? <div className="small muted">No recovery requests.</div> : data.recoveries.map((r) => <div key={r.id} className="lrow"><div className="l-main"><div className="l-t">{r.transaction_id} · {inr(r.amount)}</div><div className="l-s">Opened {dateTime(r.opened_at)}</div></div><Status s={r.status} /></div>)}</Card>
            </div>)}
        </motion.div>
      </div>
      <AddFamily open={addOpen} onClose={() => setAddOpen(false)} customer={c} onDone={(family) => { setData((d) => ({ ...d, family })); setAddOpen(false); }} />
    </motion.div>
  );
}

function AddFamily({ open, onClose, customer, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', relation: '', phone: '', email: '', password: '' });
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setPending(true); setErr(null);
    try { const fam = await api(`/customers/${customer.id}/family`, { method: 'POST', body: f }); toast({ title: `${f.name} added as trusted family`, tone: 'good' }); setF({ name: '', relation: '', phone: '', email: '', password: '' }); onDone(fam); }
    catch (e2) { setErr(e2); } finally { setPending(false); }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
        <div className="bold" style={{ fontSize: 18 }}>Add trusted family member for {customer.name}</div>
        <div className="small muted">They'll sign in to the Family Approval Centre to approve or hold protected payments.</div>
        <div className="grid g-2"><div className="field"><label>Full name</label><input required className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div><div className="field"><label>Relation</label><input className="input" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} placeholder="e.g. Son" /></div></div>
        <div className="grid g-2"><div className="field"><label>Email (sign-in)</label><input required type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div><div className="field"><label>Phone</label><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div></div>
        <div className="field"><label>Initial password (min 8 characters)</label><input required minLength={8} type="password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <ErrorBox error={err} />
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Cancel</button><Button className="primary" pending={pending}>Add family member</Button></div>
      </form>
    </Modal>
  );
}
