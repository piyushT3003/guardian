import crypto from 'node:crypto';
import { one, HttpError } from '../db.js';

const SECRET = process.env.GUARDIAN_JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.GUARDIAN_JWT_SECRET) console.warn('[auth] GUARDIAN_JWT_SECRET not set — using an ephemeral secret (tokens reset on restart).');
const TTL = 12 * 3600;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: user.role, iat: now, exp: now + TTL })}`;
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
export function verifyToken(token) {
  const [h, p, s] = String(token || '').split('.');
  if (!h || !p || !s) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (expect.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(s))) return null;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (payload.exp < Date.now() / 1000) return null;
  return payload;
}
export const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, title: u.title, role: u.role, customer_id: u.customer_id });

export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  const payload = verifyToken(token);
  if (!payload) return next(new HttpError(401, 'Authentication required', 'UNAUTHENTICATED'));
  const user = one('SELECT * FROM users WHERE id = ?', payload.sub);
  if (!user) return next(new HttpError(401, 'Unknown user', 'UNAUTHENTICATED'));
  req.user = user;
  next();
}
export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, `This action requires role: ${roles.join(' or ')}`, 'FORBIDDEN'));
