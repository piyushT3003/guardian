import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, ShieldCheck, Building2, Users, SlidersHorizontal, Scale, Bell, Webhook, MapPin, PlayCircle, Save, Trash2, Send, Lock, Check, X } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/auth.jsx';
import { initials, dateTime } from '../lib/format.js';
import { Card, CardHead, ErrorBox, PageLoading, Switch, Button, Notice, stagger, rise, ease } from '../components/ui.jsx';

const SECTIONS = [
  ['profile', 'User profile', User, ['analyst', 'admin', 'family']], ['roles', 'Role & permissions', ShieldCheck, ['analyst', 'admin']], ['company', 'Company', Building2, ['analyst', 'admin']],
  ['family', 'Trusted family', Users, ['analyst', 'admin']], ['thresholds', 'Fraud thresholds', SlidersHorizontal, ['analyst', 'admin']], ['policies', 'Risk policies', Scale, ['analyst', 'admin']],
  ['notifications', 'Notifications', Bell, ['analyst', 'admin']], ['webhooks', 'Webhooks', Webhook, ['admin']], ['location', 'Location', MapPin, ['analyst', 'admin']], ['demo', 'Demo configuration', PlayCircle, ['analyst', 'admin']],
];

export default function Settings() {
  const { user } = useAuth();
  const [sec, setSec] = useState('profile');
  const s = useApi(user.role === 'family' ? null : '/settings', { skip: user.role === 'family', live: [] });
  const list = SECTIONS.filter((x) => x[3].includes(user.role));
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)', alignItems: 'start' }} data-resp="ov-row">
      <Card variants={rise} style={{ padding: 10, position: 'sticky', top: 96 }}>
        <nav className="nav" aria-label="Settings sections">
          {list.map(([id, l, I]) => (
            <a key={id} href={`#${id}`} className={sec === id ? 'active' : ''} onClick={(e) => { e.preventDefault(); setSec(id); }}>
              {sec === id && <motion.span layoutId="set-pill" className="nav-pill" />}<I className="ico" />{l}
            </a>))}
        </nav>
      </Card>
      <motion.div key={sec} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className="stack">
        {user.role !== 'family' && sec !== 'profile' && s.data && !s.data.editable && <Notice icon={Lock}>You have read-only access to platform settings. Administrators can change them, and every change is recorded in the audit trail.</Notice>}
        {sec === 'profile' && <Profile />}
        {sec === 'roles' && <Roles />}
        {sec === 'family' && <Family />}
        {sec === 'webhooks' && <Webhooks />}
        {['company', 'thresholds', 'policies', 'notifications', 'location', 'demo'].includes(sec) && (s.error ? <ErrorBox error={s.error} /> : !s.data ? <PageLoading /> : <Group key={sec} group={sec} s={s} />)}
      </motion.div>
    </motion.div>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [p, setP] = useState({ name: user.name, title: user.title || '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pending, setPending] = useState(null);
  const save = async () => { setPending('p'); try { setUser(await api('/me/profile', { method: 'PUT', body: p })); toast({ title: 'Profile saved', tone: 'good' }); } catch (e) { toast({ title: 'Save failed', body: e.message, tone: 'bad' }); } finally { setPending(null); } };
  const change = async (e) => { e.preventDefault(); setPending('pw'); try { await api('/me/password', { method: 'PUT', body: pw }); setPw({ current: '', next: '' }); toast({ title: 'Password changed', tone: 'good' }); } catch (e2) { toast({ title: 'Password not changed', body: e2.message, tone: 'bad' }); } finally { setPending(null); } };
  return (
    <>
      <Card>
        <CardHead title="User profile" />
        <div className="row" style={{ gap: 16, marginBottom: 18 }}><span className={`avatar ${user.role}`} style={{ width: 60, height: 60, borderRadius: 18, fontSize: 19 }}>{initials(user.name)}</span><div><div className="bold" style={{ fontSize: 17 }}>{user.name}</div><div className="small muted">{user.email} · <span style={{ textTransform: 'capitalize' }}>{user.role}</span></div></div></div>
        <div className="grid g-2"><div className="field"><label>Full name</label><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div><div className="field"><label>Title</label><input className="input" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} /></div></div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}><Button className="primary" pending={pending === 'p'} onClick={save}><Save />Save profile</Button></div>
      </Card>
      <Card>
        <CardHead title="Change password" />
        <form onSubmit={change} className="grid g-2"><div className="field"><label>Current password</label><input type="password" className="input" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></div><div className="field"><label>New password (min 8)</label><input type="password" className="input" minLength={8} required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}><Button className="primary" pending={pending === 'pw'}><Lock />Update password</Button></div></form>
      </Card>
    </>
  );
}

function Roles() {
  const { user } = useAuth();
  const u = useApi('/users', { live: [] });
  const PERMS = [['View transactions, analytics, audit & reports', 1, 1, 0], ['Investigate, add notes, release or block held payments', 1, 1, 0], ['Approve or hold a protected payment', 0, 0, 1], ['Initiate or decline payment recovery', 0, 1, 0], ['Change policies, thresholds & webhooks', 0, 1, 0], ['Run demo scenarios', 1, 1, 0]];
  return (
    <>
      <Card><CardHead title="Your role" /><div className="row"><span className="badge b-brand" style={{ textTransform: 'capitalize', height: 30 }}><ShieldCheck size={14} />{user.role}</span><span className="small muted">Permissions are enforced by the API on every request.</span></div></Card>
      <Card className="flush"><div style={{ padding: '18px 18px 0' }}><CardHead title="Permission matrix" /></div>
        <div className="table-wrap"><table className="t"><thead><tr><th>Capability</th><th>Analyst</th><th>Administrator</th><th>Trusted family</th></tr></thead>
          <tbody>{PERMS.map(([l, ...r]) => <tr key={l}><td>{l}</td>{r.map((v, i) => <td key={i}>{v ? <Check size={16} color="var(--good)" /> : <X size={16} color="var(--ink-4)" />}</td>)}</tr>)}</tbody></table></div></Card>
      <Card><CardHead title="Users" sub={u.data ? `${u.data.length}` : ''} />
        {u.data?.map((x) => <div key={x.id} className="lrow"><span className={`avatar sm ${x.role}`}>{initials(x.name)}</span><div className="l-main"><div className="l-t">{x.name}</div><div className="l-s">{x.email} · {x.title}</div></div><span className="badge b-muted" style={{ textTransform: 'capitalize' }}>{x.role}</span></div>)}
      </Card>
    </>
  );
}

function Family() {
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { data, setData } = useApi('/customers', { live: [] });
  const toggle = async (c, v) => { try { await api(`/customers/${c.id}`, { method: 'PATCH', body: { family_protection: v } }); setData((d) => d.map((x) => (x.id === c.id ? { ...x, family_protection: v ? 1 : 0 } : x))); toast({ title: `${c.name}: family protection ${v ? 'on' : 'off'}`, tone: 'good' }); } catch (e) { toast({ title: 'Update failed', body: e.message, tone: 'bad' }); } };
  return (
    <Card><CardHead title="Trusted family configuration" sub="Per-customer approval protection" />
      {!data ? <PageLoading /> : data.map((c) => (
        <div key={c.id} className="lrow"><span className="avatar sm">{initials(c.name)}</span><div className="l-main"><div className="l-t">{c.name}</div><div className="l-s">{c.family_count} trusted family member{c.family_count === 1 ? '' : 's'} · {c.home_city}</div></div>
          <button className="btn sm ghost" onClick={() => nav(`/customers/${c.id}`)}>Manage</button><Switch on={!!c.family_protection} disabled={user.role !== 'admin'} onChange={(v) => toggle(c, v)} label={`Family protection for ${c.name}`} /></div>))}
    </Card>
  );
}

const FIELDS = {
  company: { title: 'Company configuration', f: [['name', 'Company name', 'text'], ['supportEmail', 'Security contact email', 'text'], ['timezone', 'Timezone', 'select', ['Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Asia/Singapore']]] },
  thresholds: { title: 'Fraud detection thresholds', note: 'Scores at or above “High” are held. Settled payments at or above “Auto-recovery” open a recovery window.', f: [['medium', 'Medium-risk threshold', 'range', [1, 100]], ['high', 'High-risk threshold', 'range', [1, 100]], ['autoRecovery', 'Auto-recovery threshold', 'range', [1, 100]]], extra: 'weights' },
  policies: { title: 'Risk policies', f: [['holdHighRiskForFamily', 'Hold high-risk payments for trusted family approval', 'bool'], ['reviewMediumRisk', 'Route medium-risk payments to analyst review', 'bool'], ['approvalWindowSec', 'Family approval window (seconds)', 'number'], ['recoveryWindowSec', 'Recovery window (seconds)', 'number'], ['impossibleTravelKmh', 'Impossible-travel speed (km/h)', 'number']] },
  notifications: { title: 'Notification preferences', note: 'Disabled channels stop creating in-app notifications and webhook events for that channel.', f: [['security', 'Company security alerts', 'bool'], ['family', 'Family approval requests', 'bool'], ['recovery', 'Recovery alerts', 'bool'], ['system', 'System notifications', 'bool']] },
  location: { title: 'Location preferences', f: [['familiarRadiusKm', 'Familiar-location radius (km)', 'number'], ['showAccuracyRadius', 'Show GPS accuracy radius on maps', 'bool'], ['requestBrowserLocation', 'Allow Geospatial page to request browser location', 'bool']] },
  demo: { title: 'Demo configuration', note: 'Controls the payment simulator used by demo scenarios and approvals.', f: [['settlementDelayMs', 'Settlement delay (ms)', 'number'], ['reversalDelayMs', 'Reversal confirmation delay (ms)', 'number'], ['reversalFailureRate', 'Simulated reversal failure rate (0–1)', 'number']] },
};

function Group({ group, s }) {
  const toast = useToast();
  const cfg = FIELDS[group];
  const [v, setV] = useState(s.data.settings[group]);
  const [w, setW] = useState(s.data.settings.weights);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { setV(s.data.settings[group]); setW(s.data.settings.weights); }, [s.data, group]);
  const ro = !s.data.editable;
  const save = async () => {
    setPending(true); setErr(null);
    try {
      let r = await api(`/settings/${group}`, { method: 'PUT', body: v });
      if (cfg.extra === 'weights') r = await api('/settings/weights', { method: 'PUT', body: w });
      s.setData((d) => ({ ...d, settings: r.settings })); toast({ title: `${cfg.title} saved`, body: 'Recorded in the audit trail.', tone: 'good' });
    } catch (e) { setErr(e); } finally { setPending(false); }
  };
  const input = ([k, l, t, o]) => (
    <div key={k} className={t === 'bool' ? 'row' : 'field'} style={t === 'bool' ? { justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f1fa' } : undefined}>
      <label htmlFor={`f-${k}`}>{l}</label>
      {t === 'bool' ? <Switch on={!!v[k]} disabled={ro} onChange={(x) => setV({ ...v, [k]: x })} label={l} /> :
        t === 'select' ? <select id={`f-${k}`} className="select" disabled={ro} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}>{o.map((x) => <option key={x}>{x}</option>)}</select> :
        t === 'range' ? <div className="row"><input id={`f-${k}`} type="range" min={o[0]} max={o[1]} disabled={ro} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} style={{ flex: 1, accentColor: 'var(--brand)' }} /><b className="tabular" style={{ width: 36, textAlign: 'right' }}>{v[k]}</b></div> :
        <input id={`f-${k}`} className="input" disabled={ro} type={t} step="any" value={v[k]} onChange={(e) => setV({ ...v, [k]: t === 'number' ? Number(e.target.value) : e.target.value })} />}
    </div>);
  return (
    <Card>
      <CardHead title={cfg.title} />
      {cfg.note && <div className="small muted" style={{ marginTop: -8, marginBottom: 14 }}>{cfg.note}</div>}
      <div className="stack" style={{ gap: 14 }}>{cfg.f.map(input)}</div>
      {cfg.extra === 'weights' && (
        <>
          <div className="sep" />
          <div className="bold small" style={{ marginBottom: 10 }}>Signal weights <span className="muted" style={{ fontWeight: 500 }}>(sum {Object.values(w).reduce((a, b) => a + Number(b), 0)})</span></div>
          <div className="grid g-3">{Object.keys(w).map((k) => <div key={k} className="field"><label style={{ textTransform: 'capitalize' }}>{k}</label><input className="input" type="number" min={0} max={60} disabled={ro} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} /></div>)}</div>
        </>)}
      <ErrorBox error={err} />
      {!ro && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}><button className="btn ghost" onClick={() => { setV(s.data.defaults[group]); if (cfg.extra) setW(s.data.defaults.weights); }}>Reset to defaults</button><Button className="primary" pending={pending} onClick={save}><Save />Save changes</Button></div>}
    </Card>
  );
}

function Webhooks() {
  const toast = useToast();
  const { data, error, reload } = useApi('/webhooks', { live: [] });
  const [url, setUrl] = useState(''), [events, setEvents] = useState('*');
  const [secret, setSecret] = useState(null);
  const [pending, setPending] = useState(null);
  const add = async (e) => { e.preventDefault(); setPending('add'); try { const r = await api('/webhooks', { method: 'POST', body: { url, events } }); setSecret(r); setUrl(''); reload(true); } catch (e2) { toast({ title: 'Webhook not added', body: e2.message, tone: 'bad' }); } finally { setPending(null); } };
  const del = async (id) => { setPending(`d${id}`); try { await api(`/webhooks/${id}`, { method: 'DELETE' }); reload(true); toast({ title: 'Webhook removed', tone: 'good' }); } catch (e) { toast({ title: 'Remove failed', body: e.message, tone: 'bad' }); } finally { setPending(null); } };
  const test = async (id) => { setPending(`t${id}`); try { const d = await api(`/webhooks/${id}/test`, { method: 'POST' }); toast({ title: d?.ok ? `Delivered (${d.status_code})` : 'Delivery failed', body: d?.error || '', tone: d?.ok ? 'good' : 'bad' }); reload(true); } catch (e) { toast({ title: 'Test failed', body: e.message, tone: 'bad' }); } finally { setPending(null); } };
  return (
    <>
      <Card>
        <CardHead title="Add webhook endpoint" />
        <form onSubmit={add} className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) auto', gap: 10, alignItems: 'end' }} data-resp="ov-row">
          <div className="field"><label>Endpoint URL</label><input className="input" type="url" required placeholder="https://example.com/guardian/webhook" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          <div className="field"><label>Events</label><select className="select" value={events} onChange={(e) => setEvents(e.target.value)}><option value="*">All events</option><option value="notification.*">Notifications</option><option value="transaction.*">High-risk transactions</option></select></div>
          <Button className="primary" pending={pending === 'add'}>Add</Button>
        </form>
        {secret && <Notice icon={Lock}><b>Signing secret for {secret.url}:</b> <code style={{ wordBreak: 'break-all' }}>{secret.secret}</code><br />{secret.note} Payloads are signed with HMAC-SHA256 in the <code>x-guardian-signature</code> header.</Notice>}
      </Card>
      <Card>
        <CardHead title="Endpoints" />
        <ErrorBox error={error} />
        {data?.length === 0 ? <div className="small muted">No webhook endpoints configured.</div> : data?.map((h) => (
          <div key={h.id} className="lrow"><div className="l-ico tone-brand"><Webhook /></div><div className="l-main"><div className="l-t">{h.url}</div><div className="l-s">{h.events} · added {dateTime(h.created_at)} · last delivery {h.last_ok == null ? 'none' : h.last_ok ? 'ok' : 'failed'}</div></div>
            <Button className="sm" pending={pending === `t${h.id}`} onClick={() => test(h.id)}><Send />Test</Button><Button className="sm danger" pending={pending === `d${h.id}`} onClick={() => del(h.id)}><Trash2 /></Button></div>))}
      </Card>
    </>
  );
}
