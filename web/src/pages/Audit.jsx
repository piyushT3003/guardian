import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, ChevronRight, ArrowRight } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { qs } from '../lib/api.js';
import { dateTime, timeS, date } from '../lib/format.js';
import { Card, Pager, ErrorBox, Loading, Empty, Status, stagger, rise } from '../components/ui.jsx';

const CAT_TONE = { ingestion: 'b-muted', analysis: 'b-info', decision: 'b-warn', approval: 'b-warn', family: 'b-brand', payment: 'b-good', recovery: 'b-bad', admin: 'b-brand', investigation: 'b-info', settings: 'b-muted', auth: 'b-muted', demo: 'b-brand', report: 'b-muted', state: 'b-muted' };
const LABEL = { ingestion: 'Transaction ingestion', analysis: 'Fraud analysis', decision: 'Risk decision', approval: 'Approval request', family: 'Family decision', payment: 'Payment execution', recovery: 'Recovery', admin: 'Administrator decision', investigation: 'Investigation', settings: 'Settings', auth: 'Authentication', demo: 'Demo', report: 'Report' };
const RANGES = { '': 'All time', '1h': 3.6e6, '24h': 864e5, '7d': 7 * 864e5 };

export default function Audit() {
  const [q, setQ] = useState(''), [dq, setDq] = useState('');
  const [cat, setCat] = useState(''), [role, setRole] = useState(''), [range, setRange] = useState(''), [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useApi(`/audit${qs({ q: dq, category: cat, actor_role: role, from: range ? Date.now() - RANGES[range] : '', page, pageSize: 20 })}`, { live: ['audit'] });
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <Card variants={rise} className="flush">
        <div style={{ padding: 18, borderBottom: '1px solid var(--line)' }} className="stack">
          <div className="toolbar">
            <div className="search-input" style={{ flex: '1 1 300px' }}><Search /><input className="input" placeholder="Search action, transaction ID or actor…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className="select" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Actor role"><option value="">All actors</option><option value="system">Guardian engine</option><option value="analyst">Analysts</option><option value="admin">Administrators</option><option value="family">Family members</option></select>
            <select className="select" value={range} onChange={(e) => { setRange(e.target.value); setPage(1); }} aria-label="Period">{Object.keys(RANGES).map((k) => <option key={k} value={k}>{k ? `Last ${k}` : 'All time'}</option>)}</select>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => { setCat(''); setPage(1); }}>All categories</button>
            {data?.categories.filter((c) => LABEL[c.category]).map((c) => <button key={c.category} className={`chip ${cat === c.category ? 'on' : ''}`} onClick={() => { setCat(c.category); setPage(1); }}>{LABEL[c.category]} <b>{c.n}</b></button>)}
          </div>
        </div>
        {error ? <div style={{ padding: 18 }}><ErrorBox error={error} onRetry={reload} /></div> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th style={{ width: 30 }} /><th>Timestamp</th><th>Category</th><th>Action</th><th>Entity</th><th>State change</th><th>Actor</th></tr></thead>
              <tbody>
                {loading && !data ? <tr><td colSpan={7}><Loading rows={10} /></td></tr> : data?.items.length === 0 ? <tr><td colSpan={7}><Empty title="No audit entries match" /></td></tr> :
                  data?.items.map((a) => (
                    <Fragment key={a.id}>
                      <tr className="clickable" onClick={() => setOpen(open === a.id ? null : a.id)}>
                        <td><ChevronRight size={14} style={{ transform: open === a.id ? 'rotate(90deg)' : undefined, transition: 'transform .2s' }} /></td>
                        <td className="small"><div className="bold tabular">{timeS(a.at)}</div><div className="xs muted">{date(a.at)}</div></td>
                        <td><span className={`badge ${CAT_TONE[a.category] || 'b-muted'}`}>{LABEL[a.category] || a.category}</span></td>
                        <td style={{ whiteSpace: 'normal', minWidth: 260 }}>{a.action}</td>
                        <td>{a.entity_type === 'transaction' ? <Link to={`/intelligence/${a.entity_id}`} onClick={(e) => e.stopPropagation()}><b>{a.entity_id}</b></Link> : <span className="small muted">{a.entity_type ? `${a.entity_type} ${a.entity_id}` : '—'}</span>}</td>
                        <td>{a.prev_state || a.next_state ? <span className="row" style={{ gap: 6 }}>{a.prev_state && <Status s={a.prev_state} />}{a.prev_state && <ArrowRight size={12} color="var(--ink-4)" />}{a.next_state && <Status s={a.next_state} />}</span> : <span className="muted">—</span>}</td>
                        <td className="small"><div className="bold">{a.actor}</div><div className="xs muted" style={{ textTransform: 'capitalize' }}>{a.actor_role}</div></td>
                      </tr>
                      {open === a.id && <tr><td /><td colSpan={6} style={{ whiteSpace: 'normal', background: 'var(--surface-2)' }}>
                        <div className="small"><b>Audit #{a.id}</b> · recorded {dateTime(a.at)}</div>
                        <pre style={{ margin: '8px 0 0', fontSize: 12, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 12, overflow: 'auto', maxHeight: 220 }}>{a.details ? JSON.stringify(JSON.parse(a.details), null, 2) : 'No additional details.'}</pre>
                      </td></tr>}
                    </Fragment>))}
              </tbody>
            </table>
          </div>)}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
    </motion.div>
  );
}
