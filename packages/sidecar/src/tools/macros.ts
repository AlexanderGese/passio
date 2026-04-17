import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import type { BridgeServer } from "../bridge/server.js";
import type { RpcBus } from "../rpc.js";
import { workflows } from "../db/schema.js";
import { click, navigate, scroll, typeText } from "./browser.js";

/**
 * Workflow macros — a named sequence of browser actions the user can
 * replay by name. Steps persisted as JSON in the existing `workflows`
 * table. Replay uses the same gated browser tools, so every action is
 * audit-logged and policy-checked.
 */

export type MacroStep =
  | { kind: "navigate"; url: string }
  | { kind: "click"; selector: string }
  | { kind: "type"; selector: string; text: string }
  | { kind: "scroll"; direction: "up" | "down" | "top" | "bottom"; amount?: number }
  | { kind: "wait"; ms: number };

export interface BrowserCtx {
  bridge: BridgeServer;
  bus: RpcBus;
}

export async function macroSave(
  db: Db,
  input: { name: string; trigger?: string; steps: MacroStep[] },
): Promise<{ id: number }> {
  const existing = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(eq(workflows.name, input.name));
  if (existing[0]) {
    await db
      .update(workflows)
      .set({
        trigger: input.trigger ?? null,
        steps: JSON.stringify(input.steps),
      })
      .where(eq(workflows.id, existing[0].id));
    return { id: existing[0].id };
  }
  const [row] = await db
    .insert(workflows)
    .values({
      name: input.name,
      trigger: input.trigger ?? null,
      steps: JSON.stringify(input.steps),
    })
    .returning({ id: workflows.id });
  if (!row) throw new Error("macro insert returned no row");
  return { id: row.id };
}

export async function macroList(
  db: Db,
): Promise<{ macros: Array<{ id: number; name: string; steps: MacroStep[]; useCount: number; lastUsed: string | null }> }> {
  const rows = await db.select().from(workflows);
  return {
    macros: rows.map((r) => ({
      id: r.id,
      name: r.name,
      steps: JSON.parse(r.steps) as MacroStep[],
      useCount: r.useCount,
      lastUsed: r.lastUsed,
    })),
  };
}

export async function macroDelete(db: Db, input: { id: number }): Promise<{ ok: true }> {
  await db.delete(workflows).where(eq(workflows.id, input.id));
  return { ok: true };
}

export async function macroRun(
  db: Db,
  ctx: BrowserCtx,
  input: { name: string },
): Promise<{ ok: true; steps_executed: number }> {
  const [row] = await db.select().from(workflows).where(eq(workflows.name, input.name));
  if (!row) throw new Error(`macro '${input.name}' not found`);
  const steps = JSON.parse(row.steps) as MacroStep[];
  let executed = 0;
  for (const step of steps) {
    await runStep(db, ctx, step);
    executed++;
  }
  await db
    .update(workflows)
    .set({ useCount: row.useCount + 1, lastUsed: new Date().toISOString() })
    .where(eq(workflows.id, row.id));
  return { ok: true, steps_executed: executed };
}

async function runStep(db: Db, ctx: BrowserCtx, step: MacroStep): Promise<void> {
  const deps = { db, bridge: ctx.bridge, bus: ctx.bus };
  switch (step.kind) {
    case "navigate":
      await navigate(deps, { url: step.url });
      return;
    case "click":
      await click(deps, { selector: step.selector });
      return;
    case "type":
      await typeText(deps, { selector: step.selector, text: step.text });
      return;
    case "scroll":
      await scroll(
        deps,
        step.amount !== undefined
          ? { direction: step.direction, amount: step.amount }
          : { direction: step.direction },
      );
      return;
    case "wait":
      await new Promise<void>((r) => setTimeout(r, Math.max(0, Math.min(step.ms, 30_000))));
      return;
  }
}
