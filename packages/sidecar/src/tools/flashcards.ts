import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";

/**
 * SM-2 spaced-repetition scheduler. Grade scale (0..5):
 *   0–2: failed; reset interval to 1
 *   3–5: passed; advance per the SM-2 formula
 */

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

function economyModel(): string {
  return process.env.PASSIO_MODEL_ECONOMY || "gpt-4o-mini";
}

const CardArraySchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().min(2).max(300),
        back: z.string().min(2).max(600),
      }),
    )
    .min(1)
    .max(20),
});

export async function flashcardsFromNote(
  db: Db,
  input: { note_id?: number; body?: string; deck?: string; count?: number },
): Promise<{ generated: number; deck: string }> {
  let body = input.body;
  if (!body && input.note_id !== undefined) {
    const row = db.$raw
      .query("SELECT body, title FROM notes WHERE id = ?")
      .get(input.note_id) as { body: string; title: string | null } | undefined;
    if (!row) throw new Error(`note ${input.note_id} not found`);
    body = `${row.title ?? ""}\n${row.body}`;
  }
  if (!body) throw new Error("either note_id or body must be provided");

  const target = Math.min(Math.max(input.count ?? 8, 2), 20);
  const { object } = await generateObject({
    model: openai()(economyModel()),
    schema: CardArraySchema,
    system:
      "You create Q/A flashcards for spaced repetition. Each card tests a SINGLE atomic fact. Front is the question; back is the minimal correct answer. Avoid yes/no cards.",
    prompt: `Generate exactly ${target} flashcards from this note:\n\n${body}`,
  });

  const deck = input.deck ?? "default";
  const due = new Date().toISOString();
  for (const c of object.cards) {
    db.$raw
      .query(
        "INSERT INTO cards(deck, front, back, due_at, source_note_id) VALUES(?, ?, ?, ?, ?)",
      )
      .run(deck, c.front, c.back, due, input.note_id ?? null);
  }
  return { generated: object.cards.length, deck };
}

export function cardsDue(
  db: Db,
  input: { deck?: string; limit?: number },
): { cards: Array<{ id: number; front: string; back: string; deck: string }> } {
  const now = new Date().toISOString();
  const rows = input.deck
    ? (db.$raw
        .query(
          "SELECT id, front, back, deck FROM cards WHERE deck = ? AND (due_at IS NULL OR due_at <= ?) ORDER BY due_at LIMIT ?",
        )
        .all(input.deck, now, input.limit ?? 10) as Array<{
        id: number;
        front: string;
        back: string;
        deck: string;
      }>)
    : (db.$raw
        .query(
          "SELECT id, front, back, deck FROM cards WHERE due_at IS NULL OR due_at <= ? ORDER BY due_at LIMIT ?",
        )
        .all(now, input.limit ?? 10) as Array<{
        id: number;
        front: string;
        back: string;
        deck: string;
      }>);
  return { cards: rows };
}

/**
 * SM-2 update. Returns the new scheduling state.
 */
export function cardGrade(
  db: Db,
  input: { id: number; grade: 0 | 1 | 2 | 3 | 4 | 5 },
): { ef: number; interval_days: number; repetitions: number; due_at: string } {
  const row = db.$raw
    .query("SELECT ef, interval_days, repetitions FROM cards WHERE id = ?")
    .get(input.id) as { ef: number; interval_days: number; repetitions: number } | undefined;
  if (!row) throw new Error(`card ${input.id} not found`);

  let { ef, interval_days, repetitions } = row;
  const q = input.grade;

  if (q < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval_days = 1;
    else if (repetitions === 2) interval_days = 6;
    else interval_days = Math.round(interval_days * ef);
    ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  }

  const due = new Date(Date.now() + interval_days * 86_400_000).toISOString();
  db.$raw
    .query(
      "UPDATE cards SET ef = ?, interval_days = ?, repetitions = ?, due_at = ? WHERE id = ?",
    )
    .run(ef, interval_days, repetitions, due, input.id);
  return { ef, interval_days, repetitions, due_at: due };
}
