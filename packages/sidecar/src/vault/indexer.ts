import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { vaultNotes } from "../db/schema.js";
import { embedText, embeddingsAvailable, vecBlob } from "../ai/embeddings.js";
import { parseMarkdown } from "./parser.js";

/**
 * Vault indexer. Walks the configured vault root, diffs mtime vs DB, and
 * re-indexes changed / new files. Embeddings happen lazily per file; if
 * no API key or vec extension, rows still land in FTS5.
 *
 * Throttled to LIMIT files per sidecar spawn so initial indexing of a
 * large vault doesn't dominate cold-start cost.
 */

const DEFAULT_LIMIT = 50;

const SKIP_DIRS = new Set([".git", ".obsidian", "node_modules", ".trash", "build", "dist"]);

export async function indexVault(
  db: Db,
  root: string,
  limit = DEFAULT_LIMIT,
): Promise<{ indexed: number; skipped: number; total_md: number }> {
  const files = await walkMarkdown(root);
  let indexed = 0;
  let skipped = 0;

  for (const absPath of files) {
    if (indexed >= limit) {
      skipped = files.length - indexed;
      break;
    }
    const path = relative(root, absPath);
    const st = await stat(absPath);
    const mtime = st.mtime.toISOString();

    const [existing] = await db
      .select({ id: vaultNotes.id, mtime: vaultNotes.mtime })
      .from(vaultNotes)
      .where(eq(vaultNotes.path, path));

    if (existing && existing.mtime === mtime) continue;

    const raw = await readFile(absPath, "utf8");
    const parsed = parseMarkdown(path, raw);

    const row = {
      path,
      title: parsed.title,
      body: parsed.body,
      frontmatter: JSON.stringify(parsed.frontmatter),
      tags: parsed.tags.join(","),
      wikiLinks: JSON.stringify(parsed.wikiLinks),
      mtime,
      indexedAt: new Date().toISOString(),
    };

    let id: number;
    if (existing) {
      await db.update(vaultNotes).set(row).where(eq(vaultNotes.id, existing.id));
      id = existing.id;
    } else {
      const [inserted] = await db.insert(vaultNotes).values(row).returning({ id: vaultNotes.id });
      if (!inserted) continue;
      id = inserted.id;
    }

    if (db.$hasVec && embeddingsAvailable()) {
      try {
        const text = `${parsed.title ?? ""}\n${parsed.body}`.slice(0, 8000);
        const vec = await embedText(text);
        db.$raw
          .query("INSERT OR REPLACE INTO vault_vec(vault_id, embedding) VALUES(?, ?)")
          .run(id, vecBlob(vec));
      } catch (err) {
        console.error(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "passio.log",
            params: {
              level: "warn",
              message: `vault embedding failed for ${path}: ${(err as Error).message}`,
            },
          }),
        );
      }
    }

    indexed++;
  }

  return { indexed, skipped, total_md: files.length };
}

/** Incrementally re-index a single file (used by the chokidar watcher). */
export async function indexFile(db: Db, vaultRoot: string, absPath: string): Promise<void> {
  await indexVaultInternal(db, vaultRoot, [absPath]);
}

export async function removeFromIndex(db: Db, vaultRoot: string, absPath: string): Promise<void> {
  const path = relative(vaultRoot, absPath);
  const [existing] = await db
    .select({ id: vaultNotes.id })
    .from(vaultNotes)
    .where(eq(vaultNotes.path, path));
  if (!existing) return;
  await db.delete(vaultNotes).where(eq(vaultNotes.id, existing.id));
  if (db.$hasVec) {
    db.$raw.query("DELETE FROM vault_vec WHERE vault_id = ?").run(existing.id);
  }
}

async function walkMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  async function go(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && !entry.name.startsWith(".obsidian")) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await go(abs);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push(abs);
      }
    }
  }
  await go(root);
  return out;
}

// Tiny helper so indexVault + indexFile share code; keeps imports lean.
async function indexVaultInternal(db: Db, root: string, files: string[]) {
  for (const absPath of files) {
    const path = relative(root, absPath);
    try {
      const st = await stat(absPath);
      const raw = await readFile(absPath, "utf8");
      const parsed = parseMarkdown(path, raw);
      const row = {
        path,
        title: parsed.title,
        body: parsed.body,
        frontmatter: JSON.stringify(parsed.frontmatter),
        tags: parsed.tags.join(","),
        wikiLinks: JSON.stringify(parsed.wikiLinks),
        mtime: st.mtime.toISOString(),
        indexedAt: new Date().toISOString(),
      };
      const [existing] = await db
        .select({ id: vaultNotes.id })
        .from(vaultNotes)
        .where(eq(vaultNotes.path, path));
      if (existing) {
        await db.update(vaultNotes).set(row).where(eq(vaultNotes.id, existing.id));
      } else {
        await db.insert(vaultNotes).values(row);
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "passio.log",
          params: {
            level: "warn",
            message: `index ${absPath} failed: ${(err as Error).message}`,
          },
        }),
      );
    }
  }
}
