import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./client.js";
import { facts, notes, todos } from "./schema.js";

function tempPath(name: string) {
  return join(tmpdir(), `passio-test-${name}-${Date.now()}.sqlite`);
}

describe("db", () => {
  test("opens DB and creates tables, FTS, triggers", () => {
    const path = tempPath("open");
    const db = openDb(path);
    const rows = db.$raw
      .query("SELECT name FROM sqlite_master WHERE type IN ('table','trigger') ORDER BY name")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);
    expect(names).toContain("facts");
    expect(names).toContain("notes");
    expect(names).toContain("todos");
    expect(names).toContain("events");
    expect(names).toContain("fact_ai"); // trigger
    expect(names).toContain("note_ai");
    db.$raw.close();
  });

  test("inserts + FTS search round-trip for facts", async () => {
    const path = tempPath("fts");
    const db = openDb(path);
    await db.insert(facts).values({
      kind: "preference",
      content: "User likes black coffee in the morning",
      source: "user_told",
    });
    const hits = db.$raw
      .query(
        "SELECT rowid, content FROM fact_fts WHERE fact_fts MATCH ? ORDER BY rank LIMIT 5",
      )
      .all("coffee") as { rowid: number; content: string }[];
    expect(hits.length).toBe(1);
    expect(hits[0]?.content).toContain("coffee");
    db.$raw.close();
  });

  test("todos with default done=false", async () => {
    const path = tempPath("todos");
    const db = openDb(path);
    await db.insert(todos).values({ text: "Buy milk" });
    const rows = await db.select().from(todos);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.done).toBe(false);
    db.$raw.close();
  });

  test("notes insert with tags", async () => {
    const path = tempPath("notes");
    const db = openDb(path);
    await db.insert(notes).values({ title: "Ideas", body: "build passio", tags: "project" });
    const rows = await db.select().from(notes);
    expect(rows[0]?.body).toBe("build passio");
    db.$raw.close();
  });
});
