import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { activityStats } from "../tools/system.js";
import { getIntent } from "../tools/memory.js";
import { logUsage } from "../tools/cost.js";

/**
 * What-next picker. User taps a button and Passio picks their single
 * highest-leverage action right now based on goals, todos, time-of-day,
 * and current activity. Returns a pick + short justification.
 */

const PickSchema = z.object({
  action: z.string(),
  why: z.string(),
  todoId: z.number().nullable(),
});

export async function whatNext(db: Db): Promise<{ action: string; why: string; todoId: number | null }> {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    return { action: "Set an OpenAI key in Settings to enable this.", why: "no api key", todoId: null };
  }
  const act = activityStats(db);
  const intent = getIntent(db);
  const todos = db.$raw
    .query(
      `SELECT id, text, priority, due_at AS dueAt FROM todos WHERE done = 0
       ORDER BY (CASE WHEN due_at < date('now') THEN 99 ELSE priority END) DESC LIMIT 15`,
    )
    .all() as Array<{ id: number; text: string; priority: number; dueAt: string | null }>;
  const goals = db.$raw
    .query(
      "SELECT id, title, target_date AS targetDate FROM goals WHERE status = 'active' LIMIT 5",
    )
    .all() as Array<{ id: number; title: string; targetDate: string | null }>;

  const now = new Date();
  const time = now.toTimeString().slice(0, 5);
  const prompt = `Pick the single most useful next action for the user right now.

Time: ${time}
Intent today: ${intent?.text ?? "(not set)"}
Current app: ${act.currentApp ?? "unknown"} (${act.streakDistractionMin}min distraction streak)

Goals:
${goals.map((g) => `- #${g.id} ${g.title}${g.targetDate ? ` (due ${g.targetDate})` : ""}`).join("\n") || "(none)"}

Open todos:
${todos.map((t) => `- #${t.id} [P${t.priority}] ${t.text}${t.dueAt ? ` (due ${t.dueAt})` : ""}`).join("\n") || "(none)"}

Return:
- action: one short sentence — what to do right now
- why: one short sentence — why this beats alternatives
- todoId: if the pick maps to an existing todo, its id; else null`;

  const openai = createOpenAI({ apiKey: key });
  const model = process.env.PASSIO_MODEL_ECONOMY || "gpt-4o-mini";
  const { object, usage } = await generateObject({
    model: openai(model),
    schema: PickSchema,
    prompt,
  });
  logUsage(db, {
    tier: "economy",
    model,
    inTokens: usage?.inputTokens ?? 0,
    outTokens: usage?.outputTokens ?? 0,
  });
  return { action: object.action, why: object.why, todoId: object.todoId };
}
