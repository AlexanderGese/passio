import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { events, goals, todos } from "../db/schema.js";

/**
 * End-of-day recap + start-of-day briefing. Both use the economy tier.
 * Recap writes to events (summary visible in activity log); briefing
 * just returns text for the bubble.
 */

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

function economyModel(): string {
  return process.env.PASSIO_MODEL_ECONOMY || "gpt-4o-mini";
}

async function dayBounds(date?: string): Promise<{ start: string; end: string; dateStr: string }> {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return {
    start: `${d} 00:00:00`,
    end: `${d} 23:59:59`,
    dateStr: d,
  };
}

export async function dailyRecap(
  db: Db,
  input: { date?: string } = {},
): Promise<{ dateStr: string; recap: string }> {
  const { start, end, dateStr } = await dayBounds(input.date);

  const todaysEvents = await db
    .select()
    .from(events)
    .where(and(gte(events.ts, start), lte(events.ts, end)));

  const completedTodos = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.done, true),
        gte(todos.completedAt, start),
        lte(todos.completedAt, end),
      ),
    );

  const activeGoals = await db.select().from(goals).where(eq(goals.status, "active"));

  const eventSummary = summariseEventsByKind(todaysEvents);
  const todoLines = completedTodos.map((t) => `  • ${t.text}`).join("\n") || "  (none)";
  const goalLines = activeGoals
    .slice(0, 5)
    .map((g) => `  • ${g.title} — ${Math.round(g.progress * 100)}%`)
    .join("\n") || "  (none)";

  const hasKey = Boolean(process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  let recap: string;
  if (!hasKey) {
    recap = [
      `Passio daily recap — ${dateStr}`,
      `Events by kind: ${eventSummary || "(none)"}`,
      `Todos completed (${completedTodos.length}):`,
      todoLines,
      `Active goals:`,
      goalLines,
    ].join("\n");
  } else {
    const { text } = await generateText({
      model: openai()(economyModel()),
      system:
        "You are Passio writing a warm, one-paragraph evening recap for the user. 3–5 sentences. Acknowledge what got done, name the biggest open loop, and end with one encouraging line. No bullet lists in the output.",
      prompt: [
        `Date: ${dateStr}`,
        `Events today by kind: ${eventSummary || "none"}`,
        `Todos completed today:`,
        todoLines,
        `Active goals:`,
        goalLines,
      ].join("\n"),
    });
    recap = text.trim();
  }

  await db.insert(events).values({
    kind: "chat",
    content: JSON.stringify({ kind: "daily_recap", dateStr }),
    summary: `Daily recap: ${recap.slice(0, 100)}…`,
    importance: 4,
  });

  return { dateStr, recap };
}

export async function morningBriefing(db: Db): Promise<{ briefing: string }> {
  const today = new Date().toISOString().slice(0, 10);

  const openTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.done, false))
    .limit(20);

  const prioritised = openTodos
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  const activeGoals = await db.select().from(goals).where(eq(goals.status, "active"));
  const withMilestones = await Promise.all(
    activeGoals.slice(0, 3).map(async (g) => {
      const next = db.$raw
        .query(
          `SELECT title, due_date FROM milestones
           WHERE goal_id = ? AND status != 'done'
           ORDER BY due_date ASC LIMIT 1`,
        )
        .get(g.id) as { title: string; due_date: string | null } | undefined;
      return {
        title: g.title,
        progress: g.progress,
        next: next?.title ?? null,
        nextDate: next?.due_date ?? null,
      };
    }),
  );

  const hasKey = Boolean(process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  if (!hasKey) {
    const lines: string[] = [`Good morning — ${today}`];
    if (prioritised.length) {
      lines.push("Today's top tasks:");
      for (const t of prioritised) {
        lines.push(`  • [p${t.priority}] ${t.text}${t.dueAt ? ` (due ${t.dueAt})` : ""}`);
      }
    }
    if (withMilestones.length) {
      lines.push("Goal progress:");
      for (const g of withMilestones) {
        lines.push(
          `  • ${g.title} — ${Math.round(g.progress * 100)}%` +
            (g.next ? ` — next: ${g.next}${g.nextDate ? ` (${g.nextDate})` : ""}` : ""),
        );
      }
    }
    return { briefing: lines.join("\n") };
  }

  const { text } = await generateText({
    model: openai()(economyModel()),
    system:
      "You are Passio writing a morning briefing for the user. 3–4 sentences. Lead with the most consequential thing. Mention 2 goal-linked actions. Keep it actionable and warm. No bullet lists.",
    prompt: [
      `Date: ${today}`,
      `Open todos by priority:`,
      prioritised
        .map((t) => `  • [p${t.priority}] ${t.text}${t.dueAt ? ` (due ${t.dueAt})` : ""}`)
        .join("\n") || "  (none)",
      `Active goals with next milestones:`,
      withMilestones
        .map(
          (g) =>
            `  • ${g.title} — ${Math.round(g.progress * 100)}%` +
            (g.next ? ` — next: ${g.next}${g.nextDate ? ` (${g.nextDate})` : ""}` : ""),
        )
        .join("\n") || "  (none)",
    ].join("\n"),
  });
  return { briefing: text.trim() };
}

function summariseEventsByKind(rows: (typeof events.$inferSelect)[]): string {
  const counts = new Map<string, number>();
  for (const e of rows) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return [...counts.entries()].map(([k, n]) => `${k}×${n}`).join(", ");
}
