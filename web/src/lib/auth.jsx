import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken, onUnauthorized } from './api.js';
import { connectLive, disconnectLive } from './hooks.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api('/auth/me').then((u) => { setUser(u); connectLive(); }).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);
  useEffect(() => onUnauthorized(() => { setToken(null); disconnectLive(); setUser(null); }), []);
  const login = useCallback(async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    disconnectLive();
    setToken(r.token); setUser(r.user); connectLive();
    return r.user;
  }, []);
  const logout = useCallback(() => { setToken(null); disconnectLive(); setUser(null); }, []);
  return <AuthCtx.Provider value={{ user, setUser, ready, login, logout }}>{children}</AuthCtx.Provider>;
}

/* ---------- toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children, render }) {
  const [items, setItems] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, tone: 'good', ...t }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.ms || 4200);
  }, []);
  return <ToastCtx.Provider value={push}>{children}{render(items)}</ToastCtx.Provider>;
}
