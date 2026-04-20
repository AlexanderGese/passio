import type { Db } from "../db/client.js";
import type { BridgeServer } from "../bridge/server.js";

/**
 * Undo support for autonomous actions. Expects events of kind='action'
 * that carry a JSON payload including an optional `undo` plan. If the
 * action didn't capture an undo plan, it's surfaced as "irreversible".
 */

type Action = {
  id: number;
  ts: string;
  tool: string;
  params: unknown;
  undo: { tool: string; params: unknown } | null;
  undone: boolean;
};

export function listAuditable(db: Db, limit = 30): { actions: Action[] } {
  const rows = db.$raw
    .query(
      "SELECT id, ts, content FROM events WHERE kind = 'action' ORDER BY ts DESC LIMIT ?",
    )
    .all(limit) as Array<{ id: number; ts: string; content: string }>;
  const out: Action[] = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.content);
      out.push({
        id: r.id,
        ts: r.ts,
        tool: parsed.tool ?? "unknown",
        params: parsed.params,
        undo: parsed.undo ?? null,
        undone: parsed.undone === true,
      });
    } catch {
      /* skip malformed rows */
    }
  }
  return { actions: out };
}

export async function undoAction(
  db: Db,
  bridge: BridgeServer,
  input: { id: number },
): Promise<{ ok: boolean; reason?: string }> {
  const row = db.$raw
    .query("SELECT content FROM events WHERE id = ?")
    .get(input.id) as { content: string } | undefined;
  if (!row) return { ok: false, reason: "not_found" };
  let parsed: { tool?: string; params?: unknown; undo?: { tool: string; params: unknown } | null; undone?: boolean };
  try {
    parsed = JSON.parse(row.content);
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (parsed.undone) return { ok: false, reason: "already_undone" };
  if (!parsed.undo) return { ok: false, reason: "irreversible" };
  try {
    await bridge.request(parsed.undo.tool, parsed.undo.params);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  const updated = { ...parsed, undone: true };
  db.$raw
    .query("UPDATE events SET content = ?, summary = ? WHERE id = ?")
    .run(JSON.stringify(updated), "undone", input.id);
  return { ok: true };
}
