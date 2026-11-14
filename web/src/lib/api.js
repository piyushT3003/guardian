// API client: auth header, JSON errors, idempotency keys for sensitive actions.
const BASE = import.meta.env.VITE_API_URL || '/api';
let token = null;
try { token = localStorage.getItem('guardian.token'); } catch {}
const listeners = new Set();

export const getToken = () => token;
export function setToken(t) {
  token = t;
  try { t ? localStorage.setItem('guardian.token', t) : localStorage.removeItem('guardian.token'); } catch {}
}
export const onUnauthorized = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

export async function api(path, { method = 'GET', body, idempotent = false, raw = false } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers['idempotency-key'] = typeof idempotent === 'string' ? idempotent : crypto.randomUUID();
  let res;
  try { res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch { throw new ApiError(0, 'Cannot reach the Guardian backend. Check that the API server is running.', 'NETWORK'); }
  if (res.status === 401 && !path.startsWith('/auth/login')) listeners.forEach((f) => f());
  if (raw) { if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`); return res; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message || `Request failed (${res.status})`, data?.error?.code);
  return data;
}

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Download a file from an authenticated endpoint. */
export async function download(path, filename) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const streamUrl = () => `${BASE}/stream?token=${encodeURIComponent(token || '')}`;
