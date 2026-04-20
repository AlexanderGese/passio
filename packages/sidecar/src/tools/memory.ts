import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { facts, notes, todos } from "../db/schema.js";
import { embedText, embeddingsAvailable, vecBlob } from "../ai/embeddings.js";
import { retrieve, type Hit } from "../context/retrieve.js";

/**
 * Tool implementations. These are the surface area the AI agent (and
 * explicit user commands) call. Every write also maintains the vector
 * index where appropriate.
 */

// ---- Facts ----

export async function memoryRemember(
  db: Db,
  input: { kind?: string; subject?: string; content: string; source?: string },
): Promise<{ id: number }> {
  const [row] = await db
    .insert(facts)
    .values({
      kind: input.kind ?? "context",
      subject: input.subject ?? null,
      content: input.content,
      source: input.source ?? "user_told",
    })
    .returning({ id: facts.id });
  if (!row) throw new Error("insert returned no row");
  await indexFactEmbedding(db, row.id, input.content);
  return { id: row.id };
}

export async function memoryForget(db: Db, input: { id: number }): Promise<{ ok: true }> {
  await db.delete(facts).where(eq(facts.id, input.id));
  if (db.$hasVec) {
    db.$raw.query("DELETE FROM fact_vec WHERE fact_id = ?").run(input.id);
  }
  return { ok: true };
}

export async function memorySearch(
  db: Db,
  input: { query: string; limit?: number },
): Promise<{ hits: Hit[] }> {
  const hits = await retrieve(db, input.query, input.limit ?? 10);
  return { hits };
}

// ---- Todos ----

export async function todoAdd(
  db: Db,
  input: { text: string; due_at?: string; priority?: number; project?: string },
): Promise<{ id: number }> {
  const [row] = await db
    .insert(todos)
    .values({
      text: input.text,
      dueAt: input.due_at ?? null,
      priority: input.priority ?? 0,
      project: input.project ?? null,
    })
    .returning({ id: todos.id });
  if (!row) throw new Error("insert returned no row");
  return { id: row.id };
}

export async function todoList(
  db: Db,
  input: { filter?: "open" | "done" | "all" },
): Promise<{ todos: (typeof todos.$inferSelect)[] }> {
  const filter = input.filter ?? "open";
  const query = db.select().from(todos);
  const base =
    filter === "all"
      ? query
      : query.where(eq(todos.done, filter === "done"));
  const rows = await base.orderBy(desc(todos.priority), desc(todos.createdAt));
  return { todos: rows };
}

export async function todoDone(db: Db, input: { id: number }): Promise<{ ok: true }> {
  await db
    .update(todos)
    .set({ done: true, completedAt: new Date().toISOString() })
    .where(eq(todos.id, input.id));
  return { ok: true };
}

// ---- Notes ----

export async function noteSave(
  db: Db,
  input: { title?: string; body: string; tags?: string },
): Promise<{ id: number; vaultPath?: string }> {
  // Mirror to the Obsidian vault when one is configured. The vault copy is
  // the source of truth the user can edit in Obsidian; the DB row indexes
  // it for fast memory-search.
  let vaultRel: string | null = null;
  try {
    const root = db.$raw
      .query("SELECT value FROM settings WHERE key = 'obsidian_vault_path'")
      .get() as { value: string } | undefined;
    if (root) {
      const { vaultWriteNote } = await import("../vault/tools.js");
      const safeTitle = (input.title ?? `note-${Date.now()}`)
        .replace(/[^\p{L}\p{N}_ -]/gu, "-")
        .trim()
        .slice(0, 80);
      const rel = `passio/${safeTitle || "untitled"}.md`;
      const fm: Record<string, unknown> = { created: new Date().toISOString() };
      if (input.tags) fm.tags = input.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await vaultWriteNote(db, {
        path: rel,
        body: input.body,
        frontmatter: fm,
      });
      vaultRel = res.path;
    }
  } catch {
    /* vault-write is best-effort — never fail note_save because of it */
  }

  const [row] = await db
    .insert(notes)
    .values({
      title: input.title ?? null,
      body: input.body,
      tags: input.tags ?? null,
      vaultPath: vaultRel,
    })
    .returning({ id: notes.id });
  if (!row) throw new Error("insert returned no row");
  await indexNoteEmbedding(db, row.id, `${input.title ?? ""}\n${input.body}`);
  return vaultRel ? { id: row.id, vaultPath: vaultRel } : { id: row.id };
}

export async function noteSearch(
  db: Db,
  input: { query: string; limit?: number },
): Promise<{ hits: Hit[] }> {
  const all = await retrieve(db, input.query, input.limit ?? 10);
  return { hits: all.filter((h) => h.kind === "note") };
}

// ---- Intent ----

export async function setIntent(
  db: Db,
  input: { text: string | null },
): Promise<{ ok: true }> {
  const key = "daily_intent";
  if (input.text === null) {
    db.$raw.query("DELETE FROM settings WHERE key = ?").run(key);
    return { ok: true };
  }
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, JSON.stringify({ text: input.text, set_at: new Date().toISOString() }));
  return { ok: true };
}

export function getIntent(db: Db): { text: string; set_at: string } | null {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'daily_intent'")
    .get() as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

// ---- Vector indexing helpers ----

async function indexFactEmbedding(db: Db, id: number, text: string): Promise<void> {
  if (!db.$hasVec || !embeddingsAvailable()) return;
  try {
    const vec = await embedText(text);
    db.$raw
      .query("INSERT OR REPLACE INTO fact_vec(fact_id, embedding) VALUES(?, ?)")
      .run(id, vecBlob(vec));
  } catch (err) {
    console.error(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "passio.log",
        params: {
          level: "warn",
          message: `fact embedding index failed (id=${id}): ${(err as Error).message}`,
        },
      }),
    );
  }
}

async function indexNoteEmbedding(db: Db, id: number, text: string): Promise<void> {
  if (!db.$hasVec || !embeddingsAvailable()) return;
  try {
    const vec = await embedText(text);
    db.$raw
      .query("INSERT OR REPLACE INTO note_vec(note_id, embedding) VALUES(?, ?)")
      .run(id, vecBlob(vec));
  } catch (err) {
    console.error(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "passio.log",
        params: {
          level: "warn",
          message: `note embedding index failed (id=${id}): ${(err as Error).message}`,
        },
      }),
    );
  }
}

// `and` imported only so drizzle ESM tree-shaking keeps the helper warm.
void and;
