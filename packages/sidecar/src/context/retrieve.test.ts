import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/client.js";
import { facts, notes } from "../db/schema.js";
import { rrf, retrieve, type Hit } from "./retrieve.js";

function tempDb(tag: string) {
  return openDb(join(tmpdir(), `passio-ret-${tag}-${Date.now()}.sqlite`));
}

describe("retrieve (FTS-only path)", () => {
  test("returns top fact matching keyword", async () => {
    const db = tempDb("kw");
    await db.insert(facts).values({ kind: "preference", content: "The user prefers black coffee in the morning." });
    await db.insert(facts).values({ kind: "preference", content: "The user dislikes loud meetings." });
    await db.insert(notes).values({ title: "Random", body: "I love espresso at 4pm" });

    const hits = await retrieve(db, "coffee");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.content).toContain("coffee");
    db.$raw.close();
  });

  test("multi-word query returns ranked set", async () => {
    const db = tempDb("mw");
    await db.insert(facts).values({ kind: "identity", content: "User's name is Alexander" });
    await db.insert(facts).values({ kind: "preference", content: "Prefers JetBrains Mono" });
    const hits = await retrieve(db, "Alexander JetBrains");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    db.$raw.close();
  });
});

describe("rrf", () => {
  test("boosts items appearing in multiple lists", () => {
    const a: Hit[] = [
      { kind: "fact", id: 1, content: "a", score: 0.1, source: "fts" },
      { kind: "fact", id: 2, content: "b", score: 0.2, source: "fts" },
    ];
    const b: Hit[] = [
      { kind: "fact", id: 2, content: "b", score: 0.05, source: "vec" },
      { kind: "fact", id: 3, content: "c", score: 0.08, source: "vec" },
    ];
    const merged = rrf([a, b], 5);
    expect(merged[0]?.id).toBe(2);
    expect(merged[0]?.source).toBe("both");
  });
});
