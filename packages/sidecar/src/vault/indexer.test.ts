import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/client.js";
import { indexVault, indexFile, removeFromIndex } from "./indexer.js";

function tempDb(tag: string) {
  return openDb(join(tmpdir(), `passio-idx-${tag}-${Date.now()}.sqlite`));
}
function tempVault() {
  return mkdtempSync(join(tmpdir(), "passio-vault-"));
}

describe("vault indexer", () => {
  test("walks nested markdown, skips .obsidian/.git, indexes files", async () => {
    const db = tempDb("walk");
    const vault = tempVault();
    await mkdir(join(vault, "daily"), { recursive: true });
    await mkdir(join(vault, ".obsidian"), { recursive: true });
    await mkdir(join(vault, ".git"), { recursive: true });
    await writeFile(join(vault, "top.md"), "# top\nhello [[nested]]");
    await writeFile(join(vault, "daily", "2026-04-17.md"), "# 2026-04-17\n- entry");
    await writeFile(join(vault, ".obsidian", "workspace.md"), "ignored");
    await writeFile(join(vault, ".git", "HEAD.md"), "ignored");

    const { indexed, total_md } = await indexVault(db, vault);
    expect(indexed).toBe(2);
    expect(total_md).toBe(2);

    const rows = db.$raw
      .query("SELECT path, title FROM vault_notes ORDER BY path")
      .all() as { path: string; title: string }[];
    expect(rows.map((r) => r.path).sort()).toEqual(["daily/2026-04-17.md", "top.md"]);
    db.$raw.close();
  });

  test("re-index updates body when mtime changes", async () => {
    const db = tempDb("update");
    const vault = tempVault();
    const file = join(vault, "note.md");
    await writeFile(file, "v1");
    await indexVault(db, vault);
    await writeFile(file, "v2-updated body");
    await indexFile(db, vault, file);
    const row = db.$raw.query("SELECT body FROM vault_notes").get() as { body: string };
    expect(row.body).toBe("v2-updated body");
    db.$raw.close();
  });

  test("removeFromIndex drops row + FTS entry", async () => {
    const db = tempDb("remove");
    const vault = tempVault();
    const file = join(vault, "tmp.md");
    await writeFile(file, "# tmp\nhello world");
    await indexVault(db, vault);
    await removeFromIndex(db, vault, file);
    const rows = db.$raw.query("SELECT 1 FROM vault_notes WHERE path = ?").all("tmp.md");
    expect(rows).toHaveLength(0);
    const fts = db.$raw
      .query("SELECT 1 FROM vault_fts WHERE vault_fts MATCH 'hello'")
      .all();
    expect(fts).toHaveLength(0);
    db.$raw.close();
  });

  test("respects throttle limit on large vaults", async () => {
    const db = tempDb("throttle");
    const vault = tempVault();
    for (let i = 0; i < 60; i++) {
      await writeFile(join(vault, `n${i}.md`), `# n${i}`);
    }
    const res = await indexVault(db, vault, 10);
    expect(res.indexed).toBe(10);
    expect(res.skipped).toBe(50);
    db.$raw.close();
  });
});
