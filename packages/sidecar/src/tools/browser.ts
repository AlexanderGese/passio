import type { Db } from "../db/client.js";
import type { BridgeServer } from "../bridge/server.js";
import type { RpcBus } from "../rpc.js";
import { events } from "../db/schema.js";
import { hostFromUrl, withGate } from "../bridge/gate.js";

/**
 * Browser tools talk to the Chrome extension over the bridge.
 *
 * Mutating tools (click/type/navigate/new_tab/close_tab/scroll) run through
 * `withGate` → per-hostname policy + dangerous-actions blocklist. Reads
 * (get_current_tab, get_all_tabs, extract, screenshot) skip the gate.
 *
 * Every call is audit-logged to the `events` table.
 */

export interface BrowserDeps {
  bridge: BridgeServer;
  db: Db;
  bus?: RpcBus; // optional — only mutations need it
}

async function auditCall(
  db: Db,
  tool: string,
  params: unknown,
  result: unknown,
  ok: boolean,
) {
  try {
    await db.insert(events).values({
      kind: "action",
      content: JSON.stringify({ tool, params, result, ok }),
      summary: `${tool}${ok ? "" : " (FAILED)"}`,
      importance: 2,
    });
  } catch {
    /* audit is best-effort */
  }
}

function ensureReady(bridge: BridgeServer): void {
  if (bridge.clients() === 0) {
    throw new Error(
      "browser extension not connected — install and pair the extension first",
    );
  }
}

async function currentHost(bridge: BridgeServer): Promise<string> {
  try {
    const tab = (await bridge.request("get_current_tab", {}, 5_000)) as { url: string };
    return hostFromUrl(tab.url);
  } catch {
    return "";
  }
}

// ---- Reads (no gate) ----

export async function getCurrentTab({ bridge, db }: BrowserDeps): Promise<{
  url: string;
  title: string;
  tabId: number;
}> {
  ensureReady(bridge);
  try {
    const res = (await bridge.request("get_current_tab", {})) as {
      url: string;
      title: string;
      tabId: number;
    };
    await auditCall(db, "browser.get_current_tab", {}, res, true);
    return res;
  } catch (e) {
    await auditCall(db, "browser.get_current_tab", {}, (e as Error).message, false);
    throw e;
  }
}

export async function getAllTabs({ bridge, db }: BrowserDeps): Promise<{
  tabs: Array<{ url: string; title: string; tabId: number; active: boolean }>;
}> {
  ensureReady(bridge);
  const res = (await bridge.request("get_all_tabs", {})) as Awaited<ReturnType<typeof getAllTabs>>;
  await auditCall(db, "browser.get_all_tabs", {}, { count: res.tabs.length }, true);
  return res;
}

export async function extract(
  { bridge, db }: BrowserDeps,
  input: { tabId?: number },
): Promise<{ url: string; title: string; text: string; byline?: string; length: number }> {
  ensureReady(bridge);
  const res = (await bridge.request("extract", input)) as Awaited<ReturnType<typeof extract>>;
  await auditCall(db, "browser.extract", input, { url: res.url, length: res.length }, true);
  return res;
}

export async function screenshot(
  { bridge, db }: BrowserDeps,
  input: { tabId?: number },
): Promise<{ dataUrl: string }> {
  ensureReady(bridge);
  const res = (await bridge.request("screenshot", input, 30_000)) as { dataUrl: string };
  await auditCall(db, "browser.screenshot", input, { bytes: res.dataUrl.length }, true);
  return res;
}

// ---- Mutations (gated) ----

function requireBus(bus: RpcBus | undefined): RpcBus {
  if (!bus) throw new Error("gate bus not available — browser mutations disabled");
  return bus;
}

export async function navigate(
  deps: BrowserDeps,
  input: { url: string; tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(deps.bridge);
  const bus = requireBus(deps.bus);
  try {
    const res = await withGate(
      { db: deps.db, bus },
      "navigate",
      input,
      async () => hostFromUrl(input.url),
      async () => (await deps.bridge.request("navigate", input)) as { ok: true },
    );
    await auditCall(deps.db, "browser.navigate", input, res, true);
    return res;
  } catch (e) {
    await auditCall(deps.db, "browser.navigate", input, (e as Error).message, false);
    throw e;
  }
}

export async function newTab(
  deps: BrowserDeps,
  input: { url?: string },
): Promise<{ tabId: number }> {
  ensureReady(deps.bridge);
  const bus = requireBus(deps.bus);
  try {
    const res = await withGate(
      { db: deps.db, bus },
      "new_tab",
      input,
      async () => hostFromUrl(input.url),
      async () => (await deps.bridge.request("new_tab", input)) as { tabId: number },
    );
    await auditCall(deps.db, "browser.new_tab", input, res, true);
    return res;
  } catch (e) {
    await auditCall(deps.db, "browser.new_tab", input, (e as Error).message, false);
    throw e;
  }
}

export async function closeTab(
  deps: BrowserDeps,
  input: { tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(deps.bridge);
  const bus = requireBus(deps.bus);
  try {
    const res = await withGate(
      { db: deps.db, bus },
      "close_tab",
      input,
      async () => currentHost(deps.bridge),
      async () => (await deps.bridge.request("close_tab", input)) as { ok: true },
    );
    await auditCall(deps.db, "browser.close_tab", input, res, true);
    return res;
  } catch (e) {
    await auditCall(deps.db, "browser.close_tab", input, (e as Error).message, false);
    throw e;
  }
}

export async function click(
  deps: BrowserDeps,
  input: { selector: string; tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(deps.bridge);
  const bus = requireBus(deps.bus);
  try {
    const res = await withGate(
      { db: deps.db, bus },
      "click",
      input,
      async () => currentHost(deps.bridge),
      async () => (await deps.bridge.request("click", input)) as { ok: true },
    );
    await auditCall(deps.db, "browser.click", input, res, true);
    return res;
  } catch (e) {
    await auditCall(deps.db, "browser.click", input, (e as Error).message, false);
    throw e;
  }
}

export async function typeText(
  deps: BrowserDeps,
  input: { selector: string; text: string; tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(deps.bridge);
  const bus = requireBus(deps.bus);
  try {
    const res = await withGate(
      { db: deps.db, bus },
      "type",
      input,
      async () => currentHost(deps.bridge),
      async () => (await deps.bridge.request("type", input)) as { ok: true },
    );
    await auditCall(
      deps.db,
      "browser.type",
      { selector: input.selector, len: input.text.length, tabId: input.tabId },
      res,
      true,
    );
    return res;
  } catch (e) {
    await auditCall(deps.db, "browser.type", { selector: input.selector }, (e as Error).message, false);
    throw e;
  }
}

export async function scroll(
  deps: BrowserDeps,
  input: { direction: "up" | "down" | "top" | "bottom"; amount?: number; tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(deps.bridge);
  const bus = requireBus(deps.bus);
  try {
    const res = await withGate(
      { db: deps.db, bus },
      "scroll",
      input,
      async () => currentHost(deps.bridge),
      async () => (await deps.bridge.request("scroll", input)) as { ok: true },
    );
    await auditCall(deps.db, "browser.scroll", input, res, true);
    return res;
  } catch (e) {
    await auditCall(deps.db, "browser.scroll", input, (e as Error).message, false);
    throw e;
  }
}
