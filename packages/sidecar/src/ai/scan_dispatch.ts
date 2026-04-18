import type { BridgeServer } from "../bridge/server.js";
import type { Db } from "../db/client.js";
import type { RpcBus } from "../rpc.js";
import { events } from "../db/schema.js";
import { hostFromUrl, withGate } from "../bridge/gate.js";
import * as browser from "../tools/browser.js";
import { getAutomationPrefs } from "../tools/automation_settings.js";
import type { ScanDecision } from "./scan.js";

/**
 * Executes a scanner's `act` decision through the safety gate (or
 * directly if policy allows + the "always gate" toggle is off).
 *
 * Safe-whitelist: only the 6 mutating browser tools. Any other tool
 * name in `proposed_tool` is rejected silently (logged to events,
 * scanner sees a nudge instead).
 */

const SAFE_TOOLS = new Set<string>([
  "click",
  "type",
  "navigate",
  "new_tab",
  "close_tab",
  "scroll",
]);

export interface DispatchResult {
  executed: boolean;
  reason: string;
}

export async function dispatchScanProposal(
  db: Db,
  ctx: { bridge: BridgeServer; bus: RpcBus },
  decision: ScanDecision,
): Promise<DispatchResult> {
  if (decision.decision !== "act") return { executed: false, reason: "not an act decision" };

  const tool = decision.proposed_tool;
  const args = (decision.proposed_args ?? {}) as Record<string, unknown>;

  if (!tool || !SAFE_TOOLS.has(tool)) {
    await auditReject(db, tool ?? "(none)", args, "not in safe whitelist");
    return { executed: false, reason: `tool '${tool ?? "?"}' not whitelisted` };
  }

  const prefs = getAutomationPrefs(db);
  const deps = { db, bridge: ctx.bridge, bus: ctx.bus };

  // Always-gate mode: wrap the call even if domain is full_auto.
  if (prefs.scannerAlwaysGate) {
    return runGated(db, deps, tool, args);
  }

  // Respect domain policy path — call the existing browser tools directly,
  // which already gate based on per-domain policy.
  return runPolicyAware(db, deps, tool, args);
}

async function runGated(
  db: Db,
  deps: { db: Db; bridge: BridgeServer; bus: RpcBus },
  tool: string,
  args: Record<string, unknown>,
): Promise<DispatchResult> {
  const domain = await extractDomain(deps.bridge, tool, args);
  try {
    await withGate(
      { db, bus: deps.bus },
      tool as "click" | "type" | "navigate" | "new_tab" | "close_tab" | "scroll",
      args,
      async () => domain,
      async () => runBrowserTool(deps, tool, args),
    );
    await auditExecute(db, tool, args, "scanner_proposal:gated");
    return { executed: true, reason: "gated" };
  } catch (e) {
    await auditReject(db, tool, args, `gate rejected: ${(e as Error).message}`);
    return { executed: false, reason: (e as Error).message };
  }
}

async function runPolicyAware(
  db: Db,
  deps: { db: Db; bridge: BridgeServer; bus: RpcBus },
  tool: string,
  args: Record<string, unknown>,
): Promise<DispatchResult> {
  try {
    await runBrowserTool(deps, tool, args);
    await auditExecute(db, tool, args, "scanner_proposal:policy");
    return { executed: true, reason: "policy-aware" };
  } catch (e) {
    await auditReject(db, tool, args, `policy rejected: ${(e as Error).message}`);
    return { executed: false, reason: (e as Error).message };
  }
}

async function runBrowserTool(
  deps: { db: Db; bridge: BridgeServer; bus: RpcBus },
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (tool) {
    case "click":
      return browser.click(deps, args as { selector: string; tabId?: number });
    case "type":
      return browser.typeText(deps, args as { selector: string; text: string; tabId?: number });
    case "navigate":
      return browser.navigate(deps, args as { url: string; tabId?: number });
    case "new_tab":
      return browser.newTab(deps, args as { url?: string });
    case "close_tab":
      return browser.closeTab(deps, args as { tabId?: number });
    case "scroll":
      return browser.scroll(
        deps,
        args as { direction: "up" | "down" | "top" | "bottom"; amount?: number; tabId?: number },
      );
    default:
      throw new Error(`unknown tool ${tool}`);
  }
}

async function extractDomain(
  bridge: BridgeServer,
  tool: string,
  args: Record<string, unknown>,
): Promise<string> {
  // navigate/new_tab carry the target URL
  if ((tool === "navigate" || tool === "new_tab") && typeof args.url === "string") {
    return hostFromUrl(args.url);
  }
  // others reference the active tab
  if (bridge.clients() > 0) {
    try {
      const res = (await bridge.request("get_current_tab", {}, 5_000)) as { url: string };
      return hostFromUrl(res.url);
    } catch {
      return "";
    }
  }
  return "";
}

async function auditExecute(
  db: Db,
  tool: string,
  args: Record<string, unknown>,
  mode: string,
): Promise<void> {
  try {
    await db.insert(events).values({
      kind: "action",
      content: JSON.stringify({ source: "scanner", tool, args, mode }),
      summary: `scanner act: ${tool} (${mode})`,
      importance: 3,
    });
  } catch {
    /* audit is best-effort */
  }
}

async function auditReject(
  db: Db,
  tool: string,
  args: Record<string, unknown>,
  reason: string,
): Promise<void> {
  try {
    await db.insert(events).values({
      kind: "action",
      content: JSON.stringify({ source: "scanner", tool, args, rejected: reason }),
      summary: `scanner rejected: ${tool}`,
      importance: 2,
    });
  } catch {
    /* audit is best-effort */
  }
}
