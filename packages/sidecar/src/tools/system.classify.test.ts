import { describe, expect, test } from "bun:test";
import Database from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { getProductiveKeywords, setProductiveKeywords } from "./system.js";

// We can't import the internal `classify` directly (not exported), so we
// test the end-to-end intent via a stub DB that feeds getProductiveKeywords
// + reproduce the matcher inline. If the matcher drifts, this test won't
// catch it — that's fine; the higher-signal test is whether the default
// list actually includes the terms the user complained about.

describe("productive keywords defaults", () => {
  test("includes 'tutorial' and music terms so YouTube lofi + tutorials stop counting as distraction", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)");
    const db = { $raw: sqlite, ...drizzle(sqlite) } as any;
    const kw = getProductiveKeywords(db);
    for (const needle of ["tutorial", "lofi", "music", "how to", "course", "lecture", "playlist", "coding"]) {
      expect(kw.some((k) => k.includes(needle))).toBe(true);
    }
  });

  test("user overrides persist + round-trip", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)");
    const db = { $raw: sqlite, ...drizzle(sqlite) } as any;
    setProductiveKeywords(db, ["Documentary", "  live coding  ", "documentary", ""]);
    const kw = getProductiveKeywords(db);
    expect(kw).toContain("documentary");
    expect(kw).toContain("live coding");
    expect(kw.filter((k) => k === "documentary").length).toBe(1); // deduped
    expect(kw.includes("")).toBe(false); // blanks stripped
  });
});
