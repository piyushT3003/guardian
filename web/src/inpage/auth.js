// In-browser replacement for server/src/lib/auth.js. Same exports; tokens live in memory for this tab.
import { one, HttpError } from './db.js';
import { randomBytes, hashHex } from './crypto.js';

const tokens = new Map();
const TTL = 12 * 3600e3;

export function hashPassword(pw) { const salt = randomBytes(8).toString('hex'); return `${salt}:${hashHex(salt + pw)}`; }
export function verifyPassword(pw, stored) { const [salt, h] = stored.split(':'); return hashHex(salt + pw) === h; }
export function signToken(user) { const t = randomBytes(24).toString('hex'); tokens.set(t, { sub: user.id, role: user.role, exp: Date.now() + TTL }); return t; }
export function verifyToken(t) { const p = tokens.get(t); return p && p.exp > Date.now() ? p : null; }
export const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, title: u.title, role: u.role, customer_id: u.customer_id });

export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const payload = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : req.query.token);
  if (!payload) return next(new HttpError(401, 'Authentication required', 'UNAUTHENTICATED'));
  const user = one('SELECT * FROM users WHERE id = ?', payload.sub);
  if (!user) return next(new HttpError(401, 'Unknown user', 'UNAUTHENTICATED'));
  req.user = user;
  next();
}
export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, `This action requires role: ${roles.join(' or ')}`, 'FORBIDDEN'));
