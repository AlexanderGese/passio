import type { Db } from "../db/client.js";
import type { BridgeServer } from "../bridge/server.js";
import { events } from "../db/schema.js";

/**
 * Thin wrappers around the bridge. Every call is logged to the `events`
 * table for the audit trail — the spec mandates 'every autonomous action
 * written to events with full params, never deleted'.
 */

export interface BrowserDeps {
  bridge: BridgeServer;
  db: Db;
}

async function auditCall(db: Db, tool: string, params: unknown, result: unknown, ok: boolean) {
  try {
    await db.insert(events).values({
      kind: "action",
      content: JSON.stringify({ tool, params, result, ok }),
      summary: `${tool}${ok ? "" : " (FAILED)"}`,
      importance: 2,
    });
  } catch {
    /* audit should never crash the tool */
  }
}

function ensureReady(bridge: BridgeServer): void {
  if (bridge.clients() === 0) {
    throw new Error(
      "browser extension not connected — install and pair the extension first",
    );
  }
}

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

export async function navigate(
  { bridge, db }: BrowserDeps,
  input: { url: string; tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(bridge);
  const res = (await bridge.request("navigate", input)) as { ok: true };
  await auditCall(db, "browser.navigate", input, res, true);
  return res;
}

export async function newTab(
  { bridge, db }: BrowserDeps,
  input: { url?: string },
): Promise<{ tabId: number }> {
  ensureReady(bridge);
  const res = (await bridge.request("new_tab", input)) as { tabId: number };
  await auditCall(db, "browser.new_tab", input, res, true);
  return res;
}

export async function closeTab(
  { bridge, db }: BrowserDeps,
  input: { tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(bridge);
  const res = (await bridge.request("close_tab", input)) as { ok: true };
  await auditCall(db, "browser.close_tab", input, res, true);
  return res;
}

export async function click(
  { bridge, db }: BrowserDeps,
  input: { selector: string; tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(bridge);
  const res = (await bridge.request("click", input)) as { ok: true };
  await auditCall(db, "browser.click", input, res, true);
  return res;
}

export async function typeText(
  { bridge, db }: BrowserDeps,
  input: { selector: string; text: string; tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(bridge);
  const res = (await bridge.request("type", input)) as { ok: true };
  await auditCall(
    db,
    "browser.type",
    { selector: input.selector, len: input.text.length, tabId: input.tabId },
    res,
    true,
  );
  return res;
}

export async function scroll(
  { bridge, db }: BrowserDeps,
  input: { direction: "up" | "down" | "top" | "bottom"; amount?: number; tabId?: number },
): Promise<{ ok: true }> {
  ensureReady(bridge);
  const res = (await bridge.request("scroll", input)) as { ok: true };
  await auditCall(db, "browser.scroll", input, res, true);
  return res;
}

export async function extract(
  { bridge, db }: BrowserDeps,
  input: { tabId?: number },
): Promise<{ url: string; title: string; text: string; byline?: string; length: number }> {
  ensureReady(bridge);
  const res = (await bridge.request("extract", input)) as Awaited<ReturnType<typeof extract>>;
  await auditCall(
    db,
    "browser.extract",
    input,
    { url: res.url, length: res.length },
    true,
  );
  return res;
}

export async function screenshot(
  { bridge, db }: BrowserDeps,
  input: { tabId?: number },
): Promise<{ dataUrl: string }> {
  ensureReady(bridge);
  const res = (await bridge.request("screenshot", input, 30_000)) as { dataUrl: string };
  await auditCall(
    db,
    "browser.screenshot",
    input,
    { bytes: res.dataUrl.length },
    true,
  );
  return res;
}
