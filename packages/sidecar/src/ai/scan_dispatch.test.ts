import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/client.js";
import { RpcBus } from "../rpc.js";
import { setAutomationPrefs } from "../tools/automation_settings.js";
import { setPolicy } from "../bridge/gate.js";
import { dispatchScanProposal } from "./scan_dispatch.js";

function tempDb(tag: string) {
  return openDb(join(tmpdir(), `passio-scandisp-${tag}-${Date.now()}.sqlite`));
}

/**
 * Minimal fake bridge that echoes tool requests to a recorded list and
 * pretends to have a client connected. get_current_tab returns whatever
 * we seed.
 */
function fakeBridge(currentUrl = "https://github.com/example") {
  const calls: Array<{ method: string; params: unknown }> = [];
  return {
    calls,
    port: 0,
    token: "",
    pairingFile: "",
    clients: () => 1,
    async request(method: string, params: unknown) {
      calls.push({ method, params });
      if (method === "get_current_tab") {
        return { url: currentUrl, title: "Example", tabId: 1 };
      }
      return { ok: true };
    },
    async stop() {},
    onEvent() {
      return () => {};
    },
  };
}

describe("dispatchScanProposal", () => {
  test("non-'act' decisions are no-ops", async () => {
    const db = tempDb("noop");
    const bridge = fakeBridge();
    const bus = new RpcBus();
    const res = await dispatchScanProposal(db, { bridge: bridge as any, bus }, {
      decision: "quiet",
      reason: "nothing to do",
    });
    expect(res.executed).toBe(false);
    expect(bridge.calls).toHaveLength(0);
    db.$raw.close();
  });

  test("rejects tools outside the safe whitelist", async () => {
    const db = tempDb("reject");
    const bridge = fakeBridge();
    const bus = new RpcBus();
    const res = await dispatchScanProposal(db, { bridge: bridge as any, bus }, {
      decision: "act",
      reason: "try shell",
      proposed_tool: "shell_run",
      proposed_args: { command: "rm -rf /" },
    });
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/not whitelisted/);
    // Only the safe whitelist mattered — no tool RPC went out.
    expect(bridge.calls.filter((c) => c.method !== "get_current_tab")).toHaveLength(0);
    db.$raw.close();
  });

  test("alwaysGate=true routes through gate even on full_auto", async () => {
    const db = tempDb("always-gate");
    const bridge = fakeBridge("https://github.com/foo");
    const bus = new RpcBus();
    setAutomationPrefs(db, { scannerAlwaysGate: true });
    // github.com is full_auto by default — but alwaysGate flag still prompts.
    setTimeout(() => {
      const pending = (bus as unknown as { gatePending: Map<string, unknown> }).gatePending;
      for (const id of pending.keys()) bus.resolveGate(id, true);
    }, 10);
    const res = await dispatchScanProposal(db, { bridge: bridge as any, bus }, {
      decision: "act",
      reason: "click link",
      proposed_tool: "click",
      proposed_args: { selector: "a.next" },
    });
    expect(res.executed).toBe(true);
    expect(res.reason).toBe("gated");
    // click was forwarded to the bridge
    expect(bridge.calls.some((c) => c.method === "click")).toBe(true);
    db.$raw.close();
  });

  test("alwaysGate=false with full_auto host runs directly", async () => {
    const db = tempDb("policy-full-auto");
    const bridge = fakeBridge("https://github.com/foo");
    const bus = new RpcBus();
    setAutomationPrefs(db, { scannerAlwaysGate: false });
    const res = await dispatchScanProposal(db, { bridge: bridge as any, bus }, {
      decision: "act",
      reason: "scroll down",
      proposed_tool: "scroll",
      proposed_args: { direction: "down" },
    });
    expect(res.executed).toBe(true);
    expect(res.reason).toBe("policy-aware");
    expect(bridge.calls.some((c) => c.method === "scroll")).toBe(true);
    db.$raw.close();
  });

  test("alwaysGate=false with observe_only host still blocks", async () => {
    const db = tempDb("observe-only");
    const bridge = fakeBridge("https://mail.google.com/inbox");
    const bus = new RpcBus();
    setAutomationPrefs(db, { scannerAlwaysGate: false });
    setPolicy(db, "mail.google.com", "observe_only");
    const res = await dispatchScanProposal(db, { bridge: bridge as any, bus }, {
      decision: "act",
      reason: "archive email",
      proposed_tool: "click",
      proposed_args: { selector: 'button[aria-label="Archive"]' },
    });
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/observe_only|policy/);
    db.$raw.close();
  });
});
