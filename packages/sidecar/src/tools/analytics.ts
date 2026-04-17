import type { Db } from "../db/client.js";

/**
 * Lightweight analytics tools: habits, journal, mood/energy.
 * Time-block + activity-log land here too but as raw CRUD — the UI
 * surfacing of charts is out of scope for this plan's HUD slice.
 */

// === Habits ===

export function habitUpsert(db: Db, input: { name: string; target_per_week?: number }): { id: number } {
  db.$raw
    .query(
      "INSERT INTO habits(name, target_per_week) VALUES(?, ?) ON CONFLICT(name) DO UPDATE SET target_per_week = excluded.target_per_week",
    )
    .run(input.name, input.target_per_week ?? 0);
  const row = db.$raw.query("SELECT id FROM habits WHERE name = ?").get(input.name) as
    | { id: number }
    | undefined;
  if (!row) throw new Error("habit upsert failed");
  return { id: row.id };
}

export function habitLog(db: Db, input: { habit_id?: number; name?: string }): { ok: true } {
  let id = input.habit_id;
  if (!id && input.name) {
    const row = db.$raw.query("SELECT id FROM habits WHERE name = ?").get(input.name) as
      | { id: number }
      | undefined;
    if (!row) {
      const fresh = habitUpsert(db, { name: input.name });
      id = fresh.id;
    } else {
      id = row.id;
    }
  }
  if (!id) throw new Error("habit_id or name required");
  db.$raw.query("INSERT INTO habit_log(habit_id) VALUES(?)").run(id);
  return { ok: true };
}

export function habitSummary(
  db: Db,
  input: { days?: number },
): { habits: Array<{ name: string; hits: number; target_per_week: number }> } {
  const days = input.days ?? 7;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db.$raw
    .query(
      `SELECT h.name AS name, h.target_per_week AS target_per_week,
              COUNT(l.id) AS hits
       FROM habits h
       LEFT JOIN habit_log l ON l.habit_id = h.id AND l.ts >= ?
       GROUP BY h.id
       ORDER BY h.name`,
    )
    .all(since) as { name: string; target_per_week: number; hits: number }[];
  return { habits: rows };
}

// === Journal ===

export function journalAdd(
  db: Db,
  input: { prompt?: string; body: string; mood?: number; energy?: number },
): { id: number } {
  const res = db.$raw
    .query("INSERT INTO journal_entries(prompt, body, mood, energy) VALUES(?, ?, ?, ?) RETURNING id")
    .get(input.prompt ?? null, input.body, input.mood ?? null, input.energy ?? null) as
    | { id: number }
    | undefined;
  if (!res) throw new Error("journal insert failed");
  return { id: res.id };
}

export function journalRecent(
  db: Db,
  input: { limit?: number },
): { entries: Array<{ id: number; ts: string; body: string; mood: number | null; energy: number | null }> } {
  const rows = db.$raw
    .query(
      "SELECT id, ts, body, mood, energy FROM journal_entries ORDER BY ts DESC LIMIT ?",
    )
    .all(input.limit ?? 10) as {
    id: number;
    ts: string;
    body: string;
    mood: number | null;
    energy: number | null;
  }[];
  return { entries: rows };
}

// === Time blocks ===

export function timeBlockCreate(
  db: Db,
  input: { start_at: string; end_at?: string; kind: string; label?: string; goal_id?: number },
): { id: number } {
  const res = db.$raw
    .query(
      "INSERT INTO time_blocks(start_at, end_at, kind, label, goal_id) VALUES(?, ?, ?, ?, ?) RETURNING id",
    )
    .get(
      input.start_at,
      input.end_at ?? null,
      input.kind,
      input.label ?? null,
      input.goal_id ?? null,
    ) as { id: number } | undefined;
  if (!res) throw new Error("time_block insert failed");
  return { id: res.id };
}

// === Activity log ===

export function activityLog(
  db: Db,
  input: { app?: string; window_title?: string; duration_seconds?: number; classification?: string },
): { ok: true } {
  db.$raw
    .query(
      "INSERT INTO activity_log(app, window_title, duration_seconds, classification) VALUES(?, ?, ?, ?)",
    )
    .run(
      input.app ?? null,
      input.window_title ?? null,
      input.duration_seconds ?? null,
      input.classification ?? null,
    );
  return { ok: true };
}
