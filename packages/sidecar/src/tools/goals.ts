import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { goalReviews, goals, milestones } from "../db/schema.js";
import { decompose, type Decomposition } from "../ai/decompose.js";

/**
 * Goals subsystem: creation, auto-decomposition into milestones, progress,
 * reviews. The LLM-facing tool set is defined in `src/ai/agent.ts`; this
 * file owns the data-plane logic and is exercised by unit tests without
 * network calls (decomposition can be injected for tests).
 */

type Decomposer = typeof decompose;

export interface GoalCreateInput {
  title: string;
  description?: string;
  category?:
    | "education"
    | "career"
    | "health"
    | "creative"
    | "language"
    | "financial"
    | "entrepreneurship"
    | "personal";
  target_date: string; // YYYY-MM-DD
  motivation?: string;
  auto_decompose?: boolean; // default true
}

export async function goalCreate(
  db: Db,
  input: GoalCreateInput,
  decomposer: Decomposer = decompose,
): Promise<{ id: number; decomposition?: Decomposition }> {
  const [row] = await db
    .insert(goals)
    .values({
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? null,
      targetDate: input.target_date,
      motivation: input.motivation ?? null,
      status: "active",
      priority: 1,
      progress: 0,
    })
    .returning({ id: goals.id });
  if (!row) throw new Error("goal insert returned no row");

  let decomposition: Decomposition | undefined;
  if (input.auto_decompose !== false) {
    try {
      decomposition = await decomposer({
        title: input.title,
        description: input.description ?? null,
        motivation: input.motivation ?? null,
        category: input.category,
        target_date: input.target_date,
      });
      await insertMilestones(db, row.id, decomposition.milestones);
    } catch (err) {
      // Decomposition is best-effort; goal is still created.
      console.error(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "passio.log",
          params: {
            level: "warn",
            message: `auto-decompose failed for goal ${row.id}: ${(err as Error).message}`,
          },
        }),
      );
    }
  }

  return { id: row.id, ...(decomposition ? { decomposition } : {}) };
}

async function insertMilestones(
  db: Db,
  goalId: number,
  items: { title: string; description?: string; due_date: string }[],
): Promise<void> {
  if (items.length === 0) return;
  await db.insert(milestones).values(
    items.map((m, i) => ({
      goalId,
      title: m.title,
      description: m.description ?? null,
      dueDate: m.due_date,
      status: "pending" as const,
      sortOrder: i,
    })),
  );
}

export async function goalList(
  db: Db,
  input: { status?: "active" | "paused" | "achieved" | "abandoned" | "all" },
): Promise<{ goals: (typeof goals.$inferSelect & { milestones: (typeof milestones.$inferSelect)[] })[] }> {
  const filter = input.status ?? "active";
  const base = db.select().from(goals);
  const rows =
    filter === "all"
      ? await base.orderBy(desc(goals.priority), desc(goals.createdAt))
      : await base.where(eq(goals.status, filter)).orderBy(desc(goals.priority), desc(goals.createdAt));

  const out = [] as Awaited<ReturnType<typeof goalList>>["goals"];
  for (const g of rows) {
    const ms = await db
      .select()
      .from(milestones)
      .where(eq(milestones.goalId, g.id))
      .orderBy(milestones.sortOrder, milestones.dueDate);
    out.push({ ...g, milestones: ms });
  }
  return { goals: out };
}

export async function goalUpdate(
  db: Db,
  input: {
    id: number;
    fields: Partial<{
      title: string;
      description: string;
      category: string;
      targetDate: string;
      status: "active" | "paused" | "achieved" | "abandoned";
      priority: number;
      motivation: string;
    }>;
  },
): Promise<{ ok: true }> {
  const setObj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.fields)) {
    if (v !== undefined) setObj[k] = v;
  }
  if (Object.keys(setObj).length === 0) return { ok: true };
  await db.update(goals).set(setObj).where(eq(goals.id, input.id));
  return { ok: true };
}

export async function goalDecompose(
  db: Db,
  input: { id: number; replace?: boolean },
  decomposer: Decomposer = decompose,
): Promise<{ decomposition: Decomposition }> {
  const [g] = await db.select().from(goals).where(eq(goals.id, input.id));
  if (!g) throw new Error(`goal ${input.id} not found`);
  if (!g.targetDate) throw new Error(`goal ${input.id} has no target_date; cannot decompose`);
  const decomposition = await decomposer({
    title: g.title,
    description: g.description,
    motivation: g.motivation,
    category: (g.category as GoalCreateInput["category"]) ?? undefined,
    target_date: g.targetDate,
  });
  if (input.replace) {
    await db.delete(milestones).where(eq(milestones.goalId, input.id));
  }
  await insertMilestones(db, input.id, decomposition.milestones);
  await recomputeProgress(db, input.id);
  return { decomposition };
}

export async function milestoneAdd(
  db: Db,
  input: { goal_id: number; title: string; description?: string; due_date?: string; sort_order?: number },
): Promise<{ id: number }> {
  const [row] = await db
    .insert(milestones)
    .values({
      goalId: input.goal_id,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.due_date ?? null,
      sortOrder: input.sort_order ?? 0,
    })
    .returning({ id: milestones.id });
  if (!row) throw new Error("milestone insert returned no row");
  await recomputeProgress(db, input.goal_id);
  return { id: row.id };
}

/**
 * Delete a goal permanently (and its milestones via cascade). Use
 * goalUpdate({ status: 'abandoned' }) for soft delete.
 */
export async function goalDelete(db: Db, input: { id: number }): Promise<{ ok: true }> {
  await db.delete(goals).where(eq(goals.id, input.id));
  return { ok: true };
}

export async function milestoneDone(db: Db, input: { id: number }): Promise<{ ok: true; progress: number }> {
  const [m] = await db.select().from(milestones).where(eq(milestones.id, input.id));
  if (!m) throw new Error(`milestone ${input.id} not found`);
  await db
    .update(milestones)
    .set({ status: "done", completedAt: new Date().toISOString() })
    .where(eq(milestones.id, input.id));
  const progress = await recomputeProgress(db, m.goalId);
  return { ok: true, progress };
}

export async function milestoneReschedule(
  db: Db,
  input: { id: number; new_date: string },
): Promise<{ ok: true }> {
  await db.update(milestones).set({ dueDate: input.new_date }).where(eq(milestones.id, input.id));
  return { ok: true };
}

export async function goalReview(
  db: Db,
  input: { id: number; kind?: "weekly" | "monthly" | "ad-hoc" | "deadline-approaching" },
): Promise<{ id: number; summary: string }> {
  const [g] = await db.select().from(goals).where(eq(goals.id, input.id));
  if (!g) throw new Error(`goal ${input.id} not found`);
  const ms = await db.select().from(milestones).where(eq(milestones.goalId, input.id));
  const done = ms.filter((m) => m.status === "done");
  const overdue = ms.filter(
    (m) =>
      m.status !== "done" && m.dueDate && m.dueDate < new Date().toISOString().slice(0, 10),
  );
  const next = ms
    .filter((m) => m.status !== "done")
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];

  const summary = [
    `Goal: ${g.title}`,
    `Progress: ${Math.round((g.progress ?? 0) * 100)}% (${done.length}/${ms.length} milestones)`,
    overdue.length ? `Overdue: ${overdue.map((m) => m.title).join(", ")}` : "No overdue milestones.",
    next ? `Next: ${next.title}${next.dueDate ? ` (due ${next.dueDate})` : ""}` : "No pending milestones.",
  ].join("\n");

  const [row] = await db
    .insert(goalReviews)
    .values({
      goalId: input.id,
      kind: input.kind ?? "ad-hoc",
      summary,
      blockers: JSON.stringify(overdue.map((m) => m.title)),
      nextActions: next ? JSON.stringify([next.title]) : null,
    })
    .returning({ id: goalReviews.id });
  if (!row) throw new Error("goal_review insert returned no row");

  await db
    .update(goals)
    .set({ lastReviewed: new Date().toISOString() })
    .where(eq(goals.id, input.id));

  return { id: row.id, summary };
}

/** Recompute progress = done / total. Returns new progress value. */
export async function recomputeProgress(db: Db, goalId: number): Promise<number> {
  const row = db.$raw
    .query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done
       FROM milestones WHERE goal_id = ?`,
    )
    .get(goalId) as { total: number; done: number } | undefined;
  const total = row?.total ?? 0;
  const done = row?.done ?? 0;
  const progress = total === 0 ? 0 : done / total;
  await db.update(goals).set({ progress }).where(eq(goals.id, goalId));
  if (progress >= 1) {
    await db.update(goals).set({ status: "achieved" }).where(eq(goals.id, goalId));
  }
  return progress;
}

// keep drizzle helpers reachable for follow-up edits
void and;
void sql;
