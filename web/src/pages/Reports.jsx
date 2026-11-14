import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Receipt, PieChart, UserRound, LifeBuoy, Search, Download, FileJson, Calendar } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { download, qs } from '../lib/api.js';
import { useToast } from '../lib/auth.jsx';
import { dateTime } from '../lib/format.js';
import { Card, CardHead, ErrorBox, Loading, Empty, Button, stagger, rise } from '../components/ui.jsx';

const TYPES = [
  ['fraud', 'Fraud detection', ShieldAlert, 'Every medium and high-risk transaction with its explanation.'],
  ['transactions', 'Transactions', Receipt, 'Full transaction ledger with risk, status and payment reference.'],
  ['risk', 'Risk distribution', PieChart, 'Daily counts by risk level, average score and volume.'],
  ['customers', 'Customer safety', UserRound, 'Per-customer exposure, blocks and recoveries.'],
  ['recovery', 'Recovery', LifeBuoy, 'Recovery windows, decisions, deadlines and outcomes.'],
  ['investigations', 'Investigations', Search, 'Cases, priorities, decisions and analyst activity.'],
];
const toInput = (ms) => new Date(ms + 5.5 * 3.6e6).toISOString().slice(0, 10);
const fromInput = (s, end) => new Date(`${s}T${end ? '23:59:59' : '00:00:00'}+05:30`).getTime();

export default function Reports() {
  const toast = useToast();
  const [type, setType] = useState('fraud');
  const [from, setFrom] = useState(toInput(Date.now() - 30 * 864e5));
  const [to, setTo] = useState(toInput(Date.now()));
  const [busy, setBusy] = useState(null);
  const range = { from: fromInput(from), to: fromInput(to, true) };
  const { data, error, loading } = useApi(`/reports/${type}${qs(range)}`, { live: [] });
  const preset = (d) => { setFrom(toInput(Date.now() - d * 864e5)); setTo(toInput(Date.now())); };
  const exp = async (format) => {
    setBusy(format);
    try {
      if (format === 'csv') await download(`/reports/${type}${qs({ ...range, format: 'csv' })}`, `guardian-${type}-${from}_${to}.csv`);
      else { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `guardian-${type}-${from}_${to}.json` }); a.click(); }
      toast({ title: 'Report exported', body: `${data?.rows.length ?? ''} rows · ${format.toUpperCase()}`, tone: 'good' });
    } catch (e) { toast({ title: 'Export failed', body: e.message, tone: 'bad' }); } finally { setBusy(null); }
  };
  const cols = data?.rows?.length ? Object.keys(data.rows[0]) : [];
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)', alignItems: 'start' }} data-resp="ov-row">
      <div className="stack">
        <Card variants={rise}>
          <CardHead title="Report type" />
          <div className="stack" style={{ gap: 8 }}>
            {TYPES.map(([id, l, I, desc]) => (
              <button key={id} className={`queue-item ${type === id ? 'on' : ''}`} onClick={() => setType(id)}>
                <div className="row"><span className="k-ico tone-brand" style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center' }}><I size={16} /></span><div><div className="bold">{l}</div><div className="xs muted">{desc}</div></div></div>
              </button>))}
          </div>
        </Card>
        <Card variants={rise}>
          <CardHead icon={Calendar} title="Date range" sub="IST" />
          <div className="stack" style={{ gap: 10 }}>
            <div className="grid g-2" style={{ gap: 10 }}><div className="field"><label htmlFor="rf">From</label><input id="rf" type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div><div className="field"><label htmlFor="rt">To</label><input id="rt" type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div></div>
            <div className="row wrap" style={{ gap: 6 }}>{[[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']].map(([d, l]) => <button key={d} className="chip" onClick={() => preset(d)}>{l}</button>)}</div>
          </div>
        </Card>
      </div>
      <Card variants={rise} className="flush">
        <div style={{ padding: 20, borderBottom: '1px solid var(--line)' }} className="row wrap">
          <div style={{ flex: 1 }}><div className="bold" style={{ fontSize: 17 }}>{data?.title || TYPES.find((t) => t[0] === type)[1]}</div><div className="small muted">{data ? `${data.rows.length} rows · generated ${dateTime(data.generatedAt)}` : 'Generating…'}</div></div>
          <Button pending={busy === 'json'} disabled={!data} onClick={() => exp('json')}><FileJson />JSON</Button>
          <Button className="primary" pending={busy === 'csv'} disabled={!data} onClick={() => exp('csv')}><Download />Export CSV</Button>
        </div>
        {error ? <div style={{ padding: 20 }}><ErrorBox error={error} /></div> : loading && !data ? <div style={{ padding: 20 }}><Loading rows={10} /></div> : cols.length === 0 ? <Empty title="No records in this period" /> : (
          <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            <table className="t"><thead><tr>{cols.map((c) => <th key={c}>{c.replaceAll('_', ' ')}</th>)}</tr></thead>
              <tbody>{data.rows.slice(0, 200).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className={typeof r[c] === 'number' ? 'tabular' : ''} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(r[c] ?? '')}>{r[c] ?? '—'}</td>)}</tr>)}</tbody></table>
            {data.rows.length > 200 && <div className="xs muted" style={{ padding: 14 }}>Preview shows the first 200 rows; exports include all {data.rows.length}.</div>}
          </div>)}
      </Card>
    </motion.div>
  );
}
