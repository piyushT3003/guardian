// One-shot celebratory particle burst (canvas) for confirmed outcomes such as recovered funds.
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/hooks.js';

const COLORS = ['#7a5af8', '#4f6bff', '#12b76a', '#b9a7ff', '#32d583', '#ffffff'];

export default function Burst({ fire, origin = [0.5, 0.45], count = 90 }) {
  const ref = useRef();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!fire || reduced) return;
    const c = ref.current, ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.offsetWidth, h = c.offsetHeight;
    c.width = w * dpr; c.height = h * dpr; ctx.scale(dpr, dpr);
    const ox = w * origin[0], oy = h * origin[1];
    const parts = Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4, sp = 3 + Math.random() * 6;
      return { x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, r: 2 + Math.random() * 3.5, c: COLORS[i % COLORS.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, shape: i % 3 };
    });
    let raf, t = 0;
    const tick = () => {
      t++;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.16; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t / 90); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        if (p.shape === 0) { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-p.r, -p.r / 2.5, p.r * 2, p.r / 1.25);
        ctx.restore();
      }
      if (t < 95) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, w, h);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [fire]); // eslint-disable-line
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }} />;
}
