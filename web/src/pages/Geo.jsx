import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crosshair, LocateFixed, LocateOff, MapPin, Navigation, Route, Ruler, Clock, Target, AlertTriangle, ScanSearch, Send, Info } from 'lucide-react';
import { lazy, Suspense } from 'react';
import GeoMap from '../components/GeoMap.jsx';
const Globe3D = lazy(() => import('../components/Globe3D.jsx'));
import { useApi } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { useAuth, useToast } from '../lib/auth.jsx';
import { inr, km, dateTime, time, dayLabel, timeS } from '../lib/format.js';
import { Seg, Card, CardHead, Score, Status, ErrorBox, Empty, Source, Modal, Button, stagger, rise, TopbarActions } from '../components/ui.jsx';

const RANGES = { '': 'All time', '1d': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' };
const MS = { '1d': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };
const hav = (a, b) => { const R = 6371, r = (d) => (d * Math.PI) / 180; const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

/** Real browser geolocation. Never fabricates coordinates. */
function useGeolocation(enabled) {
  const [s, set] = useState({ status: 'idle', pos: null, error: null });
  useEffect(() => {
    if (!enabled) { set((x) => ({ ...x, status: x.pos ? 'paused' : 'idle' })); return; }
    if (!('geolocation' in navigator)) { set({ status: 'unavailable', pos: null, error: 'This browser does not support geolocation.' }); return; }
    set((x) => ({ ...x, status: 'requesting' }));
    const id = navigator.geolocation.watchPosition(
      (p) => set({ status: 'granted', error: null, pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp } }),
      (e) => set({ status: e.code === 1 ? 'denied' : 'unavailable', pos: null, error: e.code === 1 ? 'Location permission was denied.' : e.message || 'Position unavailable.' }),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return s;
}

export default function Geo() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const set = (patch) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  const txParam = sp.get('tx') || '', customer = sp.get('customer') || '', range = sp.get('range') || '', risk = sp.get('risk') || '';
  const customers = useApi('/customers', { live: [] });
  const path = `/geo${qs({ tx: txParam, customer: txParam ? '' : customer, risk, from: range ? Date.now() - MS[range] : '' })}`;
  const { data, error, loading } = useApi(path, { live: ['transaction'] });
  const cfg = useApi('/settings', { live: [] }).data?.settings?.location;
  const gpsAllowed = cfg?.requestBrowserLocation !== false;
  const [liveOn, setLiveOn] = useState(false);
  const [view, setView] = useState('map');
  const geo = useGeolocation(liveOn && gpsAllowed);
  const [simOpen, setSimOpen] = useState(false);
  const focus = data?.analysis?.tx || null;
  const loc = data?.analysis?.location;
  const liveDist = useMemo(() => {
    if (!geo.pos || !data?.familiar?.length) return null;
    return data.familiar.reduce((m, f) => { const d = hav(geo.pos, f); return d < m.d ? { d, f } : m; }, { d: Infinity });
  }, [geo.pos, data?.familiar]);
  const counts = useMemo(() => { const c = { high: 0, medium: 0, low: 0 }; (data?.points || []).forEach((p) => c[p.risk_level]++); return c; }, [data]);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="stack">
      <TopbarActions>
        <button className={`btn ${liveOn ? 'primary' : ''}`} disabled={!gpsAllowed} title={gpsAllowed ? undefined : 'Disabled in Settings → Location'} onClick={() => setLiveOn((v) => !v)}>{liveOn ? <LocateFixed size={16} /> : <LocateOff size={16} />}{liveOn ? 'Live GPS on' : 'Use live GPS'}</button>
      </TopbarActions>
      <Card variants={rise} style={{ padding: 14 }}>
        <div className="toolbar">
          {user.role !== 'family' && (
            <select className="select" value={txParam ? '' : customer} onChange={(e) => set({ customer: e.target.value, tx: '' })} aria-label="Customer filter">
              <option value="">All customers</option>{customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.home_city}</option>)}
            </select>)}
          <form onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('tx'); set({ tx: String(v).trim().toUpperCase() }); }} className="search-input" style={{ width: 230 }}>
            <Target /><input name="tx" key={txParam} defaultValue={txParam} className="input" placeholder="Transaction ID" aria-label="Transaction" />
          </form>
          <select className="select" value={range} onChange={(e) => set({ range: e.target.value })} aria-label="Date filter">{Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <div className="row" style={{ gap: 6 }}>
            {[['', 'All risk'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([k, l]) => <button key={k} className={`chip ${risk === k ? 'on' : ''}`} onClick={() => set({ risk: k })}>{l}</button>)}
          </div>
          {(txParam || customer || range || risk) && <button className="btn ghost sm" onClick={() => setSp({}, { replace: true })}>Clear filters</button>}
          <span className="muted small" style={{ marginLeft: 'auto' }}>{data ? `${data.points.length} plotted · ${counts.high} high · ${counts.medium} medium` : ''}</span>
        </div>
      </Card>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px', alignItems: 'start' }} data-resp="ov-row">
        <motion.div variants={rise} className="map-shell" style={{ minHeight: 560 }}>
          <div className="view-toggle"><Seg value={view} onChange={setView} options={[{ value: 'map', label: 'Map' }, { value: 'globe', label: '3D globe' }]} /></div>
          {error ? <div style={{ padding: 20 }}><ErrorBox error={error} /></div> : view === 'globe' ? (
            <Suspense fallback={<div className="skel" style={{ height: 'calc(100vh - 250px)', minHeight: 560 }} />}>
              <Globe3D height="max(560px, calc(100vh - 250px))" points={data?.points || []} familiar={data?.familiar || []} focus={focus} previous={loc?.prev} live={geo.pos}
                moves={!focus && data?.customerId ? data.suspiciousMoves : []} onSelect={(p) => set({ tx: p.id })} />
            </Suspense>
          ) : (
            <GeoMap height="calc(100vh - 250px)" points={data?.points || []} familiar={data?.familiar || []} focus={focus} previous={loc?.prev} trail={focus ? [] : data?.trail || []}
              moves={!focus && data?.customerId ? data.suspiciousMoves : []} live={geo.pos} showAccuracy={cfg?.showAccuracyRadius !== false} selectedId={focus?.id} onSelect={(p) => set({ tx: p.id })} fitKey={`${path}-${data ? data.points.length : "x"}-${geo.status === "granted" && !focus}`} />)}
          <div className="map-legend">
            <span><i className="g-dot" style={{ background: '#f04438' }} />High-risk historical</span>
            <span><i className="g-dot" style={{ background: '#f79009' }} />Medium-risk historical</span>
            <span><i className="g-dot" style={{ background: '#12b76a' }} />Low-risk historical</span>
            <span><i className="g-dot" style={{ background: '#dc6803', outline: '1px dashed #dc6803' }} />Demo location</span>
            <span><i className="g-dot" style={{ background: '#2e7cf6' }} />Live GPS (this device)</span>
            <span><i style={{ width: 12, height: 12, borderRadius: 4, border: '2px solid #12b76a', background: '#fff' }} />Familiar location</span>
          </div>
          {loading && <div className="map-float" style={{ top: 14, left: '50%', transform: 'translateX(-50%)' }}><span className="badge b-brand"><span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} />Loading locations…</span></div>}
        </motion.div>

        <div className="stack">
          <Card variants={rise}>
            <CardHead icon={MapPin} title="Location analysis" right={focus && <Score v={focus.risk_score} level={focus.risk_level} />} />
            {!focus ? <div className="small muted">Select a transaction on the map or enter a transaction ID to analyse its location.</div> : (
              <>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><b>{focus.id}</b><Source s={focus.location_source} /></div>
                <dl className="kv">
                  <dt><Navigation />City / region</dt><dd>{focus.city}, {focus.region}</dd>
                  <dt><Crosshair />Latitude</dt><dd className="tabular">{focus.lat.toFixed(5)}°</dd>
                  <dt><Crosshair />Longitude</dt><dd className="tabular">{focus.lng.toFixed(5)}°</dd>
                  <dt><Target />Accuracy radius</dt><dd>{focus.accuracy_m ? `± ${focus.accuracy_m} m` : '—'}</dd>
                  <dt><Clock />Timestamp</dt><dd>{dateTime(focus.created_at)}</dd>
                  <dt><Ruler />From familiar</dt><dd style={{ color: loc?.distanceKm > 300 ? 'var(--bad-ink)' : undefined }}>{km(loc?.distanceKm)} {loc?.distanceKm > 300 && <span className="badge b-bad" style={{ height: 20 }}>Unusual</span>}</dd>
                  <dt><MapPin />Familiar location</dt><dd>{loc?.familiar?.city || '—'}</dd>
                  <dt><Route />Previous location</dt><dd>{loc?.prev ? `${loc.prev.city} · ${time(loc.prev.at)}` : '—'}</dd>
                  <dt><Ruler />Location deviation</dt><dd>{loc?.prev ? `${km(loc.prevDistanceKm)}${loc.impossibleTravel ? ' · impossible travel' : ''}` : '—'}</dd>
                </dl>
                <div className="notice" style={{ marginTop: 14 }}><AlertTriangle /><div>{focus.signals?.[0]?.evidence || 'No location signal.'} <b>Signal contribution +{focus.signals?.[0]?.contribution?.toFixed(1) ?? 0}</b>.</div></div>
                <div className="row" style={{ marginTop: 12 }}>
                  {user.role !== 'family' && <button className="btn sm primary" onClick={() => nav(`/intelligence/${focus.id}`)}><ScanSearch />Full analysis</button>}
                  <button className="btn sm" onClick={() => set({ tx: '', customer: String(focus.customer_id) })}>Customer trail</button>
                </div>
              </>)}
          </Card>
          <Card variants={rise}>
            <CardHead icon={LocateFixed} title="Live GPS · this device" right={<span className={`badge ${geo.status === 'granted' ? 'b-good' : geo.status === 'denied' || geo.status === 'unavailable' ? 'b-bad' : 'b-muted'}`}>{{ idle: 'Off', requesting: 'Requesting…', granted: 'Live', denied: 'Denied', unavailable: 'Unavailable', paused: 'Paused' }[geo.status]}</span>} />
            {geo.status === 'granted' && geo.pos ? (
              <>
                <dl className="kv">
                  <dt>Latitude</dt><dd className="tabular">{geo.pos.lat.toFixed(5)}°</dd>
                  <dt>Longitude</dt><dd className="tabular">{geo.pos.lng.toFixed(5)}°</dd>
                  <dt>Accuracy</dt><dd>± {Math.round(geo.pos.accuracy)} m</dd>
                  <dt>Fix time</dt><dd>{timeS(geo.pos.at)}</dd>
                  {liveDist && <><dt>From {liveDist.f.city}</dt><dd>{km(liveDist.d)}</dd></>}
                </dl>
                {user.role !== 'family' && <button className="btn sm" style={{ marginTop: 12, width: '100%' }} onClick={() => setSimOpen(true)}><Send size={14} />Score a payment from this location</button>}
              </>
            ) : geo.status === 'denied' || geo.status === 'unavailable' ? (
              <Empty icon={LocateOff} title="Live location unavailable">{geo.error} Guardian will not show an estimated or substitute location. Enable location access for this site in your browser settings to continue.</Empty>
            ) : (
              <div className="small muted">{geo.status === 'requesting' ? 'Waiting for your browser to provide a position…' : 'Turn on live GPS to show this device\'s real position. Historical points always come from stored transaction coordinates.'}
                {!gpsAllowed && <div style={{ marginTop: 8 }}>Browser location requests are disabled in Settings → Location.</div>}
                {geo.status !== 'requesting' && gpsAllowed && <button className="btn sm" style={{ marginTop: 10, display: 'flex' }} onClick={() => setLiveOn(true)}><LocateFixed size={14} />Enable live GPS</button>}</div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid g-2">
        <Card variants={rise} className="flush">
          <div style={{ padding: '18px 18px 0' }}><CardHead icon={Route} title="Transaction location history" sub={data?.customerId ? 'Selected customer' : 'Most recent'} /></div>
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table className="t"><thead><tr><th>ID</th><th>Customer</th><th>Location</th><th>Source</th><th>Score</th><th>Time</th></tr></thead>
              <tbody>{(data?.points || []).slice(0, 40).map((p) => (
                <tr key={p.id} className={`clickable ${focus?.id === p.id ? 'sel' : ''}`} onClick={() => set({ tx: p.id })}>
                  <td><span className={`rail ${p.risk_level}`} /><b>{p.id}</b></td><td>{p.customer}</td><td>{p.city}</td><td><Source s={p.location_source} /></td><td><Score v={p.risk_score} level={p.risk_level} /></td><td className="small">{dayLabel(p.created_at)}, {time(p.created_at)}</td>
                </tr>))}</tbody></table>
          </div>
        </Card>
        <Card variants={rise}>
          <CardHead icon={AlertTriangle} title="Suspicious location changes" sub="> 300 km within 6 h" />
          {!data?.customerId ? <div className="small muted"><Info size={14} style={{ verticalAlign: -2 }} /> Select a customer or transaction to compute location changes along their trail.</div> :
            data.suspiciousMoves.length === 0 ? <Empty title="No suspicious movement" /> : data.suspiciousMoves.map((m, i) => (
              <div key={i} className="lrow clickable" onClick={() => set({ tx: m.to.id })}>
                <div className="l-ico tone-bad"><Route /></div>
                <div className="l-main"><div className="l-t">{m.from.city} → {m.to.city}</div><div className="l-s">{km(m.km)} in {m.hours < 1 ? `${Math.round(m.hours * 60)} min` : `${m.hours} h`} · {m.to.id}</div></div>
                <span className="xs muted">{dayLabel(m.to.created_at)}</span>
              </div>))}
        </Card>
      </div>
      <LiveSimModal open={simOpen} onClose={() => setSimOpen(false)} pos={geo.pos} customers={customers.data || []} onDone={(t) => { setSimOpen(false); set({ tx: t.id }); }} />
    </motion.div>
  );
}

function LiveSimModal({ open, onClose, pos, customers, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ customer_id: '', recipient: '', amount: '' });
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setPending(true); setErr(null);
    try {
      const t = await api('/transactions', { method: 'POST', idempotent: true, body: { ...f, customer_id: Number(f.customer_id), amount: Number(f.amount), lat: pos.lat, lng: pos.lng, accuracy_m: Math.round(pos.accuracy), location_source: 'live_gps' } });
      toast({ title: `${t.id} scored ${t.risk_score}`, body: `Status: ${t.status.replaceAll('_', ' ').toLowerCase()}`, tone: t.risk_level === 'high' ? 'warn' : 'good' });
      onDone(t);
    } catch (e2) { setErr(e2); } finally { setPending(false); }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
        <div><div className="bold" style={{ fontSize: 18 }}>Score a payment at your live location</div><div className="small muted">Sends a real transaction through Guardian's pipeline using this device's GPS fix{pos ? ` (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)} ± ${Math.round(pos.accuracy)} m)` : ''}. It is labelled “Live GPS”.</div></div>
        <div className="field"><label>Customer</label><select required className="select" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}><option value="">Select customer…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="grid g-2"><div className="field"><label>Recipient</label><input required className="input" value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })} placeholder="e.g. Swiggy" /></div>
          <div className="field"><label>Amount (₹)</label><input required className="input" type="number" min="1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div></div>
        <ErrorBox error={err} />
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Cancel</button><Button className="primary" pending={pending} disabled={!pos}>Ingest & score</Button></div>
      </form>
    </Modal>
  );
}
