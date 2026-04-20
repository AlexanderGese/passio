import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { milestones } from "../db/schema.js";
import { todoAdd } from "../tools/memory.js";

/**
 * Split a milestone into 3–8 concrete todos with spaced deadlines. Uses
 * the power tier because plans benefit from reasoning. Each todo is an
 * observable deliverable — no vague "think about X" entries.
 */

const TodoListSchema = z.object({
  todos: z
    .array(
      z.object({
        text: z.string().min(3).max(140),
        due_offset_days: z.number().int().min(0).max(365),
        priority: z.number().int().min(0).max(3),
      }),
    )
    .min(3)
    .max(8),
});

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

export async function milestoneToTodos(
  db: Db,
  input: { milestone_id: number },
): Promise<{ added: number; todoIds: number[] }> {
  const [m] = await db.select().from(milestones).where(eq(milestones.id, input.milestone_id));
  if (!m) throw new Error(`milestone ${input.milestone_id} not found`);

  const today = new Date();
  const due = m.dueDate ? new Date(m.dueDate) : null;
  const daysToMilestone =
    due !== null ? Math.max(1, Math.round((due.getTime() - today.getTime()) / 86_400_000)) : 30;

  const model = process.env.PASSIO_MODEL_POWER || "gpt-5";
  const { object } = await generateObject({
    model: openai()(model),
    schema: TodoListSchema,
    system:
      "You are a task planner. Split a goal milestone into 3-8 observable, checkable todos. " +
      "Each todo must start with a verb and describe a single concrete deliverable — never 'think about', 'consider', 'learn about' without a tangible output. " +
      "Distribute due_offset_days across the available window so earlier todos unlock later ones. Priority: 3 = blocking, 2 = important, 1 = normal, 0 = nice-to-have.",
    prompt: [
      `Milestone: ${m.title}`,
      m.description ? `Description: ${m.description}` : null,
      `Days until milestone due: ${daysToMilestone}`,
      `Today: ${today.toISOString().slice(0, 10)}`,
      ``,
      `Generate concrete todos. due_offset_days must be between 0 and ${daysToMilestone} (inclusive).`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const todoIds: number[] = [];
  for (const t of object.todos) {
    const dueIso = new Date(today.getTime() + t.due_offset_days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { id } = await todoAdd(db, {
      text: t.text,
      due_at: dueIso,
      priority: t.priority,
    });
    todoIds.push(id);
    // Link back to goal + milestone so the Goals panel can show them as
    // associated work and progress is traceable.
    db.$raw
      .query("UPDATE todos SET goal_id = ?, milestone_id = ? WHERE id = ?")
      .run(m.goalId, m.id, id);
  }

  return { added: todoIds.length, todoIds };
}
