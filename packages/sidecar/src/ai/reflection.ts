import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { memoryRemember, memoryForget } from "../tools/memory.js";
import { logUsage } from "../tools/cost.js";

/**
 * Nightly reflection. Runs at 22:00: reviews today's events / chat / scans,
 * proposes fact updates (add / update / forget) for the user to approve
 * next morning. Proposals are *not* auto-applied — trust is earned.
 */

const ProposalSchema = z.object({
  proposals: z
    .array(
      z.object({
        kind: z.enum(["add_fact", "update_fact", "forget_fact"]),
        subject: z.string().nullable(),
        content: z.string(),
        reasoning: z.string(),
        targetFactId: z.number().nullable(),
      }),
    )
    .max(8),
});

export function ensureReflectionTable(db: Db): void {
  db.$raw
    .query(
      `CREATE TABLE IF NOT EXISTS reflection_proposals (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         kind TEXT NOT NULL,
         subject TEXT,
         content TEXT NOT NULL,
         reasoning TEXT NOT NULL,
         status TEXT NOT NULL DEFAULT 'pending',
         target_fact_id INTEGER
       )`,
    )
    .run();
}

export async function runReflection(db: Db): Promise<{ proposed: number }> {
  ensureReflectionTable(db);
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return { proposed: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const since = today.toISOString();

  const events = db.$raw
    .query(
      "SELECT kind, content, summary, ts FROM events WHERE ts >= ? ORDER BY ts DESC LIMIT 40",
    )
    .all(since) as Array<{
    kind: string;
    content: string;
    summary: string | null;
    ts: string;
  }>;

  const messages = db.$raw
    .query(
      "SELECT role, content, ts FROM messages WHERE ts >= ? ORDER BY ts DESC LIMIT 30",
    )
    .all(since) as Array<{ role: string; content: string; ts: string }>;

  const existingFacts = db.$raw
    .query("SELECT id, subject, content, confidence FROM facts ORDER BY ts DESC LIMIT 40")
    .all() as Array<{
    id: number;
    subject: string | null;
    content: string;
    confidence: number;
  }>;

  if (events.length === 0 && messages.length === 0) return { proposed: 0 };

  const openai = createOpenAI({ apiKey: key });
  const model = process.env.PASSIO_MODEL_STANDARD || "gpt-4.1-mini";

  const prompt = `You are reviewing today's session to propose updates to Passio's long-term
memory. Propose at most 8 facts to ADD, UPDATE, or FORGET. Only propose
things that meaningfully change what Passio knows about the user — not
transient task state. Reference existing fact IDs when updating/forgetting.

TODAY EVENTS:
${events.slice(0, 30).map((e) => `- [${e.kind}] ${e.summary ?? e.content.slice(0, 120)}`).join("\n")}

TODAY MESSAGES (recent first):
${messages.slice(0, 20).map((m) => `- ${m.role}: ${m.content.slice(0, 140)}`).join("\n")}

EXISTING FACTS (for context, reference by id when proposing update/forget):
${existingFacts.map((f) => `#${f.id} [${f.subject ?? "—"}] ${f.content.slice(0, 100)} (${Math.round(f.confidence * 100)}%)`).join("\n")}

Rules:
- Add a fact only if you're reasonably confident and it's durable.
- Update a fact when you've seen evidence that changes it (put the NEW content).
- Forget a fact only if it's clearly wrong or stale.
- Empty proposals list is fine and correct when nothing durable happened.`;

  const { object, usage } = await generateObject({
    model: openai(model),
    schema: ProposalSchema,
    prompt,
  });
  logUsage(db, {
    tier: "standard",
    model,
    inTokens: usage?.inputTokens ?? 0,
    outTokens: usage?.outputTokens ?? 0,
  });

  for (const p of object.proposals) {
    db.$raw
      .query(
        "INSERT INTO reflection_proposals(kind, subject, content, reasoning, target_fact_id) VALUES(?, ?, ?, ?, ?)",
      )
      .run(p.kind, p.subject, p.content, p.reasoning, p.targetFactId);
  }
  return { proposed: object.proposals.length };
}

export function listPendingProposals(db: Db): {
  proposals: Array<{
    id: number;
    ts: string;
    kind: string;
    subject: string | null;
    content: string;
    reasoning: string;
    status: string;
    targetFactId: number | null;
  }>;
} {
  ensureReflectionTable(db);
  const rows = db.$raw
    .query(
      `SELECT id, ts, kind, subject, content, reasoning, status, target_fact_id AS targetFactId
         FROM reflection_proposals WHERE status = 'pending' ORDER BY ts DESC`,
    )
    .all() as Array<{
    id: number;
    ts: string;
    kind: string;
    subject: string | null;
    content: string;
    reasoning: string;
    status: string;
    targetFactId: number | null;
  }>;
  return { proposals: rows };
}

export async function resolveProposal(
  db: Db,
  input: { id: number; approve: boolean },
): Promise<{ ok: true }> {
  ensureReflectionTable(db);
  const row = db.$raw
    .query("SELECT kind, subject, content, target_fact_id FROM reflection_proposals WHERE id = ?")
    .get(input.id) as
    | { kind: string; subject: string | null; content: string; target_fact_id: number | null }
    | undefined;
  if (!row) return { ok: true };
  if (input.approve) {
    if (row.kind === "add_fact") {
      await memoryRemember(db, {
        kind: "context",
        subject: row.subject ?? undefined,
        content: row.content,
        source: "reflection",
      });
    } else if (row.kind === "update_fact" && row.target_fact_id) {
      db.$raw
        .query("UPDATE facts SET content = ?, last_confirmed = CURRENT_TIMESTAMP WHERE id = ?")
        .run(row.content, row.target_fact_id);
    } else if (row.kind === "forget_fact" && row.target_fact_id) {
      await memoryForget(db, { id: row.target_fact_id });
    }
  }
  db.$raw
    .query(
      "UPDATE reflection_proposals SET status = ? WHERE id = ?",
    )
    .run(input.approve ? "approved" : "rejected", input.id);
  return { ok: true };
}
