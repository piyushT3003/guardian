import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Download, RotateCcw } from 'lucide-react';
import { useApi, useLive } from '../lib/hooks.js';
import { qs, download } from '../lib/api.js';
import { inr, time, dayLabel } from '../lib/format.js';
import { Card, Score, Status, Pager, ErrorBox, Loading, Empty, TopbarActions, Source, stagger, rise } from '../components/ui.jsx';
import TxDrawer from '../components/TxDrawer.jsx';

const RANGES = { '1h': 3.6e6, '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };
const COLS = [['id', 'Transaction ID'], ['customer', 'Customer'], ['recipient', 'Recipient'], ['amount', 'Amount', 'right'], ['city', 'Location'], ['risk_score', 'Risk score'], [null, 'Risk level'], ['status', 'Status'], ['created_at', 'Time']];

export default function Transactions() {
  const nav = useNavigate();
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const f = { status: sp.get('status') || '', risk: sp.get('risk') || '', range: sp.get('range') || '', source: sp.get('source') || '', sort: sp.get('sort') || 'created_at', dir: sp.get('dir') || 'desc', page: Number(sp.get('page') || 1) };
  const set = (patch) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); if (!('page' in patch)) n.delete('page'); setSp(n, { replace: true }); };
  useEffect(() => { const t = setTimeout(() => { if ((sp.get('q') || '') !== q) set({ q }); }, 300); return () => clearTimeout(t); }, [q]); // eslint-disable-line
  const params = { q: sp.get('q'), status: f.status, risk: f.risk, source: f.source, sort: f.sort, dir: f.dir, page: f.page, pageSize: 12, from: f.range ? Date.now() - RANGES[f.range] : undefined };
  const path = `/transactions${qs(params)}`;
  const { data, error, loading, reload } = useApi(path, { live: [] });
  const [fresh, setFresh] = useState(0);
  useLive(['transaction'], () => { setFresh((n) => n + 1); reload(true); }, 600);
  const sortBy = (k) => k && set({ sort: k, dir: f.sort === k && f.dir === 'desc' ? 'asc' : 'desc' });
  const SortIcon = ({ k }) => (f.sort !== k ? <ArrowUpDown size={12} style={{ opacity: 0.4 }} /> : f.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />);
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <TopbarActions>
        <button className="btn" onClick={() => download(`/reports/transactions${qs({ format: 'csv', from: params.from })}`, 'guardian-transactions.csv')}><Download size={16} />Export CSV</button>
      </TopbarActions>
      <Card variants={rise} className="flush">
        <div className="toolbar" style={{ padding: 18, borderBottom: '1px solid var(--line)' }}>
          <div className="search-input" style={{ flex: '1 1 280px' }}><Search /><input className="input" placeholder="Search by transaction ID, customer, recipient, city…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" /></div>
          <select className="select" value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status filter">
            <option value="">All status</option><option value="pending">Pending (approval / review)</option><option value="held">Held / blocked</option><option value="completed">Completed</option><option value="recovery">Recovery</option>
            <option value="PENDING_FAMILY_APPROVAL">Pending family approval</option><option value="UNDER_REVIEW">Under review</option><option value="ON_HOLD">On hold</option><option value="BLOCKED">Blocked</option>
          </select>
          <select className="select" value={f.risk} onChange={(e) => set({ risk: e.target.value })} aria-label="Risk filter">
            <option value="">All risk levels</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="high,medium">Medium + High</option>
          </select>
          <select className="select" value={f.range} onChange={(e) => set({ range: e.target.value })} aria-label="Date filter">
            <option value="">All time</option><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
          </select>
          <select className="select" value={f.source} onChange={(e) => set({ source: e.target.value })} aria-label="Location source">
            <option value="">All location sources</option><option value="historical">Historical</option><option value="demo">Demo</option><option value="live_gps">Live GPS</option>
          </select>
          {(sp.toString()) && <button className="btn ghost" onClick={() => { setQ(''); setSp({}, { replace: true }); }}><RotateCcw size={15} />Reset</button>}
          <span className="badge b-good" style={{ marginLeft: 'auto' }}><span className="bd" style={{ animation: 'pulse 2s infinite', '--pc': 'rgba(18,183,106,.5)' }} />Live{fresh ? ` · ${fresh} update${fresh > 1 ? 's' : ''}` : ''}</span>
        </div>
        {error ? <div style={{ padding: 18 }}><ErrorBox error={error} onRetry={reload} /></div> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr>{COLS.map(([k, l, a]) => <th key={l} className={k ? 'sortable' : ''} style={a ? { textAlign: 'right' } : undefined} onClick={() => sortBy(k)} aria-sort={f.sort === k ? (f.dir === 'asc' ? 'ascending' : 'descending') : undefined}><span className="row" style={{ gap: 4, display: 'inline-flex' }}>{l}{k && <SortIcon k={k} />}</span></th>)}</tr></thead>
              <tbody>
                {loading && !data ? <tr><td colSpan={9}><Loading rows={8} /></td></tr> : data?.items.length === 0 ? <tr><td colSpan={9}><Empty title="No transactions match these filters" /></td></tr> :
                  data?.items.map((t) => (
                    <motion.tr key={t.id} layout="position" className={`clickable ${id === t.id ? 'sel' : ''}`} onClick={() => nav(`/transactions/${t.id}?${sp}`)}>
                      <td><span className={`rail ${t.risk_level}`} /><b>{t.id}</b></td>
                      <td>{t.customer}</td>
                      <td className="ellipsis" style={{ maxWidth: 200 }}>{t.recipient}</td>
                      <td className="tabular bold" style={{ textAlign: 'right' }}>{inr(t.amount)}</td>
                      <td><span style={{ color: t.risk_level === 'high' ? 'var(--bad-ink)' : undefined, fontWeight: t.risk_level === 'high' ? 650 : 500 }}>{t.city}</span> {t.location_source !== 'historical' && <Source s={t.location_source} />}</td>
                      <td><Score v={t.risk_score} level={t.risk_level} /></td>
                      <td className="small" style={{ textTransform: 'capitalize' }}>{t.risk_level}</td>
                      <td><Status s={t.status} /></td>
                      <td className="small"><div className="bold">{time(t.created_at)}</div><div className="muted xs">{dayLabel(t.created_at)}</div></td>
                    </motion.tr>))}
              </tbody>
            </table>
          </div>)}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
      </Card>
      <TxDrawer id={id} onClose={() => nav(`/transactions?${sp}`)} />
    </motion.div>
  );
}
