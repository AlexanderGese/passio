import type { Db } from "../db/client.js";
import type { RpcBus } from "../rpc.js";

/**
 * Browser-action gate. Looks up per-hostname policy + a universal
 * dangerous-actions blocklist, and either:
 *   - lets the tool through (full_auto clean path),
 *   - rejects hard (observe_only),
 *   - OR asks the user via a countdown toast in the HUD (ask_first, or
 *     a blocklist match on any policy).
 */

export type Policy = "observe_only" | "ask_first" | "full_auto";

export interface BlocklistEntry {
  kind: "selector" | "url_contains";
  pattern: string;
  reason: string;
}

const DEFAULT_BLOCKLIST: BlocklistEntry[] = [
  { kind: "selector", pattern: "button\\[type=submit\\]", reason: "form submit" },
  { kind: "selector", pattern: "input\\[type=submit\\]", reason: "form submit" },
  { kind: "selector", pattern: 'button\\[aria-label\\*="send"', reason: "send button" },
  { kind: "url_contains", pattern: "/checkout", reason: "checkout flow" },
  { kind: "url_contains", pattern: "/logout", reason: "logout" },
  { kind: "url_contains", pattern: "unsubscribe", reason: "unsubscribe link" },
];

export function getPolicies(db: Db): Record<string, Policy> {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = 'browser_policy'").get() as
    | { value: string }
    | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, Policy>;
  } catch {
    return {};
  }
}

export function lookupPolicy(db: Db, host: string): Policy {
  return getPolicies(db)[host] ?? "full_auto";
}

export function setPolicy(db: Db, host: string, policy: Policy): void {
  const all = getPolicies(db);
  all[host] = policy;
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('browser_policy', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(all));
}

export function deletePolicy(db: Db, host: string): void {
  const all = getPolicies(db);
  delete all[host];
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('browser_policy', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(all));
}

export function getCountdownSeconds(db: Db): number {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = 'countdown_seconds'").get() as
    | { value: string }
    | undefined;
  if (!row) return 3;
  try {
    const n = JSON.parse(row.value) as number;
    return Math.max(1, Math.min(10, Number(n) || 3));
  } catch {
    return 3;
  }
}

export function setCountdownSeconds(db: Db, seconds: number): void {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('countdown_seconds', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(Math.max(1, Math.min(10, Math.round(seconds)))));
}

export function getBlocklist(db: Db): BlocklistEntry[] {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = 'action_blocklist'").get() as
    | { value: string }
    | undefined;
  if (!row) return DEFAULT_BLOCKLIST;
  try {
    return JSON.parse(row.value) as BlocklistEntry[];
  } catch {
    return DEFAULT_BLOCKLIST;
  }
}

export function setBlocklist(db: Db, entries: BlocklistEntry[]): void {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('action_blocklist', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(entries));
}

export function matchBlocklist(
  db: Db,
  tool: string,
  params: unknown,
): BlocklistEntry | null {
  const list = getBlocklist(db);
  const p = (params ?? {}) as { selector?: string; url?: string };
  for (const entry of list) {
    try {
      const re = new RegExp(entry.pattern, "i");
      if (entry.kind === "selector" && p.selector && re.test(p.selector)) return entry;
      if (entry.kind === "url_contains" && p.url && re.test(p.url)) return entry;
    } catch {
      /* malformed user regex — skip */
    }
  }
  return null;
}

export function hostFromUrl(url: string | undefined | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export interface GateDeps {
  db: Db;
  bus: RpcBus;
}

/**
 * Wrap a tool call with the safety gate.
 */
export async function withGate<T>(
  deps: GateDeps,
  tool: "click" | "type" | "navigate" | "new_tab" | "close_tab" | "scroll",
  params: unknown,
  fetchTargetDomain: () => Promise<string>,
  doTool: () => Promise<T>,
): Promise<T> {
  const domain = await fetchTargetDomain();
  const policy = lookupPolicy(deps.db, domain);

  if (policy === "observe_only") {
    throw new Error(`policy observe_only blocks ${tool} on ${domain || "this page"}`);
  }

  const blocked = matchBlocklist(deps.db, tool, params);
  const reason = blocked
    ? `blocklist:${blocked.pattern}:${blocked.reason}`
    : policy === "ask_first"
      ? "ask_first"
      : null;

  if (!reason) return doTool();

  const id = crypto.randomUUID();
  const timeoutMs = (getCountdownSeconds(deps.db) + 2) * 1000;
  deps.bus.notify("passio.gate.request", { id, tool, params, domain, reason });
  const allowed = await deps.bus.awaitGateResolve(id, timeoutMs);
  if (!allowed) throw new Error(`gate: ${tool} on ${domain || "page"} rejected`);
  return doTool();
}
