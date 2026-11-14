import { useNavigate } from 'react-router-dom';
import { ScanSearch, MapPinned, User, Store, Calendar, MapPin, Wallet, Hash } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { dateTime, inr, km, ago } from '../lib/format.js';
import { Drawer, Loading, ErrorBox, Status, RiskRing, Source } from './ui.jsx';

export default function TxDrawer({ id, onClose }) {
  const nav = useNavigate();
  const { data, error, loading } = useApi(id ? `/transactions/${id}` : null, { skip: !id });
  const t = data?.transaction;
  return (
    <Drawer open={!!id} onClose={onClose} title={<><div className="xs muted bold">TRANSACTION</div><div className="bold" style={{ fontSize: 18 }}>{id}</div></>}>
      {error && <ErrorBox error={error} />}
      {(loading || !t) && !error ? <Loading rows={8} /> : t && (
        <div className="stack" style={{ gap: 18 }}>
          <div className="row" style={{ gap: 18 }}>
            <RiskRing score={t.risk_score} size={120} stroke={10} level={t.risk_level} />
            <div className="stack" style={{ gap: 8 }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>{inr(t.amount)}</div>
              <Status s={t.status} />
              <div className="small muted">{t.recommended_action}</div>
            </div>
          </div>
          <dl className="kv">
            <dt><User />Customer</dt><dd>{t.customer}</dd>
            <dt><Store />Recipient</dt><dd>{t.recipient}</dd>
            <dt><Wallet />Channel</dt><dd>{t.channel}</dd>
            <dt><MapPin />Location</dt><dd>{t.city ? `${t.city}, ${t.region}` : '—'} <Source s={t.location_source} /></dd>
            <dt><MapPinned />From familiar</dt><dd>{km(t.analysis?.location?.distanceKm)}</dd>
            <dt><Calendar />Created</dt><dd>{dateTime(t.created_at)} <span className="muted xs">({ago(t.created_at)})</span></dd>
            <dt><Hash />Payment ref</dt><dd>{t.payment_ref || '—'}</dd>
          </dl>
          <div className="notice"><ScanSearch /><div><b>Guardian explanation.</b> {t.explanation}</div></div>
          <div>
            <div className="bold small" style={{ marginBottom: 8 }}>Detection signals</div>
            {t.signals.map((s) => (
              <div key={s.key} className="row small" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f1fa' }}>
                <span>{s.label}</span><b className="tabular">+{s.contribution.toFixed(1)}</b>
              </div>))}
          </div>
          <div className="row wrap">
            <button className="btn primary" onClick={() => nav(`/intelligence/${t.id}`)}><ScanSearch />Open intelligence</button>
            <button className="btn" onClick={() => nav(`/geo?tx=${t.id}`)}><MapPinned />View on map</button>
            {data.investigation && <button className="btn" onClick={() => nav(`/investigations/${data.investigation.id}`)}>Investigation</button>}
          </div>
        </div>
      )}
    </Drawer>
  );
}
