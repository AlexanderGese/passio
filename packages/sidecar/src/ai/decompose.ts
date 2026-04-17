import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Ambitious-goal decomposer. Given a goal title and target date, returns
 * 5–12 milestones with reverse-engineered due dates. Uses a category-aware
 * prompt library; the model defaults to the "power" tier for stronger
 * planning ability.
 */

export const Category = z
  .enum([
    "education",
    "career",
    "health",
    "creative",
    "language",
    "financial",
    "entrepreneurship",
    "personal",
  ])
  .describe("Domain of the goal — selects the decomposition prompt.");

const MilestoneSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("ISO date YYYY-MM-DD, must be <= target_date"),
});

export const DecompositionSchema = z.object({
  rationale: z
    .string()
    .max(600)
    .describe("2–4 sentence explanation of the plan — why this breakdown, what's the critical path."),
  milestones: z.array(MilestoneSchema).min(3).max(12),
});

export type Decomposition = z.infer<typeof DecompositionSchema>;

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

function powerModel(): string {
  return process.env.PASSIO_MODEL_POWER || "gpt-5";
}

const CATEGORY_GUIDE: Record<z.infer<typeof Category>, string> = {
  education:
    "Cover admissions / qualifications: exams (e.g. SAT/ACT/GRE), coursework / GPA markers, extracurriculars or research, letters of recommendation, essay drafting & editing, applications, interviews, and visa/financial planning when relevant.",
  career:
    "Cover the hiring funnel: skill gap analysis, portfolio/projects, network-building, resume/LinkedIn polish, targeted applications, referral outreach, interview prep, offer negotiation.",
  health:
    "Progressive load plan: baseline assessment, volume ramp, technique checkpoints, nutrition strategy, recovery protocol, benchmark tests, race/event milestone.",
  creative:
    "Iterative output plan: outline / treatment, draft 1, revision + external feedback, polish, publish/release; optionally sub-milestones per chapter/track/scene.",
  language:
    "Progressive proficiency plan: grammar foundation, vocab target, listening & speaking checkpoints, mock exam at target level (CEFR / JLPT / HSK / DELE etc), exam registration and sit.",
  financial:
    "Savings/income plan: baseline, budget + savings rate, income side-projects or raises, investment allocation, tax planning, milestone net-worth checkpoints.",
  entrepreneurship:
    "Validation → build → market → scale: problem validation interviews, MVP definition, build, first 10 users, first revenue, growth loop, optional fundraising.",
  personal:
    "Habit + behavior change plan: baseline reflection, habit architecture, accountability system, checkpoint reviews, celebration/landmark event.",
};

/** Prompt templates. Keep short and concrete so the model stays on task. */
function buildPrompt(input: {
  title: string;
  description?: string | null;
  motivation?: string | null;
  category?: z.infer<typeof Category>;
  target_date: string; // YYYY-MM-DD
  today: string; // YYYY-MM-DD
}): string {
  const guide = input.category
    ? CATEGORY_GUIDE[input.category]
    : "Choose an appropriate framework for this kind of goal.";
  const parts = [
    `Goal: ${input.title}`,
    input.description ? `Description: ${input.description}` : null,
    input.motivation ? `Motivation: ${input.motivation}` : null,
    input.category ? `Category: ${input.category}` : null,
    `Target date: ${input.target_date}`,
    `Today: ${input.today}`,
    "",
    `Category guide: ${guide}`,
    "",
    "Generate 5–12 concrete milestones (not vague), each with a realistic due_date between today and the target date (inclusive). Order milestones chronologically by due_date. Each milestone must describe an observable, checkable deliverable — avoid process-only tasks ('study hard', 'think about X').",
  ];
  return parts.filter(Boolean).join("\n");
}

export async function decompose(input: {
  title: string;
  description?: string | null;
  motivation?: string | null;
  category?: z.infer<typeof Category>;
  target_date: string;
  today?: string;
}): Promise<Decomposition> {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const prompt = buildPrompt({ ...input, today });

  const result = await generateObject({
    model: openai()(powerModel()),
    schema: DecompositionSchema,
    system:
      "You are the planning side of Passio — an AI assistant that helps the user reach ambitious, multi-month/year goals. Your job is to reverse-engineer a concrete, chronological plan.",
    prompt,
  });

  // Enforce ordering + target-date bound
  result.object.milestones.sort((a, b) => a.due_date.localeCompare(b.due_date));
  for (const m of result.object.milestones) {
    if (m.due_date > input.target_date) {
      m.due_date = input.target_date;
    }
  }

  return result.object;
}
