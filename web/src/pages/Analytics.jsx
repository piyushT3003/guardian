import { useState } from 'react';
import { motion } from 'framer-motion';
import { ScanLine, ShieldAlert, UserPlus, Route, Gauge } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useApi } from '../lib/hooks.js';
import { dayLabel, int, compact } from '../lib/format.js';
import { Card, CardHead, Kpi, Seg, ErrorBox, PageLoading, stagger, DataTag, TopbarActions } from '../components/ui.jsx';
import { Bars, Donut, LegendList, Tip, C } from '../components/charts.jsx';

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '0.0');
const Explain = ({ children }) => <div className="small muted" style={{ marginTop: 10, lineHeight: 1.55 }}>{children}</div>;

function Outcome({ title, data, order, colors, explain }) {
  const total = order.reduce((a, k) => a + (data[k] || 0), 0);
  return (
    <Card>
      <CardHead title={title} sub={`${total} total`} />
      {total === 0 ? <div className="small muted">No records in this period.</div> : (
        <>
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2, background: '#fff' }}>
            {order.filter((k) => data[k]).map((k, i) => <motion.div key={k} title={`${k}: ${data[k]}`} initial={{ width: 0 }} animate={{ width: `${(data[k] / total) * 100}%` }} transition={{ duration: 0.9, delay: i * 0.1 }} style={{ background: colors[k] }} />)}
          </div>
          <div className="stack" style={{ gap: 6, marginTop: 14 }}>
            {order.map((k) => <div key={k} className="row small" style={{ justifyContent: 'space-between' }}><span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: colors[k], marginRight: 8 }} />{k.replaceAll('_', ' ').toLowerCase()}</span><b className="tabular">{data[k] || 0} <span className="muted" style={{ fontWeight: 500 }}>({pct(data[k] || 0, total)}%)</span></b></div>)}
          </div>
        </>)}
      {explain && <Explain>{explain}</Explain>}
    </Card>
  );
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useApi(`/analytics?days=${days}`, { live: ['transaction'] });
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <TopbarActions><Seg value={days} onChange={setDays} options={[{ value: 7, label: '7d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }]} /></TopbarActions>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <PageLoading /> : data && <Body d={data} />}
    </motion.div>
  );
}

function Body({ d }) {
  const high = d.daily.reduce((a, x) => a + x.high, 0), med = d.daily.reduce((a, x) => a + x.medium, 0), low = d.daily.reduce((a, x) => a + x.low, 0);
  const vol = d.daily.reduce((a, x) => a + x.volume, 0);
  const topSignal = [...d.signals].sort((a, b) => b.fired - a.fired)[0];
  const far = d.geoDistance[2].n + d.geoDistance[3].n;
  return (
    <>
      <div className="kpis">
        <Kpi icon={ScanLine} value={d.total} label={`Transactions analysed · ${compact(vol)}`} />
        <Kpi icon={ShieldAlert} tone="bad" value={+pct(high, d.total)} format={(v) => `${v.toFixed(1)}%`} label={`High-risk rate · ${high} payments`} />
        <Kpi icon={UserPlus} tone="warn" value={+pct(d.novelty.novel, d.total)} format={(v) => `${v.toFixed(1)}%`} label="Payments to new recipients" />
        <Kpi icon={Route} tone="info" value={d.impossibleTravel} label="Impossible-travel detections" />
      </div>
      <Card>
        <CardHead title="Transaction volume by risk level" sub={`Daily · last ${d.days} days`} right={<DataTag />} />
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={d.daily} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="t" tickFormatter={dayLabel} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} stroke="none" minTickGap={18} />
            <YAxis tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} stroke="none" allowDecimals={false} />
            <Tooltip content={<Tip labelFormat={dayLabel} />} cursor={{ fill: 'rgba(109,76,246,.06)' }} />
            <Bar dataKey="low" name="Low risk" stackId="r" fill={C.good} stroke="#fff" strokeWidth={1} />
            <Bar dataKey="medium" name="Medium risk" stackId="r" fill={C.warn} stroke="#fff" strokeWidth={1} />
            <Bar dataKey="high" name="High risk" stackId="r" fill={C.bad} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="legend"><span><i style={{ background: C.good }} />Low</span><span><i style={{ background: C.warn }} />Medium</span><span><i style={{ background: C.bad }} />High</span></div>
        <Explain>{int(d.total)} transactions were analysed: {low} low, {med} medium and {high} high risk. High-risk payments are {pct(high, d.total)}% of volume.</Explain>
      </Card>
      <div className="grid g-2">
        <Card><CardHead title="Risk score distribution" /><Bars data={d.scoreBuckets} x="range" y="n" height={230} colors={d.scoreBuckets.map((_, i) => (i >= 7 ? C.bad : i >= 4 ? C.warn : C.c1))} name="Transactions" />
          <Explain>Most payments score under 20 because they match the customer's own baseline. Scores of 70 and above are held automatically.</Explain></Card>
        <Card><CardHead title="Detection signal frequency" sub="Signals contributing ≥ 3 points" /><Bars data={d.signals} x="label" y="fired" layout="vertical" height={230} color={C.c1} name="Times fired" />
          <Explain>{topSignal ? <><b>{topSignal.label}</b> fired most often ({topSignal.fired}×). </> : null}Average contribution per transaction: {d.signals.map((s) => `${s.label.split(' ')[0]} ${s.avgContribution}`).join(' · ')}.</Explain></Card>
      </div>
      <div className="grid g-3">
        <Card><CardHead title="Amount anomalies" sub="Amount ÷ customer's typical" /><Bars data={d.amountDeviation} x="label" y="n" height={200} color={C.c3} name="Transactions" />
          <Explain>{d.amountDeviation[3].n + d.amountDeviation[4].n} payments were 5× or more above the customer's typical amount.</Explain></Card>
        <Card><CardHead title="Geographical anomalies" sub="Distance from nearest familiar place" /><Bars data={d.geoDistance} x="label" y="n" height={200} color={C.c2} name="Transactions" />
          <Explain>{far} payments were made more than 300 km from any familiar location, and {d.impossibleTravel} implied impossible travel speed.</Explain></Card>
        <Card><CardHead title="Recipient novelty & velocity" />
          <div className="row" style={{ gap: 16 }}>
            <Donut size={140} stroke={16} segments={[{ label: 'Known recipient', value: d.novelty.known, color: C.c1 }, { label: 'New recipient', value: d.novelty.novel, color: C.c4 }]} centerLabel="Payments" />
            <LegendList total={d.total} items={[{ label: 'Known', value: d.novelty.known, color: C.c1 }, { label: 'New', value: d.novelty.novel, color: C.c4 }]} />
          </div>
          <Explain><Gauge size={13} style={{ verticalAlign: -2 }} /> {d.velocityHits} payments followed another payment by the same customer within 15 minutes.</Explain></Card>
      </div>
      <div className="grid g-3">
        <Outcome title="Family approval outcomes" data={d.approvals} order={['APPROVED', 'HELD', 'EXPIRED', 'PENDING']} colors={{ APPROVED: C.c1, HELD: C.c2, EXPIRED: '#a9a5c0', PENDING: C.c4 }}
          explain={`Family members kept ${pct(d.approvals.HELD || 0, Object.values(d.approvals).reduce((a, b) => a + b, 0))}% of flagged payments on hold.`} />
        <Outcome title="Payment hold outcomes" data={d.holds} order={['BLOCKED', 'COMPLETED', 'RECOVERED', 'RECOVERY_DECLINED', 'ON_HOLD', 'UNDER_REVIEW', 'PENDING_FAMILY_APPROVAL']}
          colors={{ BLOCKED: C.c4, COMPLETED: C.c2, RECOVERED: C.c1, RECOVERY_DECLINED: '#a9a5c0', ON_HOLD: C.c3, UNDER_REVIEW: '#84adff', PENDING_FAMILY_APPROVAL: '#fdb022' }}
          explain="Final state of every payment that entered review or a hold." />
        <Outcome title="Recovery outcomes" data={d.recoveries} order={['RECOVERED', 'DECLINED', 'EXPIRED', 'FAILED', 'OPEN', 'INITIATED']} colors={{ RECOVERED: C.c2, DECLINED: '#a9a5c0', EXPIRED: C.c4, FAILED: '#d92d20', OPEN: C.c3, INITIATED: C.c1 }}
          explain="Recovery windows are opened automatically when a high-scoring payment settles after approval." />
      </div>
      <Card><CardHead title="Locations with the most high-risk activity" />
        <div className="table-wrap"><table className="t"><thead><tr><th>City</th><th style={{ textAlign: 'right' }}>Transactions</th><th style={{ textAlign: 'right' }}>High risk</th><th style={{ width: '40%' }}>Share high risk</th></tr></thead>
          <tbody>{d.byCity.map((c) => <tr key={c.city}><td className="bold">{c.city}</td><td className="tabular" style={{ textAlign: 'right' }}>{c.n}</td><td className="tabular" style={{ textAlign: 'right' }}>{c.high}</td><td><div className="track" style={{ height: 8, background: '#f0eef7', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${(c.high / c.n) * 100}%`, height: '100%', background: C.bad, borderRadius: 4 }} /></div></td></tr>)}</tbody></table></div>
      </Card>
    </>
  );
}
