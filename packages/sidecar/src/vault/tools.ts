import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { settings, vaultNotes } from "../db/schema.js";
import { indexFile } from "./indexer.js";

/**
 * Tool-layer operations against the user's Obsidian vault. Key invariants:
 *
 *   • Read is permitted anywhere inside the configured vault root.
 *   • Write defaults to the `passio/` subfolder. A write outside that
 *     subfolder requires `allow_outside_passio_subfolder: true` (the
 *     agent must obtain explicit user consent before setting this).
 *   • Daily-note recap appends under a `## Passio recap` heading, only in
 *     the note for today, creating the file if missing.
 */

const PASSIO_SUBDIR = "passio";
const DAILY_DIR = "daily";

/**
 * Resolves the daily-note path for a given date. Honours the user-configured
 * `vault_daily_note_template` (set via Settings → Vault) so people who use
 * Obsidian with different daily-note conventions (e.g. `Journal/YYYY/MM/DD.md`,
 * `Daily/YYYY-MM-DD.md`, etc.) get their own layout respected.
 *
 * Supported template tokens: `YYYY`, `MM`, `DD`, `YYYY-MM-DD`.
 */
export function resolveDailyNotePath(db: Db, date: string): string {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'vault_daily_note_template'")
    .get() as { value: string } | undefined;
  let template = `${DAILY_DIR}/YYYY-MM-DD.md`;
  if (row) {
    try {
      template = JSON.parse(row.value) as string;
    } catch {
      /* fall back to default */
    }
  }
  const [y, m, d] = date.split("-");
  return template
    .replaceAll("YYYY-MM-DD", date)
    .replaceAll("YYYY", y ?? "")
    .replaceAll("MM", m ?? "")
    .replaceAll("DD", d ?? "");
}

export async function getVaultRoot(db: Db): Promise<string | null> {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'obsidian_vault_path'")
    .get() as { value: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as { path?: string };
    return parsed.path ?? null;
  } catch {
    return null;
  }
}

export async function setVaultRoot(
  db: Db,
  input: { path: string | null },
): Promise<{ ok: true }> {
  if (input.path === null) {
    db.$raw.query("DELETE FROM settings WHERE key = 'obsidian_vault_path'").run();
    return { ok: true };
  }
  const abs = resolve(input.path);
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run("obsidian_vault_path", JSON.stringify({ path: abs }));
  return { ok: true };
  void settings;
}

export async function vaultSearch(
  db: Db,
  input: { query: string; limit?: number },
): Promise<{
  hits: { path: string; title: string | null; snippet: string; score: number }[];
}> {
  const terms = input.query.split(/\s+/).filter(Boolean).map((t) => `${t}*`).join(" OR ");
  if (!terms) return { hits: [] };
  const rows = db.$raw
    .query(
      `SELECT v.path AS path, v.title AS title, snippet(vault_fts, 1, '<em>', '</em>', '…', 12) AS snippet, bm25(vault_fts) AS score
       FROM vault_fts
       JOIN vault_notes v ON v.id = vault_fts.rowid
       WHERE vault_fts MATCH ?
       ORDER BY score
       LIMIT ?`,
    )
    .all(terms, input.limit ?? 10) as {
    path: string;
    title: string | null;
    snippet: string;
    score: number;
  }[];
  return { hits: rows };
}

export async function vaultReadNote(
  db: Db,
  input: { path: string },
): Promise<{ path: string; title: string | null; body: string } | null> {
  const root = await getVaultRoot(db);
  if (!root) throw new Error("obsidian_vault_path is not configured");
  const safe = ensureWithinVault(root, input.path);
  try {
    const body = await readFile(safe, "utf8");
    const [row] = await db
      .select({ title: vaultNotes.title })
      .from(vaultNotes)
      .where(eq(vaultNotes.path, input.path));
    return { path: input.path, title: row?.title ?? null, body };
  } catch {
    return null;
  }
}

export async function vaultWriteNote(
  db: Db,
  input: {
    path: string; // vault-relative; should start with `passio/` unless overridden
    body: string;
    frontmatter?: Record<string, unknown>;
    allow_outside_passio_subfolder?: boolean;
  },
): Promise<{ path: string }> {
  const root = await getVaultRoot(db);
  if (!root) throw new Error("obsidian_vault_path is not configured");
  const normalized = normalize(input.path).replace(/^\/+|^\\+/, "");
  if (!input.allow_outside_passio_subfolder) {
    const head = normalized.split(sep)[0];
    if (head !== PASSIO_SUBDIR) {
      throw new Error(
        `writes default to \`${PASSIO_SUBDIR}/\` subfolder; set allow_outside_passio_subfolder:true for a path outside it`,
      );
    }
  }
  const abs = ensureWithinVault(root, normalized);
  const finalBody = input.frontmatter
    ? buildFrontmatter(input.frontmatter) + input.body
    : input.body;
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, finalBody, "utf8");
  await indexFile(db, root, abs);
  return { path: normalized };
}

export async function vaultListTags(db: Db): Promise<{ tags: { tag: string; count: number }[] }> {
  const rows = db.$raw
    .query("SELECT tags FROM vault_notes WHERE tags IS NOT NULL AND tags != ''")
    .all() as { tags: string }[];
  const counts = new Map<string, number>();
  for (const { tags } of rows) {
    for (const t of tags.split(",").map((s) => s.trim()).filter(Boolean)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return {
    tags: [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function dailyNoteAppendRecap(
  db: Db,
  input: { body: string; date?: string }, // YYYY-MM-DD, default today
): Promise<{ path: string }> {
  const root = await getVaultRoot(db);
  if (!root) throw new Error("obsidian_vault_path is not configured");
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const rel = resolveDailyNotePath(db, date);
  const abs = ensureWithinVault(root, rel);
  const heading = `\n## Passio recap\n`;
  let existing = "";
  try {
    existing = await readFile(abs, "utf8");
  } catch {
    existing = `# ${date}\n`;
  }
  let updated: string;
  if (existing.includes("## Passio recap")) {
    updated = existing.replace(
      /## Passio recap[\s\S]*?(?=\n##\s|$)/,
      `## Passio recap\n${input.body.trim()}\n`,
    );
  } else {
    updated = existing.replace(/\s+$/, "") + heading + input.body.trim() + "\n";
  }
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, updated, "utf8");
  await indexFile(db, root, abs);
  return { path: rel };
}

// ---- Helpers ----

function ensureWithinVault(root: string, relPath: string): string {
  const absRoot = resolve(root);
  const absPath = resolve(absRoot, relPath);
  const rel = relative(absRoot, absPath);
  if (rel.startsWith("..") || resolve(absRoot, rel) !== absPath) {
    throw new Error(`path escapes vault: ${relPath}`);
  }
  return absPath;
}

function buildFrontmatter(fm: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => JSON.stringify(String(x))).join(", ")}]`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}
