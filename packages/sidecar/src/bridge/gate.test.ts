import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/client.js";
import { RpcBus } from "../rpc.js";
import {
  deletePolicy,
  getBlocklist,
  getCountdownSeconds,
  hostFromUrl,
  lookupPolicy,
  matchBlocklist,
  setBlocklist,
  setCountdownSeconds,
  setPolicy,
  withGate,
} from "./gate.js";

function tempDb(tag: string) {
  return openDb(join(tmpdir(), `passio-gate-${tag}-${Date.now()}.sqlite`));
}

describe("policy storage", () => {
  test("default full_auto, set/get/delete round-trip", () => {
    const db = tempDb("policy");
    expect(lookupPolicy(db, "github.com")).toBe("full_auto");
    setPolicy(db, "mail.google.com", "observe_only");
    expect(lookupPolicy(db, "mail.google.com")).toBe("observe_only");
    deletePolicy(db, "mail.google.com");
    expect(lookupPolicy(db, "mail.google.com")).toBe("full_auto");
    db.$raw.close();
  });

  test("countdown seconds clamp to 1..10", () => {
    const db = tempDb("countdown");
    expect(getCountdownSeconds(db)).toBe(3);
    setCountdownSeconds(db, 100);
    expect(getCountdownSeconds(db)).toBe(10);
    setCountdownSeconds(db, 0);
    expect(getCountdownSeconds(db)).toBe(1);
    db.$raw.close();
  });
});

describe("blocklist", () => {
  test("defaults include form submit selector", () => {
    const db = tempDb("bl-default");
    const hit = matchBlocklist(db, "click", { selector: "button[type=submit]" });
    expect(hit?.reason).toBe("form submit");
    db.$raw.close();
  });

  test("url_contains matches navigate url", () => {
    const db = tempDb("bl-url");
    const hit = matchBlocklist(db, "navigate", { url: "https://shop.example.com/checkout/pay" });
    expect(hit?.reason).toBe("checkout flow");
    db.$raw.close();
  });

  test("setBlocklist replaces + matches custom entry", () => {
    const db = tempDb("bl-custom");
    setBlocklist(db, [
      { kind: "selector", pattern: "data-explode", reason: "explosive" },
    ]);
    const list = getBlocklist(db);
    expect(list).toHaveLength(1);
    const hit = matchBlocklist(db, "click", { selector: "div[data-explode]" });
    expect(hit?.reason).toBe("explosive");
    const none = matchBlocklist(db, "click", { selector: "button.friendly" });
    expect(none).toBeNull();
    db.$raw.close();
  });
});

describe("withGate", () => {
  test("full_auto + no blocklist → proceeds directly", async () => {
    const db = tempDb("full-auto");
    const bus = new RpcBus();
    let called = 0;
    await withGate(
      { db, bus },
      "click",
      { selector: "a.link" },
      async () => "github.com",
      async () => {
        called++;
        return { ok: true as const };
      },
    );
    expect(called).toBe(1);
    db.$raw.close();
  });

  test("observe_only → throws", async () => {
    const db = tempDb("observe");
    const bus = new RpcBus();
    setPolicy(db, "github.com", "observe_only");
    await expect(
      withGate(
        { db, bus },
        "click",
        { selector: "a" },
        async () => "github.com",
        async () => ({ ok: true as const }),
      ),
    ).rejects.toThrow(/observe_only/);
    db.$raw.close();
  });

  test("ask_first → requests gate, proceeds when resolved true", async () => {
    const db = tempDb("ask-first");
    const bus = new RpcBus();
    setPolicy(db, "github.com", "ask_first");
    let executed = false;
    const p = withGate(
      { db, bus },
      "click",
      { selector: "a" },
      async () => "github.com",
      async () => {
        executed = true;
        return { ok: true as const };
      },
    );
    // Next microtask: sidecar has emitted notify; simulate Rust resolving after ~5ms.
    setTimeout(() => {
      // Find the pending id — it was generated inside withGate. We'll just resolve the
      // only pending one by iterating through the private map via resolveGate with
      // a wildcard isn't exposed — instead trigger by picking the current set.
      // Test hook: we call resolveGate for every possible id by crawling
      // gatePending — the method is public, but the id is private.
      // Workaround: reach in via any-cast.
      const pending = (bus as unknown as { gatePending: Map<string, unknown> }).gatePending;
      const ids = [...pending.keys()];
      for (const id of ids) bus.resolveGate(id, true);
    }, 5);
    const res = await p;
    expect(res.ok).toBe(true);
    expect(executed).toBe(true);
    db.$raw.close();
  });

  test("blocklist hit on full_auto still triggers gate", async () => {
    const db = tempDb("bl-full-auto");
    const bus = new RpcBus();
    let executed = false;
    const p = withGate(
      { db, bus },
      "click",
      { selector: "button[type=submit]" },
      async () => "any.example.com",
      async () => {
        executed = true;
        return { ok: true as const };
      },
    );
    setTimeout(() => {
      const pending = (bus as unknown as { gatePending: Map<string, unknown> }).gatePending;
      for (const id of pending.keys()) bus.resolveGate(id, false);
    }, 5);
    await expect(p).rejects.toThrow(/rejected/);
    expect(executed).toBe(false);
    db.$raw.close();
  });
});

describe("hostFromUrl", () => {
  test("parses standard URLs", () => {
    expect(hostFromUrl("https://github.com/anthropics/passio")).toBe("github.com");
    expect(hostFromUrl("http://localhost:3000/path")).toBe("localhost");
  });
  test("empty/invalid returns empty string", () => {
    expect(hostFromUrl(undefined)).toBe("");
    expect(hostFromUrl("not a url")).toBe("");
  });
});
