import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import type { BridgeServer } from "../bridge/server.js";
import type { Db } from "../db/client.js";
import { events, goals, settings as settingsTable, todos } from "../db/schema.js";
import { getIntent } from "../tools/memory.js";

/**
 * Proactive scanner. Runs on every scheduler tick OR when the user forces
 * one via Super+Shift+N. Builds a lean context packet (current tab,
 * top goals, open todos, intent, active pack, recent activity) and asks
 * the economy-tier model to pick one of `quiet | nudge | act`.
 *
 * The scanner is a pure "decision" function — it does not, itself, perform
 * actions. If it returns `act`, the caller is expected to route the
 * proposed call through the countdown-cancel toast before executing.
 */

export const ScanDecision = z.object({
  decision: z.enum(["quiet", "nudge", "act"]),
  reason: z.string().max(200),
  /** Optional message to surface in the bubble when `nudge` or `act`. */
  message: z.string().max(280).optional(),
  /** For `act`, which registered tool the scanner wants to invoke and with what args. */
  proposed_tool: z.string().optional(),
  proposed_args: z.record(z.unknown()).optional(),
});
export type ScanDecision = z.infer<typeof ScanDecision>;

const DEFAULT_DISTRACTING = [
  "twitter.com",
  "x.com",
  "reddit.com",
  "tiktok.com",
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "news.ycombinator.com",
];

export interface ScanOptions {
  reason: "cron" | "manual" | "force";
  mode: "check-in" | "active-assist" | "summary-decide";
  pack: "work" | "study" | "chill" | "custom";
  dndUntil: string | null;
  distractingDomains?: string[];
}

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}
function economyModel(): string {
  return process.env.PASSIO_MODEL_ECONOMY || "gpt-4o-mini";
}

export async function scan(
  db: Db,
  bridge: BridgeServer,
  opts: ScanOptions,
): Promise<ScanDecision> {
  // DND short-circuit — no network call, no cost.
  if (opts.dndUntil && new Date(opts.dndUntil).getTime() > Date.now()) {
    const decision: ScanDecision = { decision: "quiet", reason: "DND active" };
    await recordScanEvent(db, opts, decision);
    return decision;
  }

  const ctx = await buildContext(db, bridge, opts);

  // If the API key isn't configured, we can still log a scan event with
  // a deterministic "quiet" decision. This keeps dev usable without a key.
  const hasKey = Boolean(process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  if (!hasKey) {
    const decision: ScanDecision = {
      decision: "quiet",
      reason: "no OpenAI key — running in silent dev mode",
    };
    await recordScanEvent(db, opts, decision);
    return decision;
  }

  const prompt = buildPrompt(opts, ctx);
  const result = await generateObject({
    model: openai()(economyModel()),
    schema: ScanDecision,
    system:
      "You are the ambient 'scan' layer of Passio. You decide whether to nudge, act, or stay quiet. Favor silence — only nudge when clearly useful. Never nag. 1 message max, <280 chars.",
    prompt,
  });

  const decision = result.object;
  // Enforce mode constraint: `check-in` mode never produces `act`.
  if (opts.mode === "check-in" && decision.decision === "act") {
    decision.decision = "nudge";
  }
  await recordScanEvent(db, opts, decision);
  return decision;
}

interface ScanContext {
  tab: { url: string; title: string } | null;
  goals: Array<{ title: string; category: string | null; progress: number; nearestMilestone: string | null; daysToDeadline: number | null }>;
  openTodos: Array<{ text: string; priority: number; dueAt: string | null }>;
  intent: string | null;
  recentEvents: Array<{ ts: string; kind: string; summary: string }>;
  onDistractingSite: string | null;
}

async function buildContext(db: Db, bridge: BridgeServer, opts: ScanOptions): Promise<ScanContext> {
  let tab: { url: string; title: string } | null = null;
  if (bridge.clients() > 0) {
    try {
      const { url, title } = (await bridge.request("get_current_tab", {}, 5_000)) as {
        url: string;
        title: string;
      };
      tab = { url, title };
    } catch {
      /* extension isn't paired or tab isn't accessible; skip */
    }
  }

  const activeGoals = await db
    .select()
    .from(goals)
    .where(eq(goals.status, "active"))
    .orderBy(desc(goals.priority))
    .limit(3);

  const goalsWithMilestones = await Promise.all(
    activeGoals.map(async (g) => {
      const nearest = await db.$raw
        .query(
          `SELECT title, due_date FROM milestones
           WHERE goal_id = ? AND status != 'done'
           ORDER BY due_date ASC LIMIT 1`,
        )
        .get(g.id) as { title: string; due_date: string | null } | undefined;
      const daysToDeadline = g.targetDate ? daysBetween(new Date(), new Date(g.targetDate)) : null;
      return {
        title: g.title,
        category: g.category,
        progress: g.progress,
        nearestMilestone: nearest?.title ?? null,
        daysToDeadline,
      };
    }),
  );

  const openRows = await db.select().from(todos).where(eq(todos.done, false)).limit(10);
  const openTodos = openRows
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((t) => ({ text: t.text, priority: t.priority, dueAt: t.dueAt ?? null }));

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await db
    .select({ ts: events.ts, kind: events.kind, summary: events.summary })
    .from(events)
    .where(gte(events.ts, oneHourAgo))
    .orderBy(desc(events.ts))
    .limit(12);
  const recentEvents = recent
    .filter((e): e is { ts: string; kind: string; summary: string } => Boolean(e.summary))
    .map((e) => ({ ts: e.ts, kind: e.kind, summary: e.summary }));

  const distracting = opts.distractingDomains ?? DEFAULT_DISTRACTING;
  const onDistractingSite = tab
    ? distracting.find((d) => tab!.url.includes(d)) ?? null
    : null;

  const intentRow = getIntent(db);
  const intent = intentRow?.text ?? null;

  return {
    tab,
    goals: goalsWithMilestones,
    openTodos,
    intent,
    recentEvents,
    onDistractingSite,
  };
}

function buildPrompt(opts: ScanOptions, ctx: ScanContext): string {
  const pack = {
    work: "User is in WORK mode — respect focus time, keep interruptions minimal.",
    study: "User is in STUDY mode — encourage deep practice on active learning goals.",
    chill: "User is in CHILL mode — don't nudge unless something is urgent (overdue milestone, unanswered message).",
    custom: "",
  }[opts.pack];

  const modeNote = {
    "check-in": "You may only NUDGE or STAY QUIET. Never propose autonomous actions.",
    "active-assist": "You may NUDGE, PROPOSE AN ACTION, or STAY QUIET.",
    "summary-decide": "Prefer compact summaries. Only nudge if clearly useful.",
  }[opts.mode];

  const lines: string[] = [];
  lines.push(`Mode: ${opts.mode}. Pack: ${opts.pack}. Reason: ${opts.reason}.`);
  if (pack) lines.push(pack);
  lines.push(modeNote);

  if (ctx.intent) lines.push(`User's daily intent: "${ctx.intent}"`);
  if (ctx.tab) {
    lines.push(`Current tab: ${ctx.tab.title} — ${ctx.tab.url}`);
    if (ctx.onDistractingSite) {
      lines.push(`⚠ This domain (${ctx.onDistractingSite}) is on the distracting-sites list.`);
    }
  } else {
    lines.push("No current tab info (extension likely not paired).");
  }

  if (ctx.goals.length) {
    lines.push("Active goals:");
    for (const g of ctx.goals) {
      const parts = [
        `  • ${g.title}`,
        g.category ? `[${g.category}]` : null,
        ` (${Math.round(g.progress * 100)}%)`,
        g.nearestMilestone ? ` next: ${g.nearestMilestone}` : null,
        g.daysToDeadline !== null
          ? g.daysToDeadline < 0
            ? ` — ${-g.daysToDeadline}d OVERDUE`
            : ` — ${g.daysToDeadline}d to target`
          : null,
      ];
      lines.push(parts.filter(Boolean).join(""));
    }
  } else {
    lines.push("No active goals.");
  }

  if (ctx.openTodos.length) {
    lines.push("Open todos (top 5):");
    for (const t of ctx.openTodos) {
      lines.push(`  • [p${t.priority}] ${t.text}${t.dueAt ? ` (due ${t.dueAt})` : ""}`);
    }
  }

  if (ctx.recentEvents.length) {
    lines.push("Recent activity (last hour):");
    for (const e of ctx.recentEvents.slice(0, 8)) {
      lines.push(`  • ${e.ts} ${e.kind}: ${e.summary}`);
    }
  }

  lines.push("");
  lines.push(
    "Decide: QUIET (nothing useful to say), NUDGE (one short message, no tool), or ACT (propose a specific tool call to run via the countdown gate).",
  );

  return lines.join("\n");
}

async function recordScanEvent(db: Db, opts: ScanOptions, decision: ScanDecision): Promise<void> {
  try {
    await db.insert(events).values({
      kind: "scan",
      content: JSON.stringify({ opts, decision }),
      summary: `[${opts.pack}/${opts.mode}] ${decision.decision}${
        decision.message ? `: ${decision.message}` : ""
      }`,
      importance: decision.decision === "quiet" ? 0 : 2,
    });
  } catch {
    /* audit is best-effort */
  }
}

function daysBetween(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  const da = new Date(a.toISOString().slice(0, 10));
  const db = new Date(b.toISOString().slice(0, 10));
  return Math.round((db.getTime() - da.getTime()) / MS);
}

void settingsTable; // reserved for future direct reads; preserved for cross-file intent
