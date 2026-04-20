import type { Db } from "../db/client.js";

/**
 * Thin settings-backed helpers for context packs, DND, distracting domains,
 * proactive mode/interval, and pomodoro state.
 */

const KEYS = {
  activePack: "active_pack",
  proactiveMode: "proactive_mode",
  proactiveInterval: "proactive_interval_min",
  dndUntil: "dnd_until",
  distractingDomains: "distracting_domains",
  focusStartedAt: "focus_started_at",
  focusDurationMin: "focus_duration_min",
} as const;

function readSetting<T>(db: Db, key: string, fallback: T): T {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

function writeSetting(db: Db, key: string, value: unknown): void {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, JSON.stringify(value));
}

// === Context pack ===

export type Pack = "work" | "study" | "chill" | "custom";

export function getActivePack(db: Db): Pack {
  return readSetting<Pack>(db, KEYS.activePack, "work");
}
export function setActivePack(db: Db, pack: Pack): { ok: true; pack: Pack } {
  writeSetting(db, KEYS.activePack, pack);
  return { ok: true, pack };
}
export function cyclePack(db: Db): { pack: Pack } {
  const order: Pack[] = ["work", "study", "chill"];
  const current = getActivePack(db);
  const idx = order.indexOf(current);
  const next = order[(idx + 1) % order.length] ?? "work";
  writeSetting(db, KEYS.activePack, next);
  return { pack: next };
}

// === Proactive loop config ===

export type ProactiveMode = "check-in" | "active-assist" | "summary-decide";
export function getProactiveMode(db: Db): ProactiveMode {
  // Default shifted from 'check-in' → 'active-assist' in W23 so Passio
  // behaves ambient-agent by default, not silent-and-waiting.
  return readSetting<ProactiveMode>(db, KEYS.proactiveMode, "active-assist");
}
export function setProactiveMode(db: Db, mode: ProactiveMode): { ok: true } {
  writeSetting(db, KEYS.proactiveMode, mode);
  return { ok: true };
}
export function getProactiveInterval(db: Db): number {
  return readSetting<number>(db, KEYS.proactiveInterval, 7);
}
export function setProactiveInterval(db: Db, minutes: number): { ok: true } {
  writeSetting(db, KEYS.proactiveInterval, Math.max(5, Math.min(60, Math.round(minutes))));
  return { ok: true };
}

// === DND ===

export function getDndUntil(db: Db): string | null {
  return readSetting<string | null>(db, KEYS.dndUntil, null);
}
export function setDnd(db: Db, input: { minutes: number | null }): { until: string | null } {
  if (input.minutes === null || input.minutes <= 0) {
    db.$raw.query("DELETE FROM settings WHERE key = ?").run(KEYS.dndUntil);
    return { until: null };
  }
  const until = new Date(Date.now() + input.minutes * 60_000).toISOString();
  writeSetting(db, KEYS.dndUntil, until);
  return { until };
}
export function toggleDnd(db: Db, defaultMinutes = 60): { until: string | null } {
  const cur = getDndUntil(db);
  if (cur && new Date(cur).getTime() > Date.now()) {
    return setDnd(db, { minutes: null });
  }
  return setDnd(db, { minutes: defaultMinutes });
}

// === Distracting sites ===

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
export function getDistractingDomains(db: Db): string[] {
  return readSetting<string[]>(db, KEYS.distractingDomains, DEFAULT_DISTRACTING);
}
export function setDistractingDomains(db: Db, domains: string[]): { ok: true } {
  writeSetting(db, KEYS.distractingDomains, [...new Set(domains.map((d) => d.trim()).filter(Boolean))]);
  return { ok: true };
}

// === Pomodoro / focus ===

export interface FocusState {
  active: boolean;
  remainingSeconds: number;
  durationMin: number;
  startedAt: string | null;
}

export function getFocusState(db: Db): FocusState {
  const startedAt = readSetting<string | null>(db, KEYS.focusStartedAt, null);
  const durationMin = readSetting<number>(db, KEYS.focusDurationMin, 25);
  if (!startedAt) return { active: false, remainingSeconds: 0, durationMin, startedAt: null };
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  const remaining = Math.max(0, durationMin * 60 - elapsed);
  const active = remaining > 0;
  return { active, remainingSeconds: Math.round(remaining), durationMin, startedAt };
}

export function focusStart(db: Db, durationMin = 25): FocusState {
  writeSetting(db, KEYS.focusStartedAt, new Date().toISOString());
  writeSetting(db, KEYS.focusDurationMin, Math.max(1, Math.min(180, Math.round(durationMin))));
  return getFocusState(db);
}

export function focusStop(db: Db): FocusState {
  db.$raw.query("DELETE FROM settings WHERE key = ?").run(KEYS.focusStartedAt);
  return getFocusState(db);
}
