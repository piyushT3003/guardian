// Guardian map: Leaflet with a built-in vector basemap (works offline) plus optional raster tiles
// from VITE_MAP_TILE_URL. Distinguishes live GPS, historical and demo locations.
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Polyline, Circle, Tooltip, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import region from '../lib/region.json';
import { inr, km, dateTime } from '../lib/format.js';

const TILE = import.meta.env.VITE_MAP_TILE_URL ?? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const ATTR = import.meta.env.VITE_MAP_ATTRIBUTION ?? '&copy; OpenStreetMap contributors &copy; CARTO';
const RISK = { high: '#f04438', medium: '#f79009', low: '#12b76a' };

const pin = (color, pulse = false, glyph = '') => L.divIcon({
  className: '', iconSize: [34, 42], iconAnchor: [17, 40], tooltipAnchor: [0, -36],
  html: `<div class="g-marker" style="--pc:${color}88">${pulse ? `<div class="g-pulse" style="top:40px;left:17px;--pc:${color}88"></div>` : ''}<div class="g-pin" style="background:linear-gradient(145deg,${color},${color}cc)"><span>${glyph}</span></div></div>`,
});
const liveIcon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div style="position:relative;width:22px;height:22px"><div class="g-pulse" style="--pc:rgba(46,124,246,.6)"></div><div style="position:absolute;inset:3px;border-radius:50%;background:#2e7cf6;border:3px solid #fff;box-shadow:0 2px 8px rgba(46,124,246,.6)"></div></div>' });
const homeIcon = L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], tooltipAnchor: [0, -14], html: '<div style="width:30px;height:30px;border-radius:10px;background:#fff;border:2px solid #12b76a;display:grid;place-items:center;box-shadow:0 6px 14px -4px rgba(18,183,106,.6)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#067647" stroke-width="2.4"><path d="M3 10.5 12 3l9 7.5V21H3z"/></svg></div>' });

function Fit({ bounds, deps }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds?.length) return;
    const go = () => {
      map.invalidateSize();
      if (bounds.length === 1) map.setView(bounds[0], 8, { animate: false });
      else map.fitBounds(L.latLngBounds(bounds).pad(0.2), { animate: false, maxZoom: 8 });
    };
    go();
    const t = setTimeout(go, 450); // re-fit once the page entrance animation has settled
    return () => clearTimeout(t);
  }, [deps]); // eslint-disable-line
  return null;
}
function Resize() { const map = useMap(); useEffect(() => { const ro = new ResizeObserver(() => map.invalidateSize()); ro.observe(map.getContainer()); return () => ro.disconnect(); }, [map]); return null; }

export default function GeoMap({ points = [], familiar = [], focus = null, previous = null, live = null, trail = [], moves = [], selectedId, onSelect, height = 560, showAccuracy = true, fitKey, tiles = true }) {
  const [tileOk, setTileOk] = useState(true);
  const bounds = useMemo(() => {
    const b = [];
    if (focus) b.push([focus.lat, focus.lng]);
    familiar.forEach((f) => focus && b.push([f.lat, f.lng]));
    if (!focus) points.slice(0, 300).forEach((p) => b.push([p.lat, p.lng]));
    if (live && !focus) b.push([live.lat, live.lng]);
    return b.length ? b : [[22.5, 79]];
  }, [focus, familiar, points, live]);
  const nearest = focus && familiar.length ? familiar.reduce((m, f) => { const d = L.latLng(focus.lat, focus.lng).distanceTo([f.lat, f.lng]); return d < m.d ? { f, d } : m; }, { d: Infinity }).f : null;
  const mid = nearest ? [(focus.lat + nearest.lat) / 2, (focus.lng + nearest.lng) / 2] : null;
  return (
    <MapContainer center={[22.5, 79]} zoom={5} minZoom={3} maxZoom={16} style={{ height, width: '100%' }} zoomControl worldCopyJump scrollWheelZoom>
      <Resize />
      <GeoJSON data={region} style={(f) => ({ color: '#d8d0f5', weight: 1, fillColor: f.properties.name === 'India' ? '#f1ecff' : '#f7f5fc', fillOpacity: 1 })} />
      {tiles && TILE && tileOk && <TileLayer url={TILE} attribution={ATTR} opacity={0.92} eventHandlers={{ tileerror: () => setTileOk(false) }} />}
      <Fit bounds={bounds} deps={fitKey ?? `${focus?.id}-${points.length}`} />

      {trail.length > 1 && <Polyline positions={trail.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#8b6cff', weight: 2, opacity: 0.55 }} />}
      {moves.map((m, i) => <Polyline key={i} positions={[[m.from.lat, m.from.lng], [m.to.lat, m.to.lng]]} pathOptions={{ color: '#f04438', weight: 2, opacity: 0.55, className: 'dash-anim' }} />)}

      {points.map((p) => p.id !== focus?.id && (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={selectedId === p.id ? 9 : p.risk_level === 'high' ? 7 : p.risk_level === 'medium' ? 6 : 4.5}
          pathOptions={{ color: '#fff', weight: 1.5, fillColor: p.location_source === 'demo' ? '#dc6803' : p.location_source === 'live_gps' ? '#2e7cf6' : RISK[p.risk_level], fillOpacity: 0.9, dashArray: p.location_source === 'demo' ? '2 2' : undefined }}
          eventHandlers={{ click: () => onSelect?.(p) }}>
          <Tooltip className="g-tip" direction="top"><b>{p.id}</b> · {p.city}<br />{p.customer} → {p.recipient}<br />{inr(p.amount)} · score {p.risk_score} · {p.location_source === 'demo' ? 'Demo location' : p.location_source === 'live_gps' ? 'Live GPS' : 'Historical'}</Tooltip>
        </CircleMarker>
      ))}

      {familiar.map((f, i) => (
        <Marker key={`f${i}`} position={[f.lat, f.lng]} icon={homeIcon}>
          <Tooltip className="g-tip" direction="top"><b>{f.kind === 'home' ? 'Home' : 'Familiar location'}</b> · {f.city}{f.count ? ` · ${f.count} trusted payments` : ''}</Tooltip>
        </Marker>))}

      {previous && <Marker position={[previous.lat, previous.lng]} icon={pin('#7a5af8', false)}><Tooltip className="g-tip" direction="top"><b>Previous transaction</b> · {previous.city}<br />{dateTime(previous.at)}</Tooltip></Marker>}

      {focus && <>
        {showAccuracy && focus.accuracy_m && <Circle center={[focus.lat, focus.lng]} radius={Math.max(focus.accuracy_m, 30)} pathOptions={{ color: '#f04438', weight: 1, fillOpacity: 0.08 }} />}
        <Marker position={[focus.lat, focus.lng]} icon={pin(focus.risk_level === 'high' ? '#f04438' : focus.risk_level === 'medium' ? '#f79009' : '#12b76a', true)} zIndexOffset={1000}>
          <Tooltip className="g-tip" direction="top" permanent><b style={{ color: '#b42318' }}>{focus.location_source === 'demo' ? 'Demo transaction location' : focus.location_source === 'live_gps' ? 'Live GPS transaction' : 'Transaction location'}</b><br />{focus.city}, {focus.region}</Tooltip>
        </Marker>
        {nearest && <Polyline positions={[[nearest.lat, nearest.lng], [focus.lat, focus.lng]]} pathOptions={{ color: '#f04438', weight: 2.5, className: 'dash-anim' }} />}
        {nearest && mid && L.latLng(focus.lat, focus.lng).distanceTo([nearest.lat, nearest.lng]) > 30000 && <Marker position={mid} icon={L.divIcon({ className: '', iconSize: [90, 28], iconAnchor: [45, 14], html: `<div style="background:#17132e;color:#fff;border-radius:9px;padding:5px 10px;font-weight:700;font-size:12px;text-align:center;box-shadow:0 8px 18px -6px rgba(0,0,0,.5);white-space:nowrap">${km(L.latLng(focus.lat, focus.lng).distanceTo([nearest.lat, nearest.lng]) / 1000)}</div>` })} interactive={false} />}
      </>}

      {live && <>
        {showAccuracy && <Circle center={[live.lat, live.lng]} radius={live.accuracy} pathOptions={{ color: '#2e7cf6', weight: 1, fillOpacity: 0.1 }} />}
        <Marker position={[live.lat, live.lng]} icon={liveIcon} zIndexOffset={1200}>
          <Tooltip className="g-tip" direction="top"><b style={{ color: '#175cd3' }}>Live GPS · this device</b><br />±{Math.round(live.accuracy)} m · {new Date(live.at).toLocaleTimeString()}</Tooltip>
        </Marker>
      </>}
    </MapContainer>
  );
}
