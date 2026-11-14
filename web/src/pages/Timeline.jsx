import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Coins, MapPin, Fingerprint, Gauge, Repeat, AlertTriangle, GitCommitVertical, ScanSearch, Activity } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { qs } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { inr, time, date, dateTime } from '../lib/format.js';
import { Card, CardHead, Score, Status, ErrorBox, Loading, Empty, Switch, stagger, rise, ease } from '../components/ui.jsx';

const TAGS = { new_recipient: ['New recipient', UserPlus, '#7a5af8'], unusual_amount: ['Unusual amount', Coins, '#dc6803'], location_change: ['Location change', MapPin, '#2e90fa'], behaviour: ['Behavioural deviation', Fingerprint, '#0e9384'], velocity: ['High velocity', Gauge, '#b54708'], repeat: ['Repeated payment', Repeat, '#4a4566'], alert: ['Fraud alert', AlertTriangle, '#f04438'] };

export default function Timeline() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const set = (p) => { const n = new URLSearchParams(sp); Object.entries(p).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  const customer = sp.get('customer') || '', days = sp.get('days') || '7', all = sp.get('all') === '1', tx = sp.get('tx') || '';
  const [tagFilter, setTagFilter] = useState(null);
  const [sel, setSel] = useState(null);
  const customers = useApi(user.role === 'family' ? null : '/customers', { skip: user.role === 'family', live: [] });
  const { data, error, loading } = useApi(`/timeline${qs({ customer, days, all: all ? 1 : '', tx })}`, { live: ['transaction'] });
  const events = useMemo(() => (data?.events || []).filter((e) => !tagFilter || e.tags.some((t) => t.k === tagFilter)), [data, tagFilter]);
  const groups = useMemo(() => { const g = []; events.forEach((e) => { const d = date(e.at); if (!g.length || g[g.length - 1].d !== d) g.push({ d, items: [] }); g[g.length - 1].items.push(e); }); return g; }, [events]);
  const active = events.find((e) => e.id === sel) || events[0];
  const tagCounts = useMemo(() => { const c = {}; (data?.events || []).forEach((e) => e.tags.forEach((t) => (c[t.k] = (c[t.k] || 0) + 1))); return c; }, [data]);
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <Card variants={rise} style={{ padding: 14 }}>
        <div className="toolbar">
          {user.role !== 'family' && <select className="select" value={customer} onChange={(e) => set({ customer: e.target.value, tx: '' })} aria-label="Customer"><option value="">All customers</option>{customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <select className="select" value={days} onChange={(e) => set({ days: e.target.value, tx: '' })} aria-label="Period"><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
          {tx && <span className="chip on" onClick={() => set({ tx: '' })}>Around {tx} ✕</span>}
          <label className="row small" style={{ gap: 8 }}><Switch on={all} onChange={(v) => set({ all: v ? '1' : '' })} label="Show all transactions" />Include normal transactions</label>
          <div className="row wrap" style={{ gap: 6, marginLeft: 'auto' }}>
            {Object.entries(TAGS).map(([k, [l, I, c]]) => <button key={k} className={`chip ${tagFilter === k ? 'on' : ''}`} onClick={() => setTagFilter(tagFilter === k ? null : k)}><I size={12} color={c} />{l} {tagCounts[k] ? <b>{tagCounts[k]}</b> : null}</button>)}
          </div>
        </div>
      </Card>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 1fr)', alignItems: 'start' }} data-resp="ov-row">
        <Card variants={rise}>
          <CardHead icon={GitCommitVertical} title="Event chronology" sub={data ? `${events.length} events` : ''} />
          <ErrorBox error={error} />
          {loading && !data ? <Loading rows={6} height={56} /> : events.length === 0 ? <Empty icon={GitCommitVertical} title="No suspicious sequences">Nothing matches in this period. Turn on “Include normal transactions” to see every event.</Empty> : (
            <div className="tl">
              {groups.map((g) => (
                <div key={g.d}>
                  <div className="xs bold muted" style={{ margin: '4px 0 10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>{g.d}</div>
                  {g.items.map((e, i) => {
                    const main = e.tags.find((t) => t.k === 'alert') || e.tags[0];
                    const [, I, c] = main ? TAGS[main.k] : ['', Activity, '#12b76a'];
                    return (
                      <motion.div key={e.id} className="tl-item" initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4, ease, delay: Math.min(i, 6) * 0.03 }}>
                        <div className="tl-node" style={{ background: c, color: '#fff' }}><I /></div>
                        <button className={`queue-item ${active?.id === e.id ? 'on' : ''}`} onClick={() => setSel(e.id)}>
                          <div className="row" style={{ justifyContent: 'space-between' }}><span className="row" style={{ gap: 8 }}><b>{time(e.at)}</b><span className="small muted">{e.id}</span></span><Score v={e.risk_score} level={e.risk_level} /></div>
                          <div className="small" style={{ marginTop: 4 }}>{e.customer} → <b>{e.recipient}</b> · {inr(e.amount)} · {e.city}</div>
                          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>{e.tags.map((t) => { const [l, TI, tc] = TAGS[t.k]; return <span key={t.k} className="chip" style={{ cursor: 'inherit', background: `${tc}14`, color: tc }}><TI size={11} />{l}</span>; })}</div>
                        </button>
                      </motion.div>);
                  })}
                </div>))}
            </div>)}
        </Card>
        <div style={{ position: 'sticky', top: 96 }}>
          <AnimatePresence mode="wait">
            {active && (
              <motion.div key={active.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease }}>
                <Card>
                  <CardHead title="Event evidence" right={<Status s={active.status} />} />
                  <div className="row" style={{ gap: 12 }}><Score v={active.risk_score} level={active.risk_level} /><div><div className="bold">{active.id}</div><div className="small muted">{dateTime(active.at)}</div></div><div style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 18 }}>{inr(active.amount)}</div></div>
                  <div className="small" style={{ marginTop: 12 }}>{active.customer} → <b>{active.recipient}</b> · {active.city}</div>
                  <div className="sep" />
                  <div className="stack" style={{ gap: 10 }}>
                    {active.tags.map((t) => { const [l, I, c] = TAGS[t.k]; return <div key={t.k} className="row" style={{ alignItems: 'flex-start', gap: 10 }}><span className="l-ico" style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: `${c}18`, color: c, flex: 'none' }}><I size={14} /></span><div><div className="small bold">{l}</div><div className="small muted">{t.evidence}</div></div></div>; })}
                    {active.tags.length === 0 && <div className="small muted">No suspicious indicators on this transaction.</div>}
                  </div>
                  <div className="sep" />
                  <div className="small bold" style={{ marginBottom: 6 }}>Signal contributions</div>
                  {active.signals.map((s) => <div key={s.key} className="row small" style={{ justifyContent: 'space-between', padding: '4px 0' }}><span>{s.label}</span><b className="tabular">+{s.contribution.toFixed(1)}</b></div>)}
                  <div className="sep" />
                  <div className="small bold" style={{ marginBottom: 6 }}>Audit events</div>
                  {active.audit.map((a, i) => <div key={i} className="row xs" style={{ gap: 10, padding: '4px 0' }}><span className="muted tabular" style={{ width: 64 }}>{time(a.at)}</span><span style={{ flex: 1 }}>{a.action}</span></div>)}
                  {user.role !== 'family' && <button className="btn sm primary" style={{ marginTop: 14 }} onClick={() => nav(`/intelligence/${active.id}`)}><ScanSearch />Open intelligence</button>}
                </Card>
              </motion.div>)}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
