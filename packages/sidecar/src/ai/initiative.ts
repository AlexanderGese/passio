import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { goals, todos } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { activityStats } from "../tools/system.js";
import { getIntent } from "../tools/memory.js";

/**
 * Initiative pulse. Every 15 min Passio looks at:
 *   • active window + distraction streak
 *   • current intent, top goals, overdue milestones, due todos
 *   • time of day
 * …and decides: should I speak up, and what's the most useful thing to say?
 *
 * Output is a single short sentence (or null for "shut up"). The scheduler
 * surfaces the message via a bubble-state alert if non-null, which then
 * gets spoken + desktop-notified via the existing plumbing.
 *
 * Unlike the 7-min scanner (which is tab-focused), the pulse is life-focused:
 * it considers the whole day.
 */

const PulseSchema = z.object({
  say: z.string().nullable(),
  reason: z.string().max(200),
});

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

function economy(): string {
  return process.env.PASSIO_MODEL_ECONOMY || "gpt-4o-mini";
}

export async function initiativePulse(db: Db): Promise<{ message: string | null }> {
  const act = activityStats(db);
  const intent = getIntent(db);
  const openGoals = (await db.select().from(goals).where(eq(goals.status, "active"))).slice(0, 3);
  const openTodos = (
    (await db.select().from(todos).where(eq(todos.done, false))) as Array<{
      text: string;
      priority: number;
      dueAt: string | null;
    }>
  )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  const hour = new Date().getHours();
  const tod =
    hour < 6 ? "late night" : hour < 11 ? "morning" : hour < 14 ? "midday" : hour < 18 ? "afternoon" : "evening";

  const prompt = [
    `You decide whether Passio should speak up right now, unprompted.`,
    `Bias heavily toward SILENCE — if you say something every 15 min you become noise.`,
    `Only speak if there's real value: the user is stuck, drifting, missing a deadline, or hitting a great moment.`,
    ``,
    `Context:`,
    `- Time of day: ${tod} (${hour}h)`,
    `- Active app: ${act.currentApp ?? "(nothing)"}`,
    act.currentTitle ? `- Window: ${act.currentTitle}` : "",
    `- Distraction streak: ${act.streakDistractionMin}min`,
    `- Today so far: work ${Math.round(act.today.work / 60)}m, distraction ${Math.round(act.today.distraction / 60)}m, idle ${Math.round(act.today.idle / 60)}m`,
    intent ? `- Daily intent: "${intent.text}"` : "- No daily intent set",
    openGoals.length ? `- Active goals: ${openGoals.map((g) => g.title).join("; ")}` : "",
    openTodos.length ? `- Top todos: ${openTodos.map((t) => t.text).join("; ")}` : "",
    ``,
    `If you do speak, one sentence, warm and direct, under 180 chars. Use "you".`,
    `Return null in "say" if silence is correct.`,
  ]
    .filter(Boolean)
    .join("\n");

  const hasKey = Boolean(process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  if (!hasKey) return { message: null };

  try {
    const { object } = await generateObject({
      model: openai()(economy()),
      schema: PulseSchema,
      system:
        "You are Passio's initiative layer. Warm, brief, high signal. Err on silence. Never generic ('how can I help?'). Pull on the context hook that's most relevant NOW.",
      prompt,
    });
    return { message: object.say };
  } catch {
    return { message: null };
  }
}
