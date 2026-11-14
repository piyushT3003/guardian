import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Activity, ScanSearch, Search, MapPinned, Users, LifeBuoy, UserRound, BarChart3, GitCommitVertical, Bell, ScrollText,
  HeartPulse, FileBarChart, Settings, ChevronDown, LogOut, Menu, PlayCircle, Repeat, Shield as ShieldIcon, Radio,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api, qs } from '../lib/api.js';
import { useApi, useLiveStatus } from '../lib/hooks.js';
import { ago, inr, initials } from '../lib/format.js';
import { Score, ease } from './ui.jsx';

export const NAV = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard, sub: 'Real-time payment security and fraud intelligence', roles: ['analyst', 'admin'] },
  { to: '/transactions', label: 'Live Transactions', icon: Activity, sub: 'Real-time transaction stream with risk analysis', roles: ['analyst', 'admin'] },
  { to: '/intelligence', label: 'Transaction Intelligence', icon: ScanSearch, sub: 'Deep analysis of an individual transaction', roles: ['analyst', 'admin'] },
  { to: '/investigations', label: 'Fraud Investigation', icon: Search, sub: 'Analyst investigation workspace', roles: ['analyst', 'admin'] },
  { to: '/geo', label: 'Geospatial Intelligence', icon: MapPinned, sub: 'Location-based transaction analysis and risk detection', roles: ['analyst', 'admin', 'family'] },
  { to: '/approvals', label: 'Family Approval Centre', icon: Users, sub: 'Trusted family review of protected payments', roles: ['analyst', 'admin', 'family'], badge: 'approvals' },
  { to: '/recovery', label: 'Recovery Operations', icon: LifeBuoy, sub: 'Time-sensitive payment recovery requests', roles: ['analyst', 'admin'], badge: 'recoveries' },
  { to: '/customers', label: 'Customer Profiles', icon: UserRound, sub: 'Individual customer payment safety', roles: ['analyst', 'admin', 'family'] },
  { to: '/analytics', label: 'Risk Analytics', icon: BarChart3, sub: 'Fraud detection and payment security patterns', roles: ['analyst', 'admin'] },
  { to: '/timeline', label: 'Scam Pattern Timeline', icon: GitCommitVertical, sub: 'Chronology of suspicious transaction sequences', roles: ['analyst', 'admin', 'family'] },
  { to: '/notifications', label: 'Notifications', icon: Bell, sub: 'Security, family, recovery and system notifications', roles: ['analyst', 'admin', 'family'], badge: 'notifications' },
  { to: '/audit', label: 'Audit Trail', icon: ScrollText, sub: 'Traceable history of every operation', roles: ['analyst', 'admin'] },
  { to: '/health', label: 'System Health', icon: HeartPulse, sub: 'Live status of Guardian services', roles: ['analyst', 'admin'] },
  { to: '/reports', label: 'Reports', icon: FileBarChart, sub: 'Generate and export operational reports', roles: ['analyst', 'admin'] },
  { to: '/settings', label: 'Settings', icon: Settings, sub: 'Profile, policies and platform configuration', roles: ['analyst', 'admin', 'family'] },
];
const EXTRA = [{ to: '/demo', label: 'Demo Scenarios', icon: PlayCircle, sub: 'Run the two end-to-end flagship scenarios', roles: ['analyst', 'admin'] }];

export function BrandMark({ size = 40 }) {
  return (
    <svg className="brand-mark" width={size} height={size * 1.1} viewBox="0 0 40 44" aria-hidden>
      <defs>
        <linearGradient id="bm1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9b82ff" /><stop offset=".55" stopColor="#6d4cf6" /><stop offset="1" stopColor="#4f6bff" /></linearGradient>
        <linearGradient id="bm2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <path d="M20 2 C26 5 31 6 37 6 C37 22 33 34 20 42 C7 34 3 22 3 6 C9 6 14 5 20 2Z" fill="url(#bm1)" />
      <path d="M20 2 C26 5 31 6 37 6 C37 12 36 17 34 21 C26 15 14 14 4 15 C3.4 12 3 9 3 6 C9 6 14 5 20 2Z" fill="url(#bm2)" />
      <path d="M20 9 C24 11 27 11.5 30.5 11.5 C30.5 22 28 29 20 34.5 C12 29 9.5 22 9.5 11.5 C13 11.5 16 11 20 9Z" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="2" />
      <path d="M15.5 21.5 l3.2 3.2 l6-6.4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function useBadges(user) {
  const n = useApi('/notifications?pageSize=1', { live: ['notification'] });
  const a = useApi('/approvals?status=PENDING', { live: ['transaction', 'notification'] });
  const r = useApi(user.role === 'family' ? null : '/recoveries?status=OPEN', { live: ['transaction'], skip: user.role === 'family' });
  return { notifications: n.data?.unread || 0, approvals: a.data?.items?.length || 0, recoveries: r.data?.items?.length || 0 };
}

export default function Layout() {
  const { user } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const badges = useBadges(user);
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const meta = [...NAV, ...EXTRA].find((n) => loc.pathname.startsWith(n.to)) || NAV[0];
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => { document.title = `${meta.label} · Guardian`; }, [meta.label]);
  const live = useLiveStatus();
  const groups = [['Monitor', items.slice(0, 5)], ['Operate', items.slice(5, 10)], ['Platform', items.slice(10)]];
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><BrandMark /><div><div className="brand-name">Guardian</div><div className="brand-sub">AI Payment Safety</div></div></div>
        <nav className="nav" aria-label="Primary">
          {(user.role === 'family' ? [['', items]] : groups).map(([g, list]) => list.length > 0 && (
            <div key={g || 'all'}>
              {g && <div className="nav-section">{g}</div>}
              {list.map((n) => (
                <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {({ isActive }) => (<>
                    {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                    <n.icon className="ico" />{n.label}
                    {n.badge && badges[n.badge] > 0 && <span className="count">{badges[n.badge]}</span>}
                  </>)}
                </NavLink>
              ))}
            </div>
          ))}
          {user.role !== 'family' && <>
            <div className="nav-section">Demo</div>
            <NavLink to="/demo" className={({ isActive }) => (isActive ? 'active' : '')}>{({ isActive }) => (<>{isActive && <motion.span layoutId="nav-pill" className="nav-pill" />}<PlayCircle className="ico" />Demo Scenarios</>)}</NavLink>
          </>}
        </nav>
        <div className="sidebar-foot">
          <div className="row" style={{ gap: 8 }}><Radio size={14} color={live === 'live' ? 'var(--good)' : 'var(--warn)'} /><b style={{ color: 'var(--ink)' }}>{live === 'live' ? 'Real-time connected' : live === 'idle' ? 'Real-time idle' : 'Reconnecting…'}</b></div>
          <div className="xs muted" style={{ marginTop: 4 }}>Events stream from the Guardian API.</div>
        </div>
      </aside>
      {open && <div className="scrim mobile-only" style={{ zIndex: 25 }} onClick={() => setOpen(false)} />}
      <div className="main">
        <motion.div key={`bar-${loc.pathname}`} aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 60, transformOrigin: 'left', background: 'linear-gradient(90deg,#9b82ff,#6d4cf6,#4f6bff)', boxShadow: '0 0 12px rgba(109,76,246,.7)' }}
          initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: 1, opacity: [1, 1, 0] }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], opacity: { times: [0, 0.7, 1], duration: 0.9 } }} />
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={18} /></button>
          <div className="page-ident">
            <div className="pi-icon"><meta.icon size={22} /></div>
            <div style={{ minWidth: 0 }}><h1>{meta.label}</h1><p>{meta.sub}</p></div>
          </div>
          <div className="spacer" />
          <div id="topbar-actions" className="page-actions" />
          {user.role !== 'family' && <GlobalSearch />}
          <NotificationBell count={badges.notifications} />
          <UserMenu />
        </header>
        <motion.main key={loc.pathname.split('/')[1]} className="content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease }}>
            <DemoBanner />
            <Outlet />
        </motion.main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [hl, setHl] = useState(0);
  const ref = useRef();
  useEffect(() => {
    const f = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(async () => {
      const [tx, cs] = await Promise.all([api(`/transactions${qs({ q, pageSize: 6 })}`), api('/customers')]).catch(() => [{ items: [] }, []]);
      const pages = [...NAV, ...EXTRA].filter((n) => n.label.toLowerCase().includes(q.toLowerCase())).slice(0, 3);
      setRes({ tx: tx.items, cs: cs.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 4), pages });
      setHl(0);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  const flat = useMemo(() => res ? [...res.pages.map((p) => ({ k: `p${p.to}`, go: p.to, node: <><p.icon size={16} color="var(--brand)" /><span className="bold">{p.label}</span><span className="muted small" style={{ marginLeft: 'auto' }}>Page</span></> })),
    ...res.cs.map((c) => ({ k: `c${c.id}`, go: `/customers/${c.id}`, node: <><span className="avatar sm">{initials(c.name)}</span><span className="bold">{c.name}</span><span className="muted small" style={{ marginLeft: 'auto' }}>{c.home_city}</span></> })),
    ...res.tx.map((t) => ({ k: t.id, go: `/intelligence/${t.id}`, node: <><Score v={t.risk_score} level={t.risk_level} /><span><span className="bold">{t.id}</span><span className="muted small"> · {t.customer} → {t.recipient}</span></span><span className="small bold" style={{ marginLeft: 'auto' }}>{inr(t.amount)}</span></> }))] : [], [res]);
  const go = (i) => { const it = flat[i]; if (it) { nav(it.go); setQ(''); setRes(null); ref.current?.blur(); } };
  return (
    <div className="gsearch">
      <Search className="ico" />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions, customers, pages…" aria-label="Global search"
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, flat.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); } if (e.key === 'Enter') go(hl); if (e.key === 'Escape') { setQ(''); setRes(null); } }}
        onBlur={() => setTimeout(() => setRes(null), 150)} />
      {!q && <kbd>⌘K</kbd>}
      <AnimatePresence>
        {res && (
          <motion.div className="search-pop" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {flat.length === 0 ? <div className="muted small" style={{ padding: 12 }}>No matches for “{q}”.</div> :
              flat.map((it, i) => <button key={it.k} className={i === hl ? 'hl' : ''} onMouseDown={() => go(i)}>{it.node}</button>)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationBell({ count }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const { data } = useApi(open ? '/notifications?pageSize=6' : null, { skip: !open, live: ['notification'] });
  return (
    <div style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications (${count} unread)`}>
        <Bell size={18} />{count > 0 && <span className="dot">{count > 99 ? '99+' : count}</span>}
      </button>
      <AnimatePresence>
        {open && <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <motion.div className="menu" style={{ width: 360 }} initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}>
            <div className="label">Latest notifications</div>
            {!data ? <div style={{ padding: 10 }}><div className="skel" style={{ height: 40 }} /></div> : data.items.length === 0 ? <div className="muted small" style={{ padding: 10 }}>You're all caught up.</div> :
              data.items.map((n) => (
                <button key={n.id} className="mi" onClick={() => { setOpen(false); nav(`/notifications?id=${n.id}`); }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, flex: 'none', background: n.read_at ? 'transparent' : 'var(--brand)' }} />
                  <span style={{ minWidth: 0 }}><span className="ellipsis bold" style={{ display: 'block' }}>{n.title}</span><span className="xs muted">{n.channel} · {ago(n.created_at)}</span></span>
                </button>))}
            <hr /><button className="mi bold" style={{ color: 'var(--brand)' }} onClick={() => { setOpen(false); nav('/notifications'); }}>Open notification centre →</button>
          </motion.div>
        </>}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { user, logout, login } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState(null);
  useEffect(() => { if (open && !accounts) api('/auth/demo-accounts').then(setAccounts).catch(() => setAccounts({ accounts: [] })); }, [open, accounts]);
  const roleLabel = { analyst: 'Security Analyst', admin: 'Administrator', family: 'Trusted Family' }[user.role];
  return (
    <div style={{ position: 'relative' }}>
      <button className="user-chip" onClick={() => setOpen((o) => !o)} aria-haspopup="menu">
        <span className={`avatar ${user.role}`}>{initials(user.name)}</span>
        <span><div className="n">{user.name}</div><div className="r">{user.title || roleLabel}</div></span>
        <ChevronDown size={16} color="var(--ink-3)" />
      </button>
      <AnimatePresence>
        {open && <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <motion.div className="menu" role="menu" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}>
            <div style={{ padding: '8px 10px' }}><div className="bold">{user.name}</div><div className="xs muted">{user.email}</div>
              <span className="badge b-brand" style={{ marginTop: 8 }}><ShieldIcon size={12} />{roleLabel}</span></div>
            <hr />
            <button className="mi" onClick={() => { setOpen(false); nav('/settings'); }}><Settings size={16} />Profile & settings</button>
            {accounts?.accounts?.length > 0 && accounts.password && <>
              <hr /><div className="label">Switch demo account</div>
              {accounts.accounts.filter((a) => a.email !== user.email).map((a) => (
                <button key={a.email} className="mi" onClick={async () => { setOpen(false); const u = await login(a.email, accounts.password); nav(u.role === 'family' ? '/approvals' : '/overview'); }}>
                  <Repeat size={15} /><span><span className="bold">{a.name}</span><span className="xs muted" style={{ display: 'block' }}>{a.title}</span></span>
                </button>))}
            </>}
            <hr />
            <button className="mi" style={{ color: 'var(--bad-ink)' }} onClick={() => { logout(); nav('/login'); }}><LogOut size={16} />Sign out</button>
          </motion.div>
        </>}
      </AnimatePresence>
    </div>
  );
}

function DemoBanner() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [hidden, setHidden] = useState(false);
  let run = null;
  try { run = JSON.parse(localStorage.getItem('guardian.demoRun') || 'null'); } catch {}
  if (hidden || !run || loc.pathname.startsWith('/demo')) return null;
  const back = async () => {
    const acc = await api('/auth/demo-accounts').catch(() => null);
    if (user.email !== run.returnEmail && acc?.password) await login(run.returnEmail, acc.password);
    nav(`/demo?s=${run.scenario}&run=${run.id}`);
  };
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="notice" style={{ marginBottom: 18, alignItems: 'center' }}>
      <PlayCircle />
      <div style={{ flex: 1 }}><b>Demo scenario {run.scenario} in progress</b> ({run.id}). {user.email !== run.returnEmail ? `You're signed in as ${user.name} to make the decision.` : ''}</div>
      <button className="btn sm primary" onClick={back}>Return to demo</button>
      <button className="btn sm ghost" onClick={() => { try { localStorage.removeItem('guardian.demoRun'); } catch {} setHidden(true); }}>Dismiss</button>
    </motion.div>
  );
}
