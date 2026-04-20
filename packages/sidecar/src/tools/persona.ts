import type { Db } from "../db/client.js";

/**
 * Persona = the assistant's name + optional pronouns. Used by the chat
 * system prompt, TTS voice selection, and the bubble header.
 */

export interface Persona {
  name: string;
  pronouns: string;
  voice: "alloy" | "echo" | "fable" | "nova" | "onyx" | "shimmer";
}

const DEFAULTS: Persona = { name: "Passio", pronouns: "they/them", voice: "alloy" };

export function getPersona(db: Db): Persona {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = 'persona'").get() as
    | { value: string }
    | undefined;
  if (!row) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(row.value) as Partial<Persona>) };
  } catch {
    return DEFAULTS;
  }
}

export function setPersona(db: Db, patch: Partial<Persona>): Persona {
  const current = getPersona(db);
  const next = { ...current, ...patch };
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('persona', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(next));
  return next;
}

/** Keybinds: symbolic name → accelerator string ("Super+Space"). */
export const DEFAULT_KEYBINDS: Record<string, string> = {
  // Primary open/toggle — matches the Windows Copilot key combo (Win+Shift+Space).
  "toggle-bubble": "Super+Shift+Space",
  "quick-chat": "Super+Space",
  "force-scan": "Super+Shift+N",
  ptt: "Super+Alt+Space",
  "rewrite-selection": "Super+Shift+R",
  "translate-selection": "Super+Shift+L",
};

export function getKeybinds(db: Db): Record<string, string> {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = 'keybinds'").get() as
    | { value: string }
    | undefined;
  if (!row) return { ...DEFAULT_KEYBINDS };
  try {
    return { ...DEFAULT_KEYBINDS, ...(JSON.parse(row.value) as Record<string, string>) };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

export function setKeybinds(db: Db, patch: Record<string, string>): Record<string, string> {
  const next = { ...getKeybinds(db), ...patch };
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('keybinds', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(next));
  return next;
}
