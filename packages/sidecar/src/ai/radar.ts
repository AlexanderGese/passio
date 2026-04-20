import type { Db } from "../db/client.js";

/**
 * Deadline radar. Fires on a 30-minute scheduler tick. Finds active-goal
 * milestones that are due within the next N hours (default 48) and are
 * not yet done, picks the most urgent one, returns a short nudge string.
 *
 * Returns null if everything's calm — scheduler caller will then stay quiet.
 *
 * The goal is the "Jarvis next to you" feel: you shouldn't have to open
 * the bubble to remember that a milestone is due tomorrow.
 */

export interface RadarHit {
  message: string;
  goalId: number;
  goalTitle: string;
  milestoneTitle: string;
  dueDate: string;
  hoursUntilDue: number;
}

const LAST_KEY = "radar_last_milestone_id";

export function deadlineRadar(db: Db, horizonHours = 48): RadarHit | null {
  const last = db.$raw
    .query("SELECT value FROM settings WHERE key = ?")
    .get(LAST_KEY) as { value: string } | undefined;
  const lastMid = last ? Number(JSON.parse(last.value)) : null;
  const rows = db.$raw
    .query(
      `SELECT m.id AS mid, m.title AS milestone_title, m.due_date AS due_date,
              g.id AS gid, g.title AS goal_title
         FROM milestones m
         JOIN goals g ON g.id = m.goal_id
        WHERE g.status = 'active'
          AND m.status != 'done'
          AND m.due_date IS NOT NULL
          AND m.due_date >= date('now', '-1 day')
        ORDER BY m.due_date ASC
        LIMIT 10`,
    )
    .all() as Array<{
    mid: number;
    milestone_title: string;
    due_date: string;
    gid: number;
    goal_title: string;
  }>;

  const now = Date.now();
  const horizon = now + horizonHours * 3600_000;

  for (const r of rows) {
    const dueMs = Date.parse(`${r.due_date}T23:59:59Z`);
    if (Number.isNaN(dueMs)) continue;
    if (dueMs > horizon) continue;
    // Don't re-nag about the same milestone on back-to-back ticks.
    if (r.mid === lastMid) continue;

    const hoursUntil = Math.round((dueMs - now) / 3600_000);
    const phrase =
      hoursUntil < 0
        ? `${-hoursUntil}h overdue`
        : hoursUntil < 24
          ? `due in ${hoursUntil}h`
          : `due tomorrow`;

    db.$raw
      .query(
        "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(LAST_KEY, JSON.stringify(r.mid));

    return {
      message: `Heads up — "${r.milestone_title}" (${r.goal_title}) is ${phrase}.`,
      goalId: r.gid,
      goalTitle: r.goal_title,
      milestoneTitle: r.milestone_title,
      dueDate: r.due_date,
      hoursUntilDue: hoursUntil,
    };
  }
  return null;
}
