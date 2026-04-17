import type { Database } from "bun:sqlite";

/**
 * Idempotent schema bootstrap run on every sidecar start. Creates real
 * tables, FTS5 virtual tables, sync triggers, and vec0 virtual tables.
 *
 * All DDL is `IF NOT EXISTS` so repeated invocation is safe.
 *
 * Vector dimension is 1536 (matches OpenAI text-embedding-3-small default).
 */

export const VEC_DIM = 1536;

const DDL = [
  // === Real tables (these match the Drizzle schema) ===
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     kind TEXT NOT NULL,
     content TEXT NOT NULL,
     summary TEXT,
     tags TEXT,
     importance INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind)`,

  `CREATE TABLE IF NOT EXISTS facts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     kind TEXT NOT NULL,
     subject TEXT,
     content TEXT NOT NULL,
     source TEXT,
     confidence REAL NOT NULL DEFAULT 1.0,
     last_confirmed TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS todos (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     text TEXT NOT NULL,
     done INTEGER NOT NULL DEFAULT 0,
     due_at TEXT,
     priority INTEGER NOT NULL DEFAULT 0,
     project TEXT,
     goal_id INTEGER,
     milestone_id INTEGER,
     completed_at TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     title TEXT,
     body TEXT NOT NULL,
     tags TEXT,
     vault_path TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS conversations (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     ended_at TEXT,
     mode TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     conversation_id INTEGER REFERENCES conversations(id),
     ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     role TEXT NOT NULL,
     content TEXT NOT NULL,
     tool_call TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,

  // === FTS5 virtual tables (external content, synced via triggers) ===
  `CREATE VIRTUAL TABLE IF NOT EXISTS fact_fts USING fts5(
     content, subject,
     content='facts', content_rowid='id'
   )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
     title, body, tags,
     content='notes', content_rowid='id'
   )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS event_fts USING fts5(
     summary, content, tags,
     content='events', content_rowid='id'
   )`,

  // === Triggers keeping FTS indexes in sync ===
  `CREATE TRIGGER IF NOT EXISTS fact_ai AFTER INSERT ON facts BEGIN
     INSERT INTO fact_fts(rowid, content, subject) VALUES (new.id, new.content, coalesce(new.subject, ''));
   END`,
  `CREATE TRIGGER IF NOT EXISTS fact_ad AFTER DELETE ON facts BEGIN
     INSERT INTO fact_fts(fact_fts, rowid, content, subject) VALUES('delete', old.id, old.content, coalesce(old.subject, ''));
   END`,
  `CREATE TRIGGER IF NOT EXISTS fact_au AFTER UPDATE ON facts BEGIN
     INSERT INTO fact_fts(fact_fts, rowid, content, subject) VALUES('delete', old.id, old.content, coalesce(old.subject, ''));
     INSERT INTO fact_fts(rowid, content, subject) VALUES (new.id, new.content, coalesce(new.subject, ''));
   END`,

  `CREATE TRIGGER IF NOT EXISTS note_ai AFTER INSERT ON notes BEGIN
     INSERT INTO note_fts(rowid, title, body, tags) VALUES (new.id, coalesce(new.title, ''), new.body, coalesce(new.tags, ''));
   END`,
  `CREATE TRIGGER IF NOT EXISTS note_ad AFTER DELETE ON notes BEGIN
     INSERT INTO note_fts(note_fts, rowid, title, body, tags) VALUES('delete', old.id, coalesce(old.title, ''), old.body, coalesce(old.tags, ''));
   END`,
  `CREATE TRIGGER IF NOT EXISTS note_au AFTER UPDATE ON notes BEGIN
     INSERT INTO note_fts(note_fts, rowid, title, body, tags) VALUES('delete', old.id, coalesce(old.title, ''), old.body, coalesce(old.tags, ''));
     INSERT INTO note_fts(rowid, title, body, tags) VALUES (new.id, coalesce(new.title, ''), new.body, coalesce(new.tags, ''));
   END`,

  `CREATE TRIGGER IF NOT EXISTS event_ai AFTER INSERT ON events BEGIN
     INSERT INTO event_fts(rowid, summary, content, tags) VALUES (new.id, coalesce(new.summary, ''), new.content, coalesce(new.tags, ''));
   END`,
  `CREATE TRIGGER IF NOT EXISTS event_ad AFTER DELETE ON events BEGIN
     INSERT INTO event_fts(event_fts, rowid, summary, content, tags) VALUES('delete', old.id, coalesce(old.summary, ''), old.content, coalesce(old.tags, ''));
   END`,
];

/**
 * Vec virtual tables — created separately because vec0 requires the
 * sqlite-vec extension to be loaded first.
 */
const VEC_DDL = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS fact_vec USING vec0(
     fact_id INTEGER PRIMARY KEY,
     embedding FLOAT[${VEC_DIM}]
   )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS note_vec USING vec0(
     note_id INTEGER PRIMARY KEY,
     embedding FLOAT[${VEC_DIM}]
   )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS event_vec USING vec0(
     event_id INTEGER PRIMARY KEY,
     embedding FLOAT[${VEC_DIM}]
   )`,
];

export function migrate(db: Database, hasVec: boolean): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  for (const stmt of DDL) {
    db.exec(stmt);
  }
  if (hasVec) {
    for (const stmt of VEC_DDL) {
      db.exec(stmt);
    }
  }
}
