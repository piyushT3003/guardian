import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Users, LifeBuoy, Server, CheckCheck, Mail, MailOpen, ArrowRight, Bell } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { useAuth, useToast } from '../lib/auth.jsx';
import { ago, dateTime } from '../lib/format.js';
import { Card, CardHead, Tabs, ErrorBox, Loading, Empty, Switch, stagger, rise, TopbarActions, ease } from '../components/ui.jsx';

const CH = { security: ['Company security', ShieldAlert], family: ['Family approval', Users], recovery: ['Recovery', LifeBuoy], system: ['System', Server] };
const SEV = { critical: 'tone-bad', warning: 'tone-warn', success: 'tone-good', info: 'tone-info' };
const ACTIONS = { investigate: ['Investigate', (n) => `/intelligence/${n.transaction_id}`], review_approval: ['Review approval', () => '/approvals'], open_recovery: ['Open recovery', () => '/recovery'], view_transaction: ['View transaction', (n) => `/intelligence/${n.transaction_id}`] };

export default function Notifications() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const channels = user.role === 'family' ? ['family'] : ['security', 'recovery', 'system'];
  const [channel, setChannel] = useState('');
  const [unread, setUnread] = useState(false);
  const { data, error, loading, reload, setData } = useApi(`/notifications${qs({ channel, unread: unread ? 1 : '', pageSize: 60 })}`, { live: ['notification'] });
  const [sel, setSel] = useState(sp.get('id') ? Number(sp.get('id')) : null);
  const active = data?.items.find((n) => n.id === sel) || data?.items[0];
  const mark = async (n, read = true) => {
    try { await api(`/notifications/${n.id}/${read ? 'read' : 'unread'}`, { method: 'POST' }); setData((d) => ({ ...d, items: d.items.map((x) => (x.id === n.id ? { ...x, read_at: read ? Date.now() : null } : x)), unread: d.unread + (read ? (n.read_at ? 0 : -1) : (n.read_at ? 1 : 0)) })); }
    catch (e) { toast({ title: 'Could not update', body: e.message, tone: 'bad' }); }
  };
  useEffect(() => { if (active && !active.read_at) mark(active, true); }, [active?.id]); // eslint-disable-line
  const readAll = async () => { const r = await api('/notifications/read-all', { method: 'POST', body: { channel: channel || undefined } }); toast({ title: `${r.updated} marked as read`, tone: 'good' }); reload(true); };
  const total = (k) => data?.counts?.[k]?.unread || 0;
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <TopbarActions><button className="btn" onClick={readAll} disabled={!data?.unread}><CheckCheck size={16} />Mark all read</button></TopbarActions>
      <div className="grid g-4">
        {channels.map((k) => { const [l, I] = CH[k]; return (
          <Card key={k} tilt onClick={() => setChannel(channel === k ? '' : k)} style={{ cursor: 'pointer', outline: channel === k ? '2px solid var(--brand-3)' : undefined }}>
            <div className="row"><span className="k-ico tone-brand" style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center' }}><I size={19} /></span><div><div className="bold">{l}</div><div className="small muted">{data?.counts?.[k]?.total || 0} total · <b style={{ color: total(k) ? 'var(--brand)' : undefined }}>{total(k)} unread</b></div></div></div>
          </Card>); })}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 1fr)', alignItems: 'start' }} data-resp="ov-row">
        <Card variants={rise}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}><Tabs value={channel} onChange={setChannel} tabs={[{ id: '', label: 'All' }, ...channels.map((k) => ({ id: k, label: CH[k][0], count: total(k) || undefined }))]} /></div>
            <label className="row small" style={{ gap: 8, marginBottom: 20 }}><Switch on={unread} onChange={setUnread} label="Unread only" />Unread only</label>
          </div>
          <ErrorBox error={error} onRetry={reload} />
          {loading && !data ? <Loading rows={8} height={44} /> : data?.items.length === 0 ? <Empty icon={Bell} title="No notifications" /> : (
            <div>
              <AnimatePresence initial={false}>
                {data.items.map((n) => { const [, I] = CH[n.channel]; return (
                  <motion.div key={n.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="lrow clickable" style={{ background: active?.id === n.id ? '#f6f2ff' : undefined, borderRadius: 12, padding: '11px 10px' }} onClick={() => setSel(n.id)}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, flex: 'none', background: n.read_at ? 'transparent' : 'var(--brand)' }} aria-label={n.read_at ? 'Read' : 'Unread'} />
                    <div className={`l-ico ${SEV[n.severity]}`}><I /></div>
                    <div className="l-main"><div className="l-t" style={{ fontWeight: n.read_at ? 550 : 750 }}>{n.title}</div><div className="l-s">{n.body || CH[n.channel][0]}</div></div>
                    <span className="xs muted" style={{ whiteSpace: 'nowrap' }}>{ago(n.created_at)}</span>
                  </motion.div>); })}
              </AnimatePresence>
            </div>)}
        </Card>
        <div style={{ position: 'sticky', top: 96 }}>
          <AnimatePresence mode="wait">
            {active && (
              <motion.div key={active.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }}>
                <Card>
                  <CardHead title="Notification details" right={<span className={`badge ${active.read_at ? 'b-muted' : 'b-brand'}`}>{active.read_at ? 'Read' : 'Unread'}</span>} />
                  <div className="bold" style={{ fontSize: 17 }}>{active.title}</div>
                  <div className="small" style={{ marginTop: 8, color: 'var(--ink-2)', lineHeight: 1.6 }}>{active.body || '—'}</div>
                  <dl className="kv" style={{ marginTop: 16 }}>
                    <dt>Channel</dt><dd>{CH[active.channel][0]}</dd><dt>Severity</dt><dd style={{ textTransform: 'capitalize' }}>{active.severity}</dd>
                    <dt>Received</dt><dd>{dateTime(active.created_at)}</dd><dt>Related transaction</dt><dd>{active.transaction_id || '—'}</dd>
                    {active.read_at && <><dt>Read</dt><dd>{dateTime(active.read_at)}</dd></>}
                  </dl>
                  <div className="row wrap" style={{ marginTop: 16 }}>
                    {active.action && ACTIONS[active.action] && !(user.role === 'family' && active.action !== 'review_approval') && <button className="btn primary sm" onClick={() => nav(ACTIONS[active.action][1](active))}>{ACTIONS[active.action][0]}<ArrowRight size={14} /></button>}
                    {active.transaction_id && user.role === 'family' && <button className="btn sm" onClick={() => nav(`/timeline?tx=${active.transaction_id}`)}>View in timeline</button>}
                    <button className="btn sm" onClick={() => mark(active, !active.read_at)}>{active.read_at ? <><Mail size={14} />Mark unread</> : <><MailOpen size={14} />Mark read</>}</button>
                  </div>
                </Card>
              </motion.div>)}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
