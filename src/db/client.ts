import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const DB_PATH = process.env.DATABASE_FILE || 'database.db';

export const db = new Database(DB_PATH);

// WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    category   TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    state       TEXT NOT NULL DEFAULT 'idle',
    flow        TEXT,
    context     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cron_jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    schedule     TEXT NOT NULL,
    enabled      INTEGER DEFAULT 1,
    last_run_at  DATETIME,
    last_status  TEXT,
    last_output  TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tools_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_name   TEXT NOT NULL,
    input       TEXT,
    output      TEXT,
    duration_ms INTEGER,
    session_id  TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    product_name    TEXT NOT NULL,
    product_url     TEXT,
    estimated_price TEXT,
    actual_price    TEXT,
    store           TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        TEXT,
    service_type      TEXT NOT NULL,
    provider_name     TEXT NOT NULL,
    provider_phone    TEXT,
    provider_address  TEXT,
    scheduled_at      TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'scheduled',
    notes             TEXT,
    reminder_24h_sent INTEGER NOT NULL DEFAULT 0,
    reminder_1h_sent  INTEGER NOT NULL DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  CREATE INDEX IF NOT EXISTS idx_tools_log_tool ON tools_log(tool_name);
  CREATE INDEX IF NOT EXISTS idx_purchases_session ON purchases(session_id);
  CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
  CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
`);

export default db;
