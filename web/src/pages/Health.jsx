import { motion } from 'framer-motion';
import { Server, Database, BrainCircuit, BellRing, Radio, Webhook, MessageSquare, RefreshCw, AlertTriangle, CheckCircle2, XCircle, MinusCircle, Clock } from 'lucide-react';
import { useApi, useLiveStatus } from '../lib/hooks.js';
import { dateTime, timeS, ago, int } from '../lib/format.js';
import { Card, CardHead, ErrorBox, PageLoading, Empty, stagger, TopbarActions } from '../components/ui.jsx';

const ICON = { backend: Server, database: Database, engine: BrainCircuit, notifications: BellRing, realtime: Radio, webhooks: Webhook, sms: MessageSquare };
const ST = { operational: ['Operational', 'b-good', CheckCircle2, 'var(--good)'], degraded: ['Degraded', 'b-warn', AlertTriangle, 'var(--warn)'], down: ['Down', 'b-bad', XCircle, 'var(--bad)'], not_configured: ['Not configured', 'b-muted', MinusCircle, 'var(--ink-4)'] };

export default function Health() {
  const { data, error, loading, reload } = useApi('/health', { live: ['notification', 'transaction'] });
  const live = useLiveStatus();
  if (error) return <div className="stack"><ErrorBox error={error} onRetry={reload} /><Card><CardHead title="Backend connectivity" /><div className="row"><XCircle color="var(--bad)" /><b>The Guardian API is not reachable from this browser.</b></div></Card></div>;
  if (loading || !data) return <PageLoading />;
  const checks = data.checks.map((c) => (c.key === 'realtime' ? { ...c, detail: `${c.detail} · this browser: ${live}` } : c));
  const allOk = checks.every((c) => c.status !== 'down' && c.status !== 'degraded');
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <TopbarActions><button className="btn" onClick={() => reload()}><RefreshCw size={16} />Re-run checks</button></TopbarActions>
      <Card style={{ background: allOk ? 'radial-gradient(500px 200px at 0% 0%, #e7f8ef, #fff 70%)' : 'radial-gradient(500px 200px at 0% 0%, #fff4e5, #fff 70%)' }}>
        <div className="row wrap" style={{ gap: 18 }}>
          <span className={`k-ico ${allOk ? 'tone-good' : 'tone-warn'}`} style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center' }}>{allOk ? <CheckCircle2 size={26} /> : <AlertTriangle size={26} />}</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 800 }}>{allOk ? 'All core services operational' : 'Some services need attention'}</div>
            <div className="small muted">Checked {timeS(data.serverNow)} · API up since {dateTime(data.startedAt)} · {data.errors24} warning/error events in the last 24 h</div></div>
          <div className="small muted">Results come from live checks run by the API, not from static values.</div>
        </div>
      </Card>
      <div className="grid g-4">
        {checks.map((c) => { const I = ICON[c.key] || Server; const [l, b, SI, col] = ST[c.status]; return (
          <Card key={c.key} tilt>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="k-ico tone-brand" style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center' }}><I size={19} /></span><span className={`badge ${b}`}><SI size={12} />{l}</span></div>
            <div className="bold" style={{ marginTop: 14 }}>{c.label}</div><div className="small muted" style={{ marginTop: 4, minHeight: 38 }}>{c.detail}</div>
            <div style={{ height: 3, borderRadius: 2, marginTop: 12, background: col, opacity: 0.6 }} />
          </Card>); })}
        <Card tilt><div className="row" style={{ justifyContent: 'space-between' }}><span className="k-ico tone-brand" style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center' }}><Database size={19} /></span><span className="badge b-muted">{data.database.file}</span></div>
          <div className="bold" style={{ marginTop: 14 }}>Database records</div>
          <div className="stack small" style={{ gap: 3, marginTop: 6 }}>{Object.entries(data.database.tables).map(([k, v]) => <div key={k} className="row" style={{ justifyContent: 'space-between' }}><span className="muted">{k}</span><b className="tabular">{int(v)}</b></div>)}</div></Card>
      </div>
      <div className="grid g-2">
        <Card><CardHead icon={AlertTriangle} title="Processing failures" sub="Stuck or failed transactions" />
          {data.processingFailures.length === 0 ? <Empty icon={CheckCircle2} title="No processing failures">No transactions are stuck in processing and no reversals have failed.</Empty> :
            data.processingFailures.map((f, i) => <div key={i} className="lrow"><div className="l-ico tone-bad"><XCircle /></div><div className="l-main"><div className="l-t">{f.id}</div><div className="l-s">{f.issue}</div></div><span className="xs muted">{ago(f.at)}</span></div>)}
        </Card>
        <Card><CardHead icon={Clock} title="Recent system events & errors" />
          {data.events.length === 0 ? <Empty title="No events" /> : data.events.map((e) => (
            <div key={e.id} className="lrow"><div className={`l-ico ${e.level === 'error' ? 'tone-bad' : e.level === 'warn' ? 'tone-warn' : 'tone-info'}`}>{e.level === 'error' ? <XCircle /> : e.level === 'warn' ? <AlertTriangle /> : <CheckCircle2 />}</div>
              <div className="l-main"><div className="l-t" style={{ whiteSpace: 'normal' }}>{e.message}</div><div className="l-s">{e.source} · {e.level}</div></div><span className="xs muted">{ago(e.at)}</span></div>))}
        </Card>
      </div>
      <Card><CardHead icon={Webhook} title="Webhook deliveries" />
        {data.webhookDeliveries.length === 0 ? <div className="small muted">No webhook deliveries yet. Configure endpoints in Settings → Webhooks.</div> :
          <div className="table-wrap"><table className="t"><thead><tr><th>Time</th><th>Endpoint</th><th>Event</th><th>Result</th></tr></thead><tbody>{data.webhookDeliveries.map((d) => <tr key={d.id}><td className="small">{timeS(d.at)}</td><td className="small ellipsis" style={{ maxWidth: 280 }}>{d.url}</td><td className="small">{d.event}</td><td>{d.ok ? <span className="badge b-good">{d.status_code}</span> : <span className="badge b-bad">{d.status_code || 'error'} {d.error ? `· ${d.error.slice(0, 40)}` : ''}</span>}</td></tr>)}</tbody></table></div>}
      </Card>
    </motion.div>
  );
}
