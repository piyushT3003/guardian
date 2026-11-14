// Guardian — database layer (SQLite via node:sqlite). The database is the source of truth.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './schema.js';

const DB_PATH = process.env.GUARDIAN_DB || path.resolve(process.cwd(), 'data/guardian.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

db.exec(SCHEMA);

/** Run fn inside an IMMEDIATE transaction (serialises writers → no lost updates). Re-entrant. */
let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try { const r = fn(); depth--; db.exec('COMMIT'); return r; }
  catch (e) { depth--; try { db.exec('ROLLBACK'); } catch {} throw e; }
}

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export const DB_FILE = DB_PATH;
