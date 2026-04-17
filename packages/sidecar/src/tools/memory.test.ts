import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/client.js";
import {
  memoryForget,
  memoryRemember,
  memorySearch,
  noteSave,
  setIntent,
  getIntent,
  todoAdd,
  todoDone,
  todoList,
} from "./memory.js";

function tempDb(tag: string) {
  return openDb(join(tmpdir(), `passio-mem-${tag}-${Date.now()}.sqlite`));
}

describe("memory tools (no embeddings)", () => {
  test("remember → search finds the fact via FTS", async () => {
    const db = tempDb("remember");
    const { id } = await memoryRemember(db, {
      kind: "preference",
      content: "User loves dark mode and terminal workflows",
      source: "user_told",
    });
    expect(id).toBeGreaterThan(0);
    const { hits } = await memorySearch(db, { query: "dark mode" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.kind).toBe("fact");
    db.$raw.close();
  });

  test("forget removes the fact", async () => {
    const db = tempDb("forget");
    const { id } = await memoryRemember(db, {
      kind: "context",
      content: "Temporary note to delete",
    });
    await memoryForget(db, { id });
    const { hits } = await memorySearch(db, { query: "Temporary" });
    expect(hits.filter((h) => h.id === id)).toHaveLength(0);
    db.$raw.close();
  });

  test("todo add/list/done", async () => {
    const db = tempDb("todo");
    const { id } = await todoAdd(db, { text: "Buy milk" });
    const open = await todoList(db, { filter: "open" });
    expect(open.todos.some((t) => t.id === id)).toBe(true);

    await todoDone(db, { id });
    const done = await todoList(db, { filter: "done" });
    expect(done.todos.some((t) => t.id === id)).toBe(true);
    const stillOpen = await todoList(db, { filter: "open" });
    expect(stillOpen.todos.some((t) => t.id === id)).toBe(false);
    db.$raw.close();
  });

  test("notes are indexed in FTS via trigger", async () => {
    const db = tempDb("note");
    await noteSave(db, { title: "Idea", body: "build passio bubble assistant", tags: "project" });
    const { hits } = await memorySearch(db, { query: "bubble assistant" });
    expect(hits.some((h) => h.kind === "note")).toBe(true);
    db.$raw.close();
  });

  test("setIntent/getIntent round-trip", async () => {
    const db = tempDb("intent");
    await setIntent(db, { text: "ship week 2" });
    const got = getIntent(db);
    expect(got?.text).toBe("ship week 2");
    await setIntent(db, { text: null });
    expect(getIntent(db)).toBeNull();
    db.$raw.close();
  });
});
