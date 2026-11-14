// Guardian database schema (shared by the Node server and the in-browser build).
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, title TEXT,
  role TEXT NOT NULL CHECK (role IN ('analyst','admin','family')),
  password_hash TEXT NOT NULL, customer_id INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, segment TEXT,
  home_city TEXT, home_lat REAL, home_lng REAL,
  baseline_amount REAL NOT NULL, baseline_sigma REAL NOT NULL,
  active_hours TEXT, family_protection INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS family_members (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id),
  user_id INTEGER REFERENCES users(id), name TEXT NOT NULL, relation TEXT, phone TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, category TEXT, vpa TEXT, first_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, seq INTEGER UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id), recipient_id INTEGER NOT NULL REFERENCES recipients(id),
  amount REAL NOT NULL CHECK (amount > 0), currency TEXT NOT NULL DEFAULT 'INR', channel TEXT NOT NULL DEFAULT 'UPI',
  lat REAL, lng REAL, city TEXT, region TEXT, accuracy_m REAL, location_source TEXT NOT NULL,
  status TEXT NOT NULL, risk_score INTEGER, risk_level TEXT, signals TEXT, explanation TEXT, recommended_action TEXT,
  scenario TEXT, scenario_run TEXT, created_at INTEGER NOT NULL, analysed_at INTEGER, completed_at INTEGER,
  updated_at INTEGER NOT NULL, payment_ref TEXT, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_tx_customer ON transactions(customer_id, created_at);
CREATE INDEX IF NOT EXISTS ix_tx_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS ix_tx_status ON transactions(status);
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY, transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id),
  customer_id INTEGER NOT NULL, family_member_id INTEGER NOT NULL REFERENCES family_members(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','HELD','EXPIRED')),
  created_at INTEGER NOT NULL, deadline INTEGER NOT NULL, decided_at INTEGER, decided_by INTEGER, note TEXT
);
CREATE TABLE IF NOT EXISTS recoveries (
  id INTEGER PRIMARY KEY, transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id),
  status TEXT NOT NULL CHECK (status IN ('OPEN','INITIATED','RECOVERED','DECLINED','EXPIRED','FAILED')),
  reason TEXT, opened_at INTEGER NOT NULL, deadline INTEGER NOT NULL,
  decided_at INTEGER, decided_by INTEGER, completed_at INTEGER, reversal_ref TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS investigations (
  id INTEGER PRIMARY KEY, transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id),
  status TEXT NOT NULL CHECK (status IN ('OPEN','IN_PROGRESS','ESCALATED','CONFIRMED_FRAUD','CLEARED')),
  priority TEXT NOT NULL, assignee_id INTEGER, decision TEXT, opened_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS analyst_notes (
  id INTEGER PRIMARY KEY, investigation_id INTEGER NOT NULL REFERENCES investigations(id),
  author_id INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, channel TEXT NOT NULL CHECK (channel IN ('security','family','recovery','system')),
  severity TEXT NOT NULL, title TEXT NOT NULL, body TEXT, transaction_id TEXT,
  recipient_role TEXT, recipient_user_id INTEGER, action TEXT, read_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notif ON notifications(created_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, actor_role TEXT,
  action TEXT NOT NULL, category TEXT NOT NULL, entity_type TEXT, entity_id TEXT,
  prev_state TEXT, next_state TEXT, details TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit_log(at);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER, updated_by INTEGER );
CREATE TABLE IF NOT EXISTS system_events (
  id INTEGER PRIMARY KEY, at INTEGER NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT NOT NULL, user_id INTEGER NOT NULL, route TEXT NOT NULL, status INTEGER, response TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_id, route)
);
CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY, url TEXT NOT NULL, events TEXT NOT NULL, secret TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY, webhook_id INTEGER NOT NULL, event TEXT NOT NULL, status_code INTEGER, ok INTEGER NOT NULL, error TEXT, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS demo_runs (
  id TEXT PRIMARY KEY, scenario INTEGER NOT NULL, customer_id INTEGER NOT NULL, focus_tx TEXT, started_by INTEGER, started_at INTEGER NOT NULL, step TEXT
);
`;
