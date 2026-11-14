// Ambient depth behind every page, plus a single pointer listener that lets surfaces track the light.
import { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useReducedMotion } from '../lib/hooks.js';

export default function Backdrop() {
  const reduced = useReducedMotion();
  const px = useMotionValue(0), py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 40, damping: 20 }), sy = useSpring(py, { stiffness: 40, damping: 20 });
  const x1 = useTransform(sx, (v) => v * 40), y1 = useTransform(sy, (v) => v * 30);
  const x2 = useTransform(sx, (v) => v * -28), y2 = useTransform(sy, (v) => v * -22);
  useEffect(() => {
    let raf = 0, last = null;
    const onMove = (e) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const ev = last;
        if (!reduced) { px.set(ev.clientX / window.innerWidth - 0.5); py.set(ev.clientY / window.innerHeight - 0.5); }
        const el = ev.target instanceof Element ? ev.target.closest('.card, .hero-strip') : null;
        if (el) {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--mx', `${ev.clientX - r.left}px`);
          el.style.setProperty('--my', `${ev.clientY - r.top}px`);
        }
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, [reduced, px, py]);
  return (
    <div className="backdrop" aria-hidden="true">
      <motion.div style={{ x: x1, y: y1, position: 'absolute', inset: 0 }}><div className="orb o1" /><div className="orb o3" /></motion.div>
      <motion.div style={{ x: x2, y: y2, position: 'absolute', inset: 0 }}><div className="orb o2" /></motion.div>
      <div className="grid" />
      <div className="grain" />
    </div>
  );
}
