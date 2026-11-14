import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Mail, ShieldCheck, Users, LifeBuoy, ScanSearch } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { BrandMark } from '../components/Layout.jsx';
import { Button, ErrorBox, ease } from '../components/ui.jsx';
import { initials } from '../lib/format.js';
const Shield3D = lazy(() => import('../components/Shield3D.jsx'));

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [demo, setDemo] = useState(null);
  useEffect(() => { api('/auth/demo-accounts').then(setDemo).catch(() => {}); }, []);
  if (user) return <Navigate to={loc.state?.from || (user.role === 'family' ? '/approvals' : '/overview')} replace />;
  const submit = async (e, em = email, pw = password) => {
    e?.preventDefault(); setPending(true); setError(null);
    try { const u = await login(em, pw); nav(loc.state?.from || (u.role === 'family' ? '/approvals' : '/overview'), { replace: true }); }
    catch (err) { setError(err); } finally { setPending(false); }
  };
  return (
    <div className="login-bg">
      <div className="login-art" style={{ position: 'relative', overflow: 'hidden', padding: 48, display: 'flex', flexDirection: 'column', background: 'radial-gradient(700px 500px at 50% 45%, #e6dcff 0%, transparent 70%), linear-gradient(160deg, #f7f4ff, #ebf0ff)' }}>
        <div className="row"><BrandMark /><div><div className="brand-name">Guardian</div><div className="brand-sub">AI Payment Safety</div></div></div>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <Suspense fallback={<div style={{ height: 420 }} />}><Shield3D height={440} /></Suspense>
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.2 }}>
          <h2 style={{ fontSize: 34, letterSpacing: '-0.035em', margin: '0 0 10px', lineHeight: 1.1 }}>Stop fraudulent payments<br />before they settle.</h2>
          <p className="muted" style={{ maxWidth: 520, margin: 0 }}>Guardian scores every transaction against the customer's own behaviour, holds risky payments for trusted family approval, and gives your team a five-minute window to recover mistakes.</p>
          <div className="row wrap" style={{ marginTop: 18, gap: 8 }}>
            {[[ScanSearch, 'Explainable risk scoring'], [Users, 'Family approval'], [LifeBuoy, 'Recovery window']].map(([I, l]) => <span key={l} className="chip"><I size={13} />{l}</span>)}
          </div>
        </motion.div>
      </div>
      <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <motion.form onSubmit={submit} className="card" style={{ width: 'min(440px, 100%)', padding: 34 }} initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease }}>
          <div className="mobile-only" style={{ marginBottom: 16 }}><div className="row"><BrandMark size={34} /><div className="brand-name">Guardian</div></div></div>
          <h1 style={{ margin: '0 0 6px', fontSize: 26, letterSpacing: '-0.03em' }}>Sign in</h1>
          <p className="muted" style={{ margin: '0 0 22px' }}>Access the Guardian security console.</p>
          <div className="stack" style={{ gap: 14 }}>
            <div className="field"><label htmlFor="em">Work email</label>
              <div className="search-input"><Mail /><input id="em" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></div>
            <div className="field"><label htmlFor="pw">Password</label>
              <div className="search-input"><Lock /><input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div></div>
            <ErrorBox error={error} />
            <Button className="primary lg" pending={pending} type="submit"><ShieldCheck size={18} />Sign in securely</Button>
          </div>
          {demo?.accounts?.length > 0 && demo.password && (
            <div style={{ marginTop: 26 }}>
              <div className="nav-section" style={{ padding: '0 0 8px' }}>Demo accounts · password {demo.password}</div>
              <div className="stack" style={{ gap: 8 }}>
                {demo.accounts.map((a) => (
                  <button type="button" key={a.email} className="queue-item row" onClick={() => submit(null, a.email, demo.password)} disabled={pending}>
                    <span className={`avatar sm ${a.role}`}>{initials(a.name)}</span>
                    <span style={{ minWidth: 0 }}><span className="bold" style={{ display: 'block' }}>{a.name}</span><span className="xs muted">{a.title}</span></span>
                    <span className="badge b-brand" style={{ marginLeft: 'auto', textTransform: 'capitalize' }}>{a.role}</span>
                  </button>))}
              </div>
            </div>
          )}
        </motion.form>
      </div>
    </div>
  );
}
