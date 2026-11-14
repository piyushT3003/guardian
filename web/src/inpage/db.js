// In-browser replacement for server/src/db.js: the same API on SQLite compiled to JavaScript (sql.js).
import initSqlJs from 'sql.js/dist/sql-asm-memory-growth.js';
import { SCHEMA } from '../../../server/src/schema.js';

let sql = null;
const norm = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

function stmtRows(q, params, limit = Infinity) {
  const st = sql.prepare(q);
  try {
    st.bind(norm(params));
    const out = [];
    while (out.length < limit && st.step()) out.push(st.getAsObject());
    return out;
  } finally { st.free(); }
}

export const db = {
  exec: (q) => sql.exec(q),
  prepare: (q) => ({ get: (...p) => stmtRows(q, p, 1)[0], all: (...p) => stmtRows(q, p), run: (...p) => run(q, ...p) }),
};

export async function initDb() {
  const SQL = await initSqlJs();
  sql = new SQL.Database();
  sql.exec('PRAGMA foreign_keys = ON;');
  sql.exec(SCHEMA);
}

let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  sql.exec('BEGIN IMMEDIATE');
  depth++;
  try { const r = fn(); depth--; sql.exec('COMMIT'); return r; }
  catch (e) { depth--; try { sql.exec('ROLLBACK'); } catch {} throw e; }
}

export const one = (q, ...p) => stmtRows(q, p, 1)[0];
export const all = (q, ...p) => stmtRows(q, p);
export function run(q, ...p) {
  sql.run(q, norm(p));
  const changes = sql.getRowsModified();
  const lastInsertRowid = sql.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0;
  return { changes, lastInsertRowid };
}

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export const DB_FILE = 'in-browser/guardian.db';
