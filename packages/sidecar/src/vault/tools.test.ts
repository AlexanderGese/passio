import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/client.js";
import {
  dailyNoteAppendRecap,
  setVaultRoot,
  vaultListTags,
  vaultReadNote,
  vaultSearch,
  vaultWriteNote,
} from "./tools.js";
import { indexVault } from "./indexer.js";

function tempDb(tag: string) {
  return openDb(join(tmpdir(), `passio-vt-${tag}-${Date.now()}.sqlite`));
}
function tempVault() {
  return mkdtempSync(join(tmpdir(), "passio-vault-"));
}

describe("vault tools", () => {
  test("write goes to passio/ subfolder by default", async () => {
    const db = tempDb("writepassio");
    const vault = tempVault();
    await setVaultRoot(db, { path: vault });
    const res = await vaultWriteNote(db, {
      path: "passio/hello.md",
      body: "# hi\ntest",
      frontmatter: { source: "passio", tags: ["t1"] },
    });
    expect(res.path).toBe("passio/hello.md");
    const content = await readFile(join(vault, "passio/hello.md"), "utf8");
    expect(content).toContain("source: \"passio\"");
    expect(content).toContain("# hi");
    db.$raw.close();
  });

  test("write outside passio/ requires explicit opt-in", async () => {
    const db = tempDb("writeout");
    const vault = tempVault();
    await setVaultRoot(db, { path: vault });
    await expect(
      vaultWriteNote(db, { path: "some-user-note.md", body: "hi" }),
    ).rejects.toThrow(/passio\//);
    const ok = await vaultWriteNote(db, {
      path: "some-user-note.md",
      body: "hi",
      allow_outside_passio_subfolder: true,
    });
    expect(ok.path).toBe("some-user-note.md");
    db.$raw.close();
  });

  test("write rejects paths that escape the vault", async () => {
    const db = tempDb("escape");
    const vault = tempVault();
    await setVaultRoot(db, { path: vault });
    await expect(
      vaultWriteNote(db, {
        path: "../outside.md",
        body: "x",
        allow_outside_passio_subfolder: true,
      }),
    ).rejects.toThrow(/escapes vault/);
    db.$raw.close();
  });

  test("search returns FTS hits", async () => {
    const db = tempDb("search");
    const vault = tempVault();
    await setVaultRoot(db, { path: vault });
    await writeFile(join(vault, "a.md"), "# Coffee\nI love espresso in the morning.");
    await writeFile(join(vault, "b.md"), "# Tea\nI like matcha afternoons.");
    await indexVault(db, vault);
    const { hits } = await vaultSearch(db, { query: "espresso" });
    expect(hits[0]?.path).toBe("a.md");
    db.$raw.close();
  });

  test("listTags aggregates across notes", async () => {
    const db = tempDb("tags");
    const vault = tempVault();
    await setVaultRoot(db, { path: vault });
    await writeFile(join(vault, "a.md"), "---\ntags: [work, startup]\n---\n\n#planning");
    await writeFile(join(vault, "b.md"), "#planning");
    await indexVault(db, vault);
    const { tags } = await vaultListTags(db);
    expect(tags.find((t) => t.tag === "planning")?.count).toBe(2);
    expect(tags.find((t) => t.tag === "work")?.count).toBe(1);
    db.$raw.close();
  });

  test("daily note recap appends under heading + idempotent on re-append", async () => {
    const db = tempDb("daily");
    const vault = tempVault();
    await setVaultRoot(db, { path: vault });
    const { path } = await dailyNoteAppendRecap(db, {
      body: "• shipped Week 3 goals\n• ate a passionfruit",
      date: "2026-04-17",
    });
    expect(path).toBe("daily/2026-04-17.md");
    const once = await readFile(join(vault, path), "utf8");
    expect(once).toContain("## Passio recap");
    expect(once).toContain("shipped Week 3");

    await dailyNoteAppendRecap(db, { body: "• NEW recap", date: "2026-04-17" });
    const twice = await readFile(join(vault, path), "utf8");
    expect((twice.match(/## Passio recap/g) ?? []).length).toBe(1);
    expect(twice).toContain("NEW recap");
    db.$raw.close();
  });

  test("vaultReadNote returns indexed content", async () => {
    const db = tempDb("read");
    const vault = tempVault();
    await setVaultRoot(db, { path: vault });
    await writeFile(join(vault, "hello.md"), "# Hello\nbody");
    await indexVault(db, vault);
    const note = await vaultReadNote(db, { path: "hello.md" });
    expect(note?.body).toContain("body");
    db.$raw.close();
  });
});
