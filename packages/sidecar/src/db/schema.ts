import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * v1 schema for the Context Engine. Vector virtual tables and FTS5 virtual
 * tables are created via raw SQL in `migrations.ts` (Drizzle does not model
 * virtual tables). Application code always goes through these typed helpers
 * for CRUD on the real tables.
 */

const now = sql`CURRENT_TIMESTAMP`;

// === Events (episodic memory) ===
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull().default(now),
  kind: text("kind").notNull(), // scan|chat|action|voice|clipboard|screenshot|page_visit
  content: text("content").notNull(), // JSON payload
  summary: text("summary"),
  tags: text("tags"),
  importance: integer("importance").notNull().default(0),
});

// === Facts (semantic memory) ===
export const facts = sqliteTable("facts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull().default(now),
  kind: text("kind").notNull(), // preference|identity|context|relationship|skill
  subject: text("subject"),
  content: text("content").notNull(),
  source: text("source"), // user_told|inferred|observed|vault|file
  confidence: real("confidence").notNull().default(1.0),
  lastConfirmed: text("last_confirmed"),
});

// === Todos ===
export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull().default(now),
  text: text("text").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  dueAt: text("due_at"),
  priority: integer("priority").notNull().default(0),
  project: text("project"),
  goalId: integer("goal_id"),
  milestoneId: integer("milestone_id"),
  completedAt: text("completed_at"),
});

// === Notes ===
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull().default(now),
  title: text("title"),
  body: text("body").notNull(),
  tags: text("tags"),
  vaultPath: text("vault_path"),
});

// === Conversations & messages ===
export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull().default(now),
  endedAt: text("ended_at"),
  mode: text("mode"), // text|voice|proactive
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").references(() => conversations.id),
  ts: text("ts").notNull().default(now),
  role: text("role").notNull(), // user|assistant|tool
  content: text("content").notNull(),
  toolCall: text("tool_call"),
});

// === Settings (key/value) ===
export const settings = sqliteTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
  },
  (t) => ({
    keyIdx: uniqueIndex("settings_key_idx").on(t.key),
  }),
);
