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

  `CREATE TABLE IF NOT EXISTS workflows (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE,
     trigger TEXT,
     steps TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     last_used TEXT,
     use_count INTEGER NOT NULL DEFAULT 0
   )`,

  // === Goals ===
  `CREATE TABLE IF NOT EXISTS goals (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     title TEXT NOT NULL,
     description TEXT,
     category TEXT,
     target_date TEXT,
     status TEXT NOT NULL DEFAULT 'active',
     priority INTEGER NOT NULL DEFAULT 1,
     progress REAL NOT NULL DEFAULT 0,
     motivation TEXT,
     last_reviewed TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)`,

  `CREATE TABLE IF NOT EXISTS milestones (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     description TEXT,
     due_date TEXT,
     status TEXT NOT NULL DEFAULT 'pending',
     sort_order INTEGER NOT NULL DEFAULT 0,
     completed_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_milestones_goal ON milestones(goal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_milestones_due ON milestones(due_date)`,

  `CREATE TABLE IF NOT EXISTS goal_reviews (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
     ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     kind TEXT NOT NULL,
     summary TEXT NOT NULL,
     progress_delta REAL,
     blockers TEXT,
     next_actions TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_goal_reviews_goal ON goal_reviews(goal_id)`,

  // === Obsidian vault mirror ===
  `CREATE TABLE IF NOT EXISTS vault_notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     path TEXT NOT NULL UNIQUE,
     title TEXT,
     body TEXT NOT NULL,
     frontmatter TEXT,
     tags TEXT,
     wiki_links TEXT,
     mtime TEXT,
     indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_vault_mtime ON vault_notes(mtime)`,

  `CREATE VIRTUAL TABLE IF NOT EXISTS vault_fts USING fts5(
     title, body, tags, path,
     content='vault_notes', content_rowid='id'
   )`,
  `CREATE TRIGGER IF NOT EXISTS vault_ai AFTER INSERT ON vault_notes BEGIN
     INSERT INTO vault_fts(rowid, title, body, tags, path) VALUES (new.id, coalesce(new.title, ''), new.body, coalesce(new.tags, ''), new.path);
   END`,
  `CREATE TRIGGER IF NOT EXISTS vault_ad AFTER DELETE ON vault_notes BEGIN
     INSERT INTO vault_fts(vault_fts, rowid, title, body, tags, path) VALUES('delete', old.id, coalesce(old.title, ''), old.body, coalesce(old.tags, ''), old.path);
   END`,
  `CREATE TRIGGER IF NOT EXISTS vault_au AFTER UPDATE ON vault_notes BEGIN
     INSERT INTO vault_fts(vault_fts, rowid, title, body, tags, path) VALUES('delete', old.id, coalesce(old.title, ''), old.body, coalesce(old.tags, ''), old.path);
     INSERT INTO vault_fts(rowid, title, body, tags, path) VALUES (new.id, coalesce(new.title, ''), new.body, coalesce(new.tags, ''), new.path);
   END`,

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

  // === Message FTS ===
  `CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
     content,
     content='messages', content_rowid='id'
   )`,
  `CREATE TRIGGER IF NOT EXISTS message_ai AFTER INSERT ON messages BEGIN
     INSERT INTO message_fts(rowid, content) VALUES (new.id, new.content);
   END`,
  `CREATE TRIGGER IF NOT EXISTS message_ad AFTER DELETE ON messages BEGIN
     INSERT INTO message_fts(message_fts, rowid, content) VALUES('delete', old.id, old.content);
   END`,
  `CREATE TRIGGER IF NOT EXISTS message_au AFTER UPDATE ON messages BEGIN
     INSERT INTO message_fts(message_fts, rowid, content) VALUES('delete', old.id, old.content);
     INSERT INTO message_fts(rowid, content) VALUES (new.id, new.content);
   END`,

  // === Analytics ===
  `CREATE TABLE IF NOT EXISTS habits (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT UNIQUE NOT NULL,
     target_per_week INTEGER DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE IF NOT EXISTS habit_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
     ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_habit_log_habit ON habit_log(habit_id)`,
  `CREATE INDEX IF NOT EXISTS idx_habit_log_ts ON habit_log(ts)`,
  `CREATE TABLE IF NOT EXISTS journal_entries (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     prompt TEXT,
     body TEXT NOT NULL,
     mood INTEGER,
     energy INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS time_blocks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     start_at TEXT NOT NULL,
     end_at TEXT,
     kind TEXT NOT NULL,
     label TEXT,
     goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL
   )`,
  `CREATE TABLE IF NOT EXISTS activity_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     app TEXT,
     window_title TEXT,
     duration_seconds INTEGER,
     classification TEXT
   )`,

  // === Knowledge graph ===
  `CREATE TABLE IF NOT EXISTS entities (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL,
     name TEXT NOT NULL,
     canonical_id TEXT,
     data TEXT,
     UNIQUE(kind, name)
   )`,
  `CREATE TABLE IF NOT EXISTS edges (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     src_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
     dst_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
     relation TEXT NOT NULL,
     weight REAL NOT NULL DEFAULT 1,
     source_ref TEXT,
     ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src_id)`,
  `CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst_id)`,
  `CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation)`,

  // === Local file index ===
  `CREATE TABLE IF NOT EXISTS files (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     path TEXT UNIQUE NOT NULL,
     ext TEXT,
     bytes INTEGER,
     mtime TEXT,
     content_hash TEXT,
     summary TEXT,
     indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime)`,
  `CREATE INDEX IF NOT EXISTS idx_files_ext ON files(ext)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
     summary, path,
     content='files', content_rowid='id'
   )`,
  `CREATE TRIGGER IF NOT EXISTS file_ai AFTER INSERT ON files BEGIN
     INSERT INTO file_fts(rowid, summary, path) VALUES (new.id, coalesce(new.summary, ''), new.path);
   END`,
  `CREATE TRIGGER IF NOT EXISTS file_ad AFTER DELETE ON files BEGIN
     INSERT INTO file_fts(file_fts, rowid, summary, path) VALUES('delete', old.id, coalesce(old.summary, ''), old.path);
   END`,
  `CREATE TRIGGER IF NOT EXISTS file_au AFTER UPDATE ON files BEGIN
     INSERT INTO file_fts(file_fts, rowid, summary, path) VALUES('delete', old.id, coalesce(old.summary, ''), old.path);
     INSERT INTO file_fts(rowid, summary, path) VALUES (new.id, coalesce(new.summary, ''), new.path);
   END`,

  // === Flashcards (SM-2) ===
  `CREATE TABLE IF NOT EXISTS cards (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     deck TEXT NOT NULL DEFAULT 'default',
     front TEXT NOT NULL,
     back TEXT NOT NULL,
     ef REAL NOT NULL DEFAULT 2.5,
     interval_days INTEGER NOT NULL DEFAULT 0,
     repetitions INTEGER NOT NULL DEFAULT 0,
     due_at TEXT,
     source_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due_at)`,
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
  `CREATE VIRTUAL TABLE IF NOT EXISTS vault_vec USING vec0(
     vault_id INTEGER PRIMARY KEY,
     embedding FLOAT[${VEC_DIM}]
   )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS file_vec USING vec0(
     file_id INTEGER PRIMARY KEY,
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
