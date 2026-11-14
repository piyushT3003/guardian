import { useState } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { AnimatedNumber, ease } from './ui.jsx';

export const C = { c1: '#7a5af8', c2: '#0e9384', c3: '#2e90fa', c4: '#dc6803', good: '#12b76a', warn: '#f79009', bad: '#f04438', grid: '#efedf6', axis: '#a9a5c0' };
const axis = { stroke: 'none', tick: { fill: C.axis, fontSize: 11 }, tickLine: false };

export function Tip({ active, payload, label, labelFormat = (l) => l, valueFormat = (v) => v?.toLocaleString('en-IN') }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="tt">{labelFormat(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
          <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.color || p.fill, marginRight: 6 }} />{p.name}</span>
          <b className="tabular">{valueFormat(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

/** Area trend with gradient, crosshair tooltip. */
export function AreaTrend({ data, x = 't', series, height = 240, xFormat, yFormat, labelFormat }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`ga-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.32} /><stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>))}
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey={x} {...axis} tickFormatter={xFormat} minTickGap={24} />
        <YAxis {...axis} tickFormatter={yFormat} allowDecimals={false} />
        <Tooltip content={<Tip labelFormat={labelFormat || xFormat} />} cursor={{ stroke: '#c9bdfb', strokeWidth: 1.5, strokeDasharray: '4 4' }} />
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.2} fill={`url(#ga-${s.key})`}
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} dot={false} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, x, y, height = 220, color = C.c1, colors, layout = 'horizontal', valueFormat, name = 'Count' }) {
  const vertical = layout === 'vertical';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, left: vertical ? 8 : -14, bottom: 0 }} barCategoryGap={vertical ? 6 : '22%'}>
        <CartesianGrid vertical={vertical} horizontal={!vertical} stroke={C.grid} />
        {vertical ? <><XAxis type="number" {...axis} allowDecimals={false} /><YAxis type="category" dataKey={x} {...axis} width={120} /></> :
          <><XAxis dataKey={x} {...axis} interval={0} /><YAxis {...axis} allowDecimals={false} /></>}
        <Tooltip content={<Tip valueFormat={valueFormat} />} cursor={{ fill: 'rgba(109,76,246,.06)' }} />
        <Bar dataKey={y} name={name} fill={color} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={vertical ? 18 : 34} animationDuration={900}>
          {colors && data.map((d, i) => <Cell key={i} fill={colors[i] || color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut with 2px gaps between segments, animated draw, hover focus, centre total. */
export function Donut({ segments, size = 170, stroke = 18, centerLabel = 'Total' }) {
  const [hover, setHover] = useState(null);
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - stroke) / 2, Cc = 2 * Math.PI * r, gap = 4;
  let acc = 0;
  const shown = hover != null ? segments[hover] : null;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#f2f0f8" strokeWidth={stroke} fill="none" />
        {segments.map((s, i) => {
          const len = Math.max(0, (s.value / total) * Cc - gap);
          const off = acc; acc += (s.value / total) * Cc;
          return (
            <motion.circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={hover === i ? stroke + 4 : stroke} strokeLinecap="butt"
              strokeDasharray={`${len} ${Cc}`} initial={{ strokeDashoffset: Cc }} animate={{ strokeDashoffset: -off }} transition={{ duration: 1.1, ease, delay: i * 0.12 }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer', transition: 'stroke-width .2s' }} />
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}><AnimatedNumber value={shown ? shown.value : total} /></div>
          <div className="xs muted" style={{ fontWeight: 600 }}>{shown ? shown.label : centerLabel}</div>
        </div>
      </div>
    </div>
  );
}

export function LegendList({ items, total }) {
  return (
    <div className="stack" style={{ gap: 10, flex: 1, minWidth: 0 }}>
      {items.map((s) => (
        <div key={s.label} className="row" style={{ justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} /><span className="small">{s.label}</span></span>
          <span className="small bold tabular">{total ? ((s.value / total) * 100).toFixed(1) : 0}% <span className="muted" style={{ fontWeight: 500 }}>({s.value.toLocaleString('en-IN')})</span></span>
        </div>
      ))}
    </div>
  );
}
