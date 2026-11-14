// In-browser replacement for server/src/lib/events.js: delivers events to in-page EventSource stand-ins.
const sources = new Set();
let lastEventAt = null;
export function addClient() {}
export function subscribe(src) { sources.add(src); return () => sources.delete(src); }
export function emit(type, payload = {}) {
  lastEventAt = Date.now();
  const data = JSON.stringify({ type, at: lastEventAt, ...payload });
  for (const s of sources) setTimeout(() => s._dispatch(type, data), 0);
}
export const streamStats = () => ({ clients: sources.size, lastEventAt });
