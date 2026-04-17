import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { files } from "../db/schema.js";
import { embedText, embeddingsAvailable, vecBlob } from "../ai/embeddings.js";

/**
 * Local file index over user-configured roots (e.g. ~/Documents, ~/code).
 * Same pattern as vault indexer but spans any source tree.
 *
 * PDF ingestion is not included here because bundling pdf-parse into a
 * Bun-compiled binary has native-dep issues; it can land in a follow-up.
 */

const INCLUDED_EXT = new Set([
  ".md",
  ".txt",
  ".py",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".go",
  ".rs",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".java",
  ".kt",
  ".swift",
  ".rb",
  ".ex",
  ".html",
  ".css",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
]);
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "__pycache__",
  ".venv",
  ".next",
  ".turbo",
]);

const DEFAULT_LIMIT = 80;

export async function indexFiles(
  db: Db,
  root: string,
  limit = DEFAULT_LIMIT,
): Promise<{ indexed: number; skipped: number; total: number }> {
  const found = await walkSources(root);
  let indexed = 0;
  let skipped = 0;
  for (const absPath of found) {
    if (indexed >= limit) {
      skipped = found.length - indexed;
      break;
    }
    try {
      const indexedOne = await indexOne(db, root, absPath);
      if (indexedOne) indexed++;
    } catch (e) {
      console.error(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "passio.log",
          params: {
            level: "warn",
            message: `file index error ${absPath}: ${(e as Error).message}`,
          },
        }),
      );
    }
  }
  return { indexed, skipped, total: found.length };
}

async function indexOne(db: Db, root: string, absPath: string): Promise<boolean> {
  const relPath = relative(root, absPath);
  const st = await stat(absPath);
  const mtime = st.mtime.toISOString();
  const [existing] = await db
    .select({ id: files.id, mtime: files.mtime })
    .from(files)
    .where(eq(files.path, absPath));
  if (existing && existing.mtime === mtime) return false;

  const raw = await readFile(absPath, "utf8").catch(() => "");
  const hash = createHash("sha1").update(raw).digest("hex");
  const summary = raw.slice(0, 2000);

  const row = {
    path: absPath,
    ext: extname(absPath).toLowerCase(),
    bytes: st.size,
    mtime,
    contentHash: hash,
    summary: summary.length ? `${relPath}\n${summary}` : relPath,
    indexedAt: new Date().toISOString(),
  };

  let id: number;
  if (existing) {
    await db.update(files).set(row).where(eq(files.id, existing.id));
    id = existing.id;
  } else {
    const [inserted] = await db.insert(files).values(row).returning({ id: files.id });
    if (!inserted) return false;
    id = inserted.id;
  }

  if (db.$hasVec && embeddingsAvailable()) {
    try {
      const vec = await embedText(summary.slice(0, 8000));
      db.$raw
        .query("INSERT OR REPLACE INTO file_vec(file_id, embedding) VALUES(?, ?)")
        .run(id, vecBlob(vec));
    } catch {
      /* best-effort */
    }
  }
  return true;
}

async function walkSources(root: string): Promise<string[]> {
  const out: string[] = [];
  const absRoot = resolve(root);
  async function go(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const abs = resolve(dir, entry.name);
      if (entry.isDirectory()) await go(abs);
      else if (entry.isFile() && INCLUDED_EXT.has(extname(entry.name).toLowerCase())) {
        out.push(abs);
      }
    }
  }
  await go(absRoot);
  return out;
}

export function fileSearch(
  db: Db,
  input: { query: string; limit?: number },
): { hits: Array<{ path: string; snippet: string; score: number }> } {
  const terms = input.query.split(/\s+/).filter(Boolean).map((t) => `${t}*`).join(" OR ");
  if (!terms) return { hits: [] };
  const rows = db.$raw
    .query(
      `SELECT f.path AS path,
              snippet(file_fts, 0, '<em>', '</em>', '…', 12) AS snippet,
              bm25(file_fts) AS score
       FROM file_fts
       JOIN files f ON f.id = file_fts.rowid
       WHERE file_fts MATCH ?
       ORDER BY score
       LIMIT ?`,
    )
    .all(terms, input.limit ?? 10) as { path: string; snippet: string; score: number }[];
  return { hits: rows };
}
