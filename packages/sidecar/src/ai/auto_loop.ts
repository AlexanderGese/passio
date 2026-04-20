import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";
import type { BridgeServer } from "../bridge/server.js";
import type { RpcBus } from "../rpc.js";
import { chat as runChat } from "./agent.js";
import { logUsage } from "../tools/cost.js";

/**
 * Auto-retrigger loop (agentic).
 *
 * User hands Passio a high-level task. Passio:
 *   1. plans N sub-steps
 *   2. executes each step via the normal chat agent (which has tools —
 *      browser, vault, memory, todos, etc.)
 *   3. after each step, records the outcome into the loop's history
 *   4. once the plan is exhausted, asks the planner "is the task 100%
 *      done?"; if no, generates the next batch of steps and keeps going
 *   5. stops at `maxSteps`, `maxCostUsd`, success, or user cancel
 *
 * The whole loop is single-process; if the sidecar restarts mid-run the
 * loop is marked 'abandoned' on boot. State lives in two tables so the
 * UI can observe progress live.
 */

const PlanSchema = z.object({
  steps: z
    .array(
      z.object({
        title: z.string(),
        prompt: z.string(),
      }),
    )
    .min(1)
    .max(8),
});

const AssessSchema = z.object({
  complete: z.boolean(),
  reason: z.string(),
  nextSteps: z
    .array(
      z.object({
        title: z.string(),
        prompt: z.string(),
      }),
    )
    .max(8),
});

const DEFAULT_MAX_STEPS = 20;
const DEFAULT_MAX_COST = 0.5; // USD
const DEFAULT_MAX_REPLANS = 4;

export function ensureAutoLoopTables(db: Db): void {
  db.$raw
    .query(
      `CREATE TABLE IF NOT EXISTS auto_loops (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         task TEXT NOT NULL,
         status TEXT NOT NULL DEFAULT 'running',
         started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         finished_at TEXT,
         step_count INTEGER NOT NULL DEFAULT 0,
         replan_count INTEGER NOT NULL DEFAULT 0,
         max_steps INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_STEPS},
         max_cost_usd REAL NOT NULL DEFAULT ${DEFAULT_MAX_COST},
         cost_usd REAL NOT NULL DEFAULT 0,
         last_message TEXT,
         goal_id INTEGER
       )`,
    )
    .run();
  db.$raw
    .query(
      `CREATE TABLE IF NOT EXISTS auto_loop_events (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         loop_id INTEGER NOT NULL,
         ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         kind TEXT NOT NULL,
         title TEXT,
         content TEXT
       )`,
    )
    .run();
  db.$raw.query("CREATE INDEX IF NOT EXISTS idx_alp_events_loop ON auto_loop_events(loop_id)").run();
}

export function markOrphanedLoopsAbandoned(db: Db): void {
  ensureAutoLoopTables(db);
  db.$raw
    .query(
      "UPDATE auto_loops SET status = 'abandoned', finished_at = CURRENT_TIMESTAMP WHERE status = 'running'",
    )
    .run();
}

const activeCancellers = new Map<number, { cancel: () => void }>();

export function cancelLoop(db: Db, id: number): { ok: boolean } {
  const cancel = activeCancellers.get(id);
  if (cancel) cancel.cancel();
  db.$raw
    .query(
      "UPDATE auto_loops SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'",
    )
    .run(id);
  return { ok: true };
}

export function listLoops(
  db: Db,
  input: { limit?: number; status?: string } = {},
): {
  loops: Array<{
    id: number;
    task: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    stepCount: number;
    replanCount: number;
    costUsd: number;
    maxCostUsd: number;
    lastMessage: string | null;
  }>;
} {
  ensureAutoLoopTables(db);
  const rows = db.$raw
    .query(
      `SELECT id, task, status, started_at AS startedAt, finished_at AS finishedAt,
              step_count AS stepCount, replan_count AS replanCount,
              cost_usd AS costUsd, max_cost_usd AS maxCostUsd, last_message AS lastMessage
         FROM auto_loops
        ${input.status ? "WHERE status = ?" : ""}
        ORDER BY started_at DESC
        LIMIT ?`,
    )
    .all(...(input.status ? [input.status, input.limit ?? 20] : [input.limit ?? 20])) as Array<{
    id: number;
    task: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    stepCount: number;
    replanCount: number;
    costUsd: number;
    maxCostUsd: number;
    lastMessage: string | null;
  }>;
  return { loops: rows };
}

export function loopEvents(
  db: Db,
  input: { id: number },
): {
  events: Array<{ id: number; ts: string; kind: string; title: string | null; content: string | null }>;
} {
  ensureAutoLoopTables(db);
  const rows = db.$raw
    .query(
      "SELECT id, ts, kind, title, content FROM auto_loop_events WHERE loop_id = ? ORDER BY ts",
    )
    .all(input.id) as Array<{
    id: number;
    ts: string;
    kind: string;
    title: string | null;
    content: string | null;
  }>;
  return { events: rows };
}

export async function resumeAutoLoop(
  db: Db,
  deps: { bridge?: BridgeServer; bus: RpcBus },
  input: { id: number; maxSteps?: number; maxCostUsd?: number },
): Promise<{ id: number }> {
  ensureAutoLoopTables(db);
  const row = db.$raw
    .query(
      "SELECT id, task, status, step_count, replan_count, max_steps, max_cost_usd, goal_id FROM auto_loops WHERE id = ?",
    )
    .get(input.id) as
    | {
        id: number;
        task: string;
        status: string;
        step_count: number;
        replan_count: number;
        max_steps: number;
        max_cost_usd: number;
        goal_id: number | null;
      }
    | undefined;
  if (!row) throw new Error(`auto-loop #${input.id} not found`);
  if (row.status === "running") throw new Error(`auto-loop #${input.id} is already running`);
  if (row.status === "complete") throw new Error(`auto-loop #${input.id} is already complete`);

  // Replay prior step_done events into the in-memory history.
  const events = db.$raw
    .query(
      "SELECT kind, title, content FROM auto_loop_events WHERE loop_id = ? AND kind = 'step_done' ORDER BY id",
    )
    .all(row.id) as Array<{ kind: string; title: string | null; content: string | null }>;
  const history = events.map((e) => ({
    title: e.title ?? "",
    outcome: (e.content ?? "").slice(0, 500),
  }));

  // Apply optional cap overrides; 0 = unlimited.
  const maxSteps = input.maxSteps ?? row.max_steps;
  const maxCost = input.maxCostUsd ?? row.max_cost_usd;
  db.$raw
    .query(
      "UPDATE auto_loops SET status = 'running', finished_at = NULL, last_message = NULL, max_steps = ?, max_cost_usd = ? WHERE id = ?",
    )
    .run(maxSteps, maxCost, row.id);
  logEvent(db, row.id, "resume", "user-resumed", `prior steps: ${row.step_count}, replans: ${row.replan_count}`);
  notify(deps.bus, row.id, "running", `Resuming: ${row.task}`);

  void runLoop(
    db,
    deps,
    row.id,
    row.task,
    maxSteps,
    maxCost,
    row.goal_id ?? undefined,
    { history, stepsDone: row.step_count, replans: row.replan_count },
  ).catch((err) => {
    logEvent(db, row.id, "error", "loop-crashed", (err as Error).message);
    setStatus(db, row.id, "failed", (err as Error).message);
    notify(deps.bus, row.id, "failed", (err as Error).message);
  });
  return { id: row.id };
}

export async function startAutoLoop(
  db: Db,
  deps: { bridge?: BridgeServer; bus: RpcBus },
  input: {
    task: string;
    maxSteps?: number;
    maxCostUsd?: number;
    goalId?: number;
  },
): Promise<{ id: number }> {
  ensureAutoLoopTables(db);
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxCost = input.maxCostUsd ?? DEFAULT_MAX_COST;

  const row = db.$raw
    .query(
      "INSERT INTO auto_loops(task, max_steps, max_cost_usd, goal_id) VALUES(?, ?, ?, ?) RETURNING id",
    )
    .get(input.task, maxSteps, maxCost, input.goalId ?? null) as { id: number };
  const loopId = row.id;

  // Drive the loop in the background — don't block the RPC call.
  void runLoop(db, deps, loopId, input.task, maxSteps, maxCost, input.goalId).catch((err) => {
    logEvent(db, loopId, "error", "loop-crashed", (err as Error).message);
    setStatus(db, loopId, "failed", (err as Error).message);
    notify(deps.bus, loopId, "failed", (err as Error).message);
  });

  notify(deps.bus, loopId, "running", `Starting: ${input.task}`);
  return { id: loopId };
}

async function runLoop(
  db: Db,
  deps: { bridge?: BridgeServer; bus: RpcBus },
  loopId: number,
  task: string,
  maxSteps: number,
  maxCost: number,
  goalId?: number,
  resumeFrom?: {
    history: Array<{ title: string; outcome: string }>;
    stepsDone: number;
    replans: number;
  },
): Promise<void> {
  let cancelled = false;
  activeCancellers.set(loopId, { cancel: () => (cancelled = true) });

  const openai = openaiClient();
  const plannerModel = process.env.PASSIO_MODEL_STANDARD || "gpt-4.1";
  // maxSteps === 0 means unlimited — only the cost cap stops the loop.
  const stepsUnlimited = maxSteps === 0;

  try {
    let queue: Array<{ title: string; prompt: string }>;
    let stepsDone: number;
    let replans: number;
    const history: Array<{ title: string; outcome: string }> = resumeFrom?.history ?? [];

    if (resumeFrom) {
      // Resume: stepsDone/replans track THIS run only. The loop's cumulative
      // step_count/replan_count in the DB use delta updates so the history
      // row keeps growing across resumes.
      stepsDone = 0;
      replans = 0;
      const assess = await assess_(openai, plannerModel, db, task, history);
      logEvent(
        db,
        loopId,
        "assess",
        assess.complete ? "complete" : "resume plan",
        JSON.stringify(assess),
      );
      if (assess.complete) {
        setStatus(db, loopId, "complete", assess.reason);
        notify(deps.bus, loopId, "complete", assess.reason);
        return;
      }
      queue = [...assess.nextSteps];
      replans += 1;
      db.$raw.query("UPDATE auto_loops SET replan_count = replan_count + 1 WHERE id = ?").run(loopId);
      logEvent(db, loopId, "replan", `+${assess.nextSteps.length} steps (resume)`, assess.reason);
      notify(deps.bus, loopId, "replan", `+${assess.nextSteps.length} steps (resume)`);
    } else {
      // ---- Plan phase ----
      const initialPlan = await plan(openai, plannerModel, db, task, [], goalId);
      logEvent(db, loopId, "plan", "initial", JSON.stringify(initialPlan.steps));
      queue = [...initialPlan.steps];
      stepsDone = 0;
      replans = 0;
    }

    while (queue.length > 0 && (stepsUnlimited || stepsDone < maxSteps)) {
      if (cancelled) {
        setStatus(db, loopId, "cancelled", "user cancelled");
        notify(deps.bus, loopId, "cancelled", "user cancelled");
        return;
      }
      const costSoFar = getCost(db, loopId);
      if (costSoFar >= maxCost) {
        setStatus(db, loopId, "cost_cap", `hit cost cap at $${costSoFar.toFixed(3)}`);
        notify(deps.bus, loopId, "cost_cap", `hit cost cap at $${costSoFar.toFixed(3)}`);
        return;
      }

      const step = queue.shift()!;
      logEvent(db, loopId, "step_start", step.title, step.prompt);
      notify(deps.bus, loopId, "step_start", step.title);

      // Run the agent on this sub-prompt. The cost is accumulated via the
      // agent's logUsage call; we read it back after.
      const preCost = sumRecentUsage(db);
      const stepPrompt = buildStepPrompt(task, step, history);
      const result = await runChat(
        db,
        (m, p) => deps.bus.notify(m, p),
        { prompt: stepPrompt, ...(goalId !== undefined ? { goalId } : {}) },
        deps.bridge,
        deps.bus,
      );
      const postCost = sumRecentUsage(db);
      const stepCost = Math.max(0, postCost - preCost);
      addCost(db, loopId, stepCost);

      logEvent(db, loopId, "step_done", step.title, result.text);
      notify(deps.bus, loopId, "step_done", step.title);

      history.push({ title: step.title, outcome: result.text.slice(0, 500) });
      stepsDone += 1;
      db.$raw.query("UPDATE auto_loops SET step_count = step_count + 1 WHERE id = ?").run(loopId);

      // Replan if the queue is empty — assess completion. When steps are
      // unlimited we also remove the replan cap; only cost stops us.
      if (queue.length === 0 && (stepsUnlimited || replans < DEFAULT_MAX_REPLANS)) {
        if (cancelled) break;
        const assess = await assess_(openai, plannerModel, db, task, history);
        logEvent(
          db,
          loopId,
          "assess",
          assess.complete ? "complete" : "needs more",
          JSON.stringify(assess),
        );
        if (assess.complete) {
          setStatus(db, loopId, "complete", assess.reason);
          notify(deps.bus, loopId, "complete", assess.reason);
          return;
        }
        if (assess.nextSteps.length > 0) {
          queue = assess.nextSteps;
          replans += 1;
          db.$raw.query("UPDATE auto_loops SET replan_count = replan_count + 1 WHERE id = ?").run(loopId);
          logEvent(db, loopId, "replan", `+${assess.nextSteps.length} steps`, assess.reason);
          notify(deps.bus, loopId, "replan", `+${assess.nextSteps.length} steps`);
        }
      }
    }

    // Either budget exhausted or we ran out of steps — assess one last time.
    if (!cancelled) {
      const final = await assess_(openai, plannerModel, db, task, history);
      if (final.complete) {
        setStatus(db, loopId, "complete", final.reason);
        notify(deps.bus, loopId, "complete", final.reason);
      } else {
        const status = stepsUnlimited ? "cost_cap" : "step_cap";
        setStatus(db, loopId, status, `stopped after ${stepsDone} steps: ${final.reason}`);
        notify(deps.bus, loopId, status, `stopped after ${stepsDone} steps`);
      }
    }
  } finally {
    activeCancellers.delete(loopId);
  }
}

function buildStepPrompt(
  task: string,
  step: { title: string; prompt: string },
  history: Array<{ title: string; outcome: string }>,
): string {
  const historyBlock = history
    .slice(-5)
    .map((h) => `  ✓ ${h.title} → ${h.outcome.slice(0, 180)}`)
    .join("\n");
  return [
    `You are operating inside an autonomous loop on behalf of the user.`,
    `Overall task: ${task}`,
    `Current step: ${step.title}`,
    ``,
    `Do just this step. Use tools (vault, memory, todos, browser, etc.) as needed.`,
    `When the step is done, reply with a 1-paragraph summary of what you did.`,
    history.length ? `\nPrevious steps:\n${historyBlock}` : "",
    ``,
    step.prompt,
  ]
    .filter(Boolean)
    .join("\n");
}

async function plan(
  openai: ReturnType<typeof createOpenAI>,
  model: string,
  db: Db,
  task: string,
  history: Array<{ title: string; outcome: string }>,
  goalId?: number,
): Promise<z.infer<typeof PlanSchema>> {
  const prompt = [
    `Plan sub-steps to complete this task:`,
    `"${task}"`,
    history.length
      ? `\nAlready done:\n${history.map((h) => `- ${h.title}`).join("\n")}`
      : "",
    `\nRules:`,
    `- Each step must be concrete and individually executable.`,
    `- Order matters; list in execution order.`,
    `- 1–6 steps for the next batch.`,
    `- For each step: title (short, imperative) + prompt (what the executor should do).`,
    goalId ? `- Context: this ties to goal #${goalId}.` : "",
  ].filter(Boolean).join("\n");
  const { object, usage } = await generateObject({
    model: openai(model),
    schema: PlanSchema,
    prompt,
  });
  logUsage(db, {
    tier: tierFor(model),
    model,
    inTokens: usage?.inputTokens ?? 0,
    outTokens: usage?.outputTokens ?? 0,
  });
  return object;
}

async function assess_(
  openai: ReturnType<typeof createOpenAI>,
  model: string,
  db: Db,
  task: string,
  history: Array<{ title: string; outcome: string }>,
): Promise<z.infer<typeof AssessSchema>> {
  const prompt = [
    `Assess whether this task is 100% done:`,
    `Task: "${task}"`,
    `\nWhat's been completed:`,
    ...history.map((h, i) => `${i + 1}. ${h.title} — ${h.outcome.slice(0, 200)}`),
    ``,
    `Return:`,
    `- complete: true ONLY if nothing meaningful is left.`,
    `- reason: short justification.`,
    `- nextSteps: if not complete, list the next batch (1–6 steps).`,
  ].join("\n");
  const { object, usage } = await generateObject({
    model: openai(model),
    schema: AssessSchema,
    prompt,
  });
  logUsage(db, {
    tier: tierFor(model),
    model,
    inTokens: usage?.inputTokens ?? 0,
    outTokens: usage?.outputTokens ?? 0,
  });
  return object;
}

function tierFor(model: string): "economy" | "standard" | "power" | "reasoning" {
  if (/o3|o1/.test(model)) return "reasoning";
  if (/gpt-5|opus/.test(model)) return "power";
  if (/mini|haiku|nano/.test(model)) return "economy";
  return "standard";
}

function openaiClient() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

function logEvent(db: Db, loopId: number, kind: string, title: string | null, content: string | null) {
  db.$raw
    .query("INSERT INTO auto_loop_events(loop_id, kind, title, content) VALUES(?, ?, ?, ?)")
    .run(loopId, kind, title, content);
}

function setStatus(db: Db, loopId: number, status: string, lastMessage: string) {
  db.$raw
    .query(
      "UPDATE auto_loops SET status = ?, last_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .run(status, lastMessage, loopId);
}

function addCost(db: Db, loopId: number, amount: number) {
  db.$raw.query("UPDATE auto_loops SET cost_usd = cost_usd + ? WHERE id = ?").run(amount, loopId);
}

function getCost(db: Db, loopId: number): number {
  const r = db.$raw.query("SELECT cost_usd FROM auto_loops WHERE id = ?").get(loopId) as
    | { cost_usd: number }
    | undefined;
  return r?.cost_usd ?? 0;
}

function sumRecentUsage(db: Db): number {
  try {
    const r = db.$raw
      .query("SELECT COALESCE(SUM(dollars), 0) AS total FROM usage_log")
      .get() as { total: number };
    return r.total;
  } catch {
    return 0;
  }
}

function notify(bus: RpcBus, loopId: number, status: string, message: string) {
  bus.notify("passio.autoLoop.update", { id: loopId, status, message });
}
