import { readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Db } from "../db/client.js";
import { todoAdd } from "./memory.js";
import { eq } from "drizzle-orm";
import { todos } from "../db/schema.js";

/**
 * Two-way sync with a plain-markdown todo file (works with Obsidian / Notion /
 * whatever edits .md). Passio owns a marker block; user owns everything else.
 *
 *   <!-- passio:todos:start -->
 *   - [ ] first open todo
 *   - [x] completed one
 *   <!-- passio:todos:end -->
 *
 * Anything between markers mirrors Passio's DB. Anything outside is the user's
 * free-form zone — we scan it for `- [ ] text` lines and import NEW ones into
 * the DB (prefix dedupe by exact text so repeated syncs don't double up).
 *
 * Default path: ~/.vault/Main/Todo.md (matches user's setup). Configurable
 * via settings row `todo_md_path`.
 */

const START = "<!-- passio:todos:start -->";
const END = "<!-- passio:todos:end -->";

const LEGACY_DEFAULT_PATH = `${process.env.HOME ?? ""}/.vault/Main/Todo.md`;

/**
 * Resolve the todo-markdown file path. Priority:
 *   1. Explicit `todo_md_path` setting
 *   2. `<vault>/Todo.md` when a vault root is configured
 *   3. Legacy hard-coded `~/.vault/Main/Todo.md`
 *
 * This keeps existing users on their path but new installs with Obsidian
 * configured get an inside-vault default automatically.
 */
export function getTodoMdPath(db: Db): string {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'todo_md_path'")
    .get() as { value: string } | undefined;
  if (row) {
    try {
      return JSON.parse(row.value) as string;
    } catch {
      /* fall through */
    }
  }
  const vaultRow = db.$raw
    .query("SELECT value FROM settings WHERE key = 'obsidian_vault_path'")
    .get() as { value: string } | undefined;
  if (vaultRow) {
    try {
      const parsed = JSON.parse(vaultRow.value) as { path?: string };
      if (parsed.path) return `${parsed.path.replace(/\/+$/, "")}/Todo.md`;
    } catch {
      /* fall through */
    }
  }
  return LEGACY_DEFAULT_PATH;
}

export function setTodoMdPath(db: Db, path: string): { ok: true } {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('todo_md_path', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(path));
  return { ok: true };
}

/**
 * Import any `- [ ] text` lines OUTSIDE the Passio block that aren't
 * already in the DB, then rewrite the Passio block with current DB state.
 */
export async function syncTodoMd(db: Db, path?: string): Promise<{
  imported: number;
  mirrored: number;
  path: string;
}> {
  const file = path ?? getTodoMdPath(db);
  mkdirSync(dirname(file), { recursive: true });

  let raw = "";
  if (existsSync(file)) {
    raw = await readFile(file, "utf8");
  }

  const { inside, userBlock } = splitBlock(raw);
  void inside; // owned by Passio, discarded on rewrite
  const imported = await importUserLines(db, userBlock);

  const openTodos = (await db.select().from(todos).where(eq(todos.done, false))) as Array<{
    text: string;
    priority: number;
    dueAt: string | null;
  }>;
  const doneTodos = (await db
    .select()
    .from(todos)
    .where(eq(todos.done, true))) as Array<{ text: string; completedAt: string | null }>;
  const lines: string[] = [];
  lines.push("<!-- Passio keeps this block in sync. Edit freely OUTSIDE it. -->");
  for (const t of openTodos.sort((a, b) => b.priority - a.priority)) {
    const due = t.dueAt ? ` ·due ${t.dueAt}` : "";
    const pri = t.priority > 0 ? ` ·p${t.priority}` : "";
    lines.push(`- [ ] ${t.text}${due}${pri}`);
  }
  for (const t of doneTodos.slice(-20)) {
    lines.push(`- [x] ${t.text}`);
  }

  const block = [START, lines.join("\n"), END].join("\n");
  const rewritten = `${userBlock.trim()}\n\n${block}\n`;
  await writeFile(file, rewritten, "utf8");
  return { imported, mirrored: openTodos.length + doneTodos.length, path: file };
}

function splitBlock(raw: string): { inside: string; userBlock: string } {
  const startIdx = raw.indexOf(START);
  const endIdx = raw.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { inside: "", userBlock: raw };
  }
  const inside = raw.slice(startIdx + START.length, endIdx);
  const before = raw.slice(0, startIdx);
  const after = raw.slice(endIdx + END.length);
  return { inside, userBlock: `${before}${after}` };
}

/**
 * Reconcile user-block checkbox state with the DB:
 *   - `[ ] text` that isn't in DB → import as new open todo
 *   - `[x] text` that IS in DB (open) → mark done in DB
 *   - `[ ] text` that IS in DB (done) → mark re-opened in DB
 *
 * This is how marking a box in Obsidian propagates back to Passio.
 */
async function importUserLines(db: Db, userBlock: string): Promise<number> {
  // Build maps of existing todos by their exact text so we can update state
  // instead of creating duplicates.
  const existing = (await db.select().from(todos)) as Array<{
    id: number;
    text: string;
    done: boolean;
  }>;
  const byText = new Map<string, { id: number; done: boolean }>();
  for (const t of existing) byText.set(t.text, { id: t.id, done: t.done });

  const TODO_RE = /^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/;
  let added = 0;
  for (const line of userBlock.split(/\r?\n/)) {
    const m = TODO_RE.exec(line);
    if (!m) continue;
    const checked = m[1]!.toLowerCase() === "x";
    const text = m[2]!
      .replace(/\s*·due \d{4}-\d{2}-\d{2}/, "")
      .replace(/\s*·p\d+/, "")
      .trim();
    if (!text) continue;

    const hit = byText.get(text);
    if (hit) {
      // State reconciliation — only write if it actually changed to avoid
      // churning the `updated_at` / completed_at columns.
      if (checked && !hit.done) {
        await db
          .update(todos)
          .set({ done: true, completedAt: new Date().toISOString() })
          .where(eq(todos.id, hit.id));
        hit.done = true;
      } else if (!checked && hit.done) {
        await db
          .update(todos)
          .set({ done: false, completedAt: null })
          .where(eq(todos.id, hit.id));
        hit.done = false;
      }
      continue;
    }
    // Brand-new todo — import (keep Passio→Obsidian behaviour: only open
    // items come in; completed lines the user wrote manually stay in the
    // user-block as history).
    if (checked) continue;
    await todoAdd(db, { text });
    byText.set(text, { id: -1, done: false });
    added++;
  }
  return added;
}

/**
 * Build the "here's your day" brief: top 5 priority+due open todos. Used
 * by the 09:00 daily scheduler tick.
 */
export async function todaysTopTodos(db: Db): Promise<{ message: string | null }> {
  const rows = (await db.select().from(todos).where(eq(todos.done, false))) as Array<{
    text: string;
    priority: number;
    dueAt: string | null;
  }>;
  if (rows.length === 0) return { message: null };
  const today = new Date().toISOString().slice(0, 10);
  const sorted = rows
    .map((r) => ({
      ...r,
      score: (r.priority ?? 0) * 10 + (r.dueAt && r.dueAt <= today ? 20 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const lines = sorted.map(
    (t) =>
      `• ${t.text}${t.dueAt ? ` (due ${t.dueAt})` : ""}${t.priority > 0 ? ` [p${t.priority}]` : ""}`,
  );
  return {
    message: `Today's top ${sorted.length}:\n${lines.join("\n")}`,
  };
}
