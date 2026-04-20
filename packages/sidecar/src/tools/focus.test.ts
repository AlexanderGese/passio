import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/client.js";
import {
  cyclePack,
  focusStart,
  focusStop,
  getActivePack,
  getDistractingDomains,
  getDndUntil,
  getFocusState,
  getProactiveInterval,
  getProactiveMode,
  setActivePack,
  setDistractingDomains,
  setDnd,
  setProactiveInterval,
  setProactiveMode,
  toggleDnd,
} from "./focus.js";

function tempDb(tag: string) {
  return openDb(join(tmpdir(), `passio-focus-${tag}-${Date.now()}.sqlite`));
}

describe("focus + settings helpers", () => {
  test("active pack defaults to work and cycles work → study → chill → work", () => {
    const db = tempDb("pack");
    expect(getActivePack(db)).toBe("work");
    expect(cyclePack(db).pack).toBe("study");
    expect(cyclePack(db).pack).toBe("chill");
    expect(cyclePack(db).pack).toBe("work");
    setActivePack(db, "custom");
    // cycle still advances from last known index, but custom isn't in the rotation,
    // so next cycle falls back to `work`
    expect(cyclePack(db).pack).toBe("work");
    db.$raw.close();
  });

  test("proactive mode + interval default then update", () => {
    const db = tempDb("proactive");
    expect(getProactiveMode(db)).toBe("active-assist");
    expect(getProactiveInterval(db)).toBe(7);
    setProactiveMode(db, "active-assist");
    setProactiveInterval(db, 90); // clamped
    expect(getProactiveMode(db)).toBe("active-assist");
    expect(getProactiveInterval(db)).toBe(60);
    db.$raw.close();
  });

  test("DND setDnd + toggleDnd + expiry", () => {
    const db = tempDb("dnd");
    expect(getDndUntil(db)).toBeNull();
    const a = setDnd(db, { minutes: 30 });
    expect(typeof a.until).toBe("string");
    const parsed = new Date(a.until!);
    expect(parsed.getTime()).toBeGreaterThan(Date.now());

    const b = toggleDnd(db); // flips OFF since currently ON
    expect(b.until).toBeNull();

    const c = toggleDnd(db); // flips back ON at default 60m
    expect(typeof c.until).toBe("string");
    db.$raw.close();
  });

  test("distracting domains round-trip with dedupe + trim", () => {
    const db = tempDb("distract");
    const defaults = getDistractingDomains(db);
    expect(defaults).toContain("twitter.com");
    setDistractingDomains(db, [" reddit.com ", "reddit.com", "tiktok.com"]);
    const out = getDistractingDomains(db).sort();
    expect(out).toEqual(["reddit.com", "tiktok.com"]);
    db.$raw.close();
  });

  test("focus start/stop", () => {
    const db = tempDb("focus");
    expect(getFocusState(db).active).toBe(false);
    const started = focusStart(db, 25);
    expect(started.active).toBe(true);
    expect(started.durationMin).toBe(25);
    const stopped = focusStop(db);
    expect(stopped.active).toBe(false);
    db.$raw.close();
  });
});
