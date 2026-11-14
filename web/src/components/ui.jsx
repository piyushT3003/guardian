import { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, animate } from 'framer-motion';
import { AlertTriangle, Inbox, X, CheckCircle2, Info, XCircle, Database } from 'lucide-react';
import { STATUS, riskColor } from '../lib/format.js';
import { useReducedMotion } from '../lib/hooks.js';

export const ease = [0.22, 1, 0.36, 1];
export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } } };
export const rise = { hidden: { opacity: 0.35, y: 22, scale: 0.985 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.65, ease } } };

/** Card with optional 3D perspective tilt, dynamic glare and spring hover elevation. */
export function Card({ children, className = '', tilt = false, glass = false, as = 'div', onClick, style, variants = rise, ...rest }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 220, damping: 18 }), sry = useSpring(ry, { stiffness: 220, damping: 18 });
  const lift = useSpring(0, { stiffness: 260, damping: 20 });
  const shadow = useTransform(lift, [0, 1], ['0 1px 2px rgba(23,19,46,.04), 0 8px 24px -6px rgba(76,52,180,.10)', '0 2px 4px rgba(23,19,46,.04), 0 28px 50px -14px rgba(76,52,180,.28)']);
  const y = useTransform(lift, [0, 1], [0, -4]);
  const on = tilt && !reduced;
  const move = (e) => {
    if (!on) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 9); rx.set(-(py - 0.5) * 9);
    ref.current.style.setProperty('--gx', `${px * 100}%`); ref.current.style.setProperty('--gy', `${py * 100}%`);
  };
  const M = motion[as] || motion.div;
  return (
    <M ref={ref} variants={variants} initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -40px 0px' }} className={`card ${glass ? 'glass' : ''} ${on ? 'tilt' : ''} ${className}`} onClick={onClick}
      onMouseMove={move} onMouseEnter={() => on && lift.set(1)} onMouseLeave={() => { rx.set(0); ry.set(0); lift.set(0); }}
      style={on ? { rotateX: srx, rotateY: sry, y, boxShadow: shadow, transformPerspective: 900, ...style } : style} {...rest}>
      {children}
      {on && <span className="glare" />}
    </M>
  );
}

export function CardHead({ title, sub, right, icon: Icon }) {
  return (
    <div className="card-h">
      {Icon && <Icon size={18} color="var(--brand)" />}
      <h3>{title}</h3>{sub && <span className="sub">{sub}</span>}
      {right && <div className="right">{right}</div>}
    </div>
  );
}

export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), duration = 1.1 }) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? value : 0);
  const prev = useRef(reduced ? value : 0);
  useEffect(() => {
    if (value == null) return;
    if (reduced) { setV(value); return; }
    const c = animate(prev.current, value, { duration, ease, onUpdate: setV });
    prev.current = value;
    return () => c.stop();
  }, [value, reduced, duration]);
  return <span className="tabular">{value == null ? '—' : format(v)}</span>;
}

export function Kpi({ icon: Icon, tone = 'brand', value, label, delta, deltaGoodWhenUp = true, format, onClick }) {
  const up = delta > 0;
  const good = delta == null ? null : (up === deltaGoodWhenUp);
  return (
    <Card tilt className="kpi" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className={`k-ico tone-${tone}`}><Icon /></div>
      <div style={{ minWidth: 0 }}>
        <div className="k-v"><AnimatedNumber value={value} format={format} /></div>
        <div className="k-l">{label}</div>
        {delta != null && <div className={`k-d ${good ? 'up' : 'down'}`}>{up ? '↑' : '↓'} {Math.abs(delta)}% <span className="muted" style={{ fontWeight: 500 }}>vs prior 7d</span></div>}
      </div>
    </Card>
  );
}

export const Status = ({ s }) => { const [l, c] = STATUS[s] || [s, 'b-muted']; return <span className={`badge ${c}`}><span className="bd" />{l}</span>; };
export const Score = ({ v, level }) => <span className={`score ${level}`}>{v ?? '—'}</span>;
export const RiskLevel = ({ level }) => <span className={`badge ${level === 'high' ? 'b-bad' : level === 'medium' ? 'b-warn' : 'b-good'}`}><span className="bd" />{level ? level[0].toUpperCase() + level.slice(1) : '—'}</span>;
export const Source = ({ s }) => <span className={`src ${s === 'seed' ? 'historical' : s}`}>{s === 'live_gps' ? '● Live GPS' : s === 'demo' ? 'Demo location' : 'Historical'}</span>;
export const DataTag = ({ children = 'Database records' }) => <span className="data-tag"><Database size={11} />{children}</span>;

/** Animated circular risk gauge. */
export function RiskRing({ score = 0, size = 150, stroke = 12, label = 'Risk score', level }) {
  const id = useId().replace(/:/g, '');
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const lv = level || (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low');
  const colors = { high: ['#ff8a7a', '#e2342a'], medium: ['#ffc46b', '#e07b00'], low: ['#4ee39a', '#0e9f5e'] }[lv];
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 10px 18px ${riskColor(lv)}44)` }}>
        <defs><linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={colors[0]} /><stop offset="1" stopColor={colors[1]} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#f0eef7" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#g${id})`} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - score / 100) }} transition={{ duration: 1.4, ease }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div><div style={{ fontSize: size * 0.27, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}><AnimatedNumber value={score} /></div>
          <div className="xs muted" style={{ fontWeight: 600, marginTop: 4 }}>{label}</div></div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  const id = useId();
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}{t.count != null && <span className="badge b-muted" style={{ height: 20, marginLeft: 6, fontSize: 11 }}>{t.count}</span>}
          {value === t.id && <motion.span layoutId={`tab-${id}`} className="tab-line" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
        </button>
      ))}
    </div>
  );
}

export function Seg({ options, value, onChange }) {
  const id = useId();
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Switch = ({ on, onChange, disabled, label }) => <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;

export function Button({ pending, children, className = '', ...p }) {
  return <button className={`btn ${className}`} disabled={pending || p.disabled} {...p}>{pending ? <span className="spin" /> : null}{children}</button>;
}

export function Drawer({ open, onClose, title, children, width }) {
  useEffect(() => { if (!open) return; const f = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && <>
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
        <motion.aside className="drawer" style={width ? { width } : undefined} role="dialog" aria-modal="true" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 34 }}>
          <div className="drawer-h"><div style={{ flex: 1, minWidth: 0 }}>{title}</div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
          <div className="drawer-b">{children}</div>
        </motion.aside>
      </>}
    </AnimatePresence>, document.body);
}

export function Modal({ open, onClose, children, width }) {
  useEffect(() => { if (!open) return; const f = (e) => e.key === 'Escape' && onClose?.(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && <>
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
        <div className="modal-wrap" onClick={onClose}>
          <motion.div className="modal" style={width ? { width } : undefined} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, rotateX: 12, y: 30, scale: 0.96 }} animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }} exit={{ opacity: 0, rotateX: -8, y: 20, scale: 0.97 }} transition={{ type: 'spring', stiffness: 280, damping: 26 }}>
            {children}
          </motion.div>
        </div>
      </>}
    </AnimatePresence>, document.body);
}

export function Empty({ icon: Icon = Inbox, title = 'Nothing here yet', children }) {
  return <div className="empty"><div className="e-ico"><Icon size={24} /></div><h4>{title}</h4>{children && <div className="small" style={{ maxWidth: 380 }}>{children}</div>}</div>;
}
export const ErrorBox = ({ error, onRetry }) => error ? (
  <div className="error-box"><AlertTriangle size={18} /><span style={{ flex: 1 }}>{error.message}</span>{onRetry && <button className="btn sm" onClick={() => onRetry()}>Retry</button>}</div>
) : null;

export function Loading({ rows = 4, height = 18 }) {
  return <div className="stack" style={{ gap: 12 }} aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ height, width: `${92 - (i % 3) * 14}%` }} />)}</div>;
}
export function PageLoading() {
  return (
    <div className="grid g-3" style={{ marginTop: 6 }}>
      {[0, 1, 2].map((i) => <div key={i} className="card"><Loading rows={5} /></div>)}
    </div>
  );
}

export function ToastStack({ items }) {
  const icons = { good: [CheckCircle2, 'tone-good'], bad: [XCircle, 'tone-bad'], info: [Info, 'tone-info'], warn: [AlertTriangle, 'tone-warn'] };
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => { const [I, c] = icons[t.tone] || icons.info; return (
          <motion.div key={t.id} className="toast" layout initial={{ opacity: 0, x: 40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}>
            <div className={`ti ${c}`}><I size={16} /></div>
            <div><div className="bold">{t.title}</div>{t.body && <div className="muted small">{t.body}</div>}</div>
          </motion.div>); })}
      </AnimatePresence>
    </div>
  );
}

/** Portal slot in the top bar for contextual page actions. */
export function TopbarActions({ children }) {
  const [el, setEl] = useState(null);
  useEffect(() => setEl(document.getElementById('topbar-actions')), []);
  return el ? createPortal(children, el) : null;
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const list = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) list.push(p); else if (list[list.length - 1] !== '…') list.push('…');
  return (
    <div className="pager">
      <span className="muted small">Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(total, page * pageSize)} of {total.toLocaleString('en-IN')}</span>
      <div className="pages">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        {list.map((p, i) => p === '…' ? <span key={`e${i}`} className="muted" style={{ alignSelf: 'center', padding: '0 4px' }}>…</span> :
          <button key={p} className={p === page ? 'on' : ''} onClick={() => onPage(p)}>{p}</button>)}
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      </div>
    </div>
  );
}

export function Notice({ icon: I = Info, children }) { return <div className="notice"><I />{<div>{children}</div>}</div>; }
