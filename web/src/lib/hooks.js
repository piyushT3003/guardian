import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, streamUrl, getToken } from './api.js';

/* ---------- live event bus (SSE) ---------- */
const subs = new Set();
let es = null, status = 'idle';
const statusSubs = new Set();
const setStatus = (s) => { status = s; statusSubs.forEach((f) => f()); };
export function connectLive() {
  if (es || !getToken()) return;
  es = new EventSource(streamUrl());
  setStatus('connecting');
  es.addEventListener('hello', () => setStatus('live'));
  for (const type of ['transaction', 'notification', 'audit', 'investigation']) {
    es.addEventListener(type, (e) => { const d = JSON.parse(e.data); subs.forEach((f) => f(d)); });
  }
  es.onerror = () => setStatus('reconnecting');
  es.onopen = () => setStatus('live');
}
export function disconnectLive() { es?.close(); es = null; setStatus('idle'); }
export const useLiveStatus = () => useSyncExternalStore((f) => { statusSubs.add(f); return () => statusSubs.delete(f); }, () => status);

/** Subscribe to live events (debounced). */
export function useLive(types, cb, delay = 350) {
  const ref = useRef(cb); ref.current = cb;
  const key = types.join(',');
  useEffect(() => {
    let t = null;
    const f = (d) => { if (!types.includes(d.type)) return; clearTimeout(t); t = setTimeout(() => ref.current(d), delay); };
    subs.add(f);
    return () => { subs.delete(f); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay]);
}

/** Fetch data, re-fetch on dependency change and on relevant live events. */
export function useApi(path, { live = ['transaction', 'notification'], skip = false } = {}) {
  const [state, set] = useState({ data: null, error: null, loading: !skip });
  const seq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (skip || !path) return;
    const id = ++seq.current;
    if (!quiet) set((s) => ({ ...s, loading: true, error: null }));
    try { const data = await api(path); if (id === seq.current) set({ data, error: null, loading: false }); }
    catch (error) { if (id === seq.current) set((s) => ({ data: quiet ? s.data : null, error, loading: false })); }
  }, [path, skip]);
  useEffect(() => { load(); }, [load]);
  useLive(live, () => load(true));
  return { ...state, reload: load, setData: (fn) => set((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}

/** Server-synchronised clock so countdowns use backend deadlines, not the browser's clock. */
export function useServerNow(serverNow, tickMs = 250) {
  const offset = useRef(0);
  useEffect(() => { if (serverNow) offset.current = serverNow - Date.now(); }, [serverNow]);
  const [now, setNow] = useState(() => Date.now() + offset.current);
  useEffect(() => { const i = setInterval(() => setNow(Date.now() + offset.current), tickMs); return () => clearInterval(i); }, [tickMs]);
  return now;
}

export function useReducedMotion() {
  const q = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [r, setR] = useState(q?.matches ?? false);
  useEffect(() => { if (!q) return; const f = () => setR(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f); }, []);
  return r;
}

/** Async action with pending/error state. */
export function useAction(fn) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (...a) => {
    setPending(true); setError(null);
    try { return await fn(...a); } catch (e) { setError(e); throw e; } finally { setPending(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);
  return { run, pending, error };
}
