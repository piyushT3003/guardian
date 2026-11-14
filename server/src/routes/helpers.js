import { one, all, run, HttpError } from '../db.js';

export const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res); if (r !== undefined) res.json(r); } catch (e) { next(e); } };

/** Idempotency: replays the stored response for a repeated Idempotency-Key on the same route+user. */
export const idempotent = (fn) => (req, res, next) => {
  const key = req.headers['idempotency-key'];
  const route = `${req.method} ${req.baseUrl}${req.route.path}:${JSON.stringify(req.params)}`;
  if (key) {
    const prev = one('SELECT * FROM idempotency WHERE key=? AND user_id=? AND route=?', key, req.user.id, route);
    if (prev) return res.status(prev.status).set('Idempotent-Replay', 'true').json(JSON.parse(prev.response));
  }
  try {
    const body = fn(req, res);
    if (key) run('INSERT OR IGNORE INTO idempotency(key,user_id,route,status,response,created_at) VALUES (?,?,?,?,?,?)', key, req.user.id, route, 200, JSON.stringify(body), Date.now());
    res.json(body);
  } catch (e) { next(e); }
};

export const TX_SELECT = `SELECT t.*, c.name AS customer, c.home_city AS customer_home, rc.name AS recipient, rc.category AS recipient_category
  FROM transactions t JOIN customers c ON c.id = t.customer_id JOIN recipients rc ON rc.id = t.recipient_id`;

export function txView(t) {
  if (!t) return t;
  const s = t.signals ? JSON.parse(t.signals) : null;
  return { ...t, signals: s?.signals || [], analysis: s?.context || null };
}

export function scopeCustomer(user) {
  return user.role === 'family' ? user.customer_id : null;
}
export function assertCanSeeCustomer(user, customerId) {
  if (user.role === 'family' && user.customer_id !== customerId) throw new HttpError(403, 'Not permitted to view this customer', 'FORBIDDEN');
}
export const num = (v, d) => (v === undefined || v === '' || v === null || isNaN(Number(v)) ? d : Number(v));
