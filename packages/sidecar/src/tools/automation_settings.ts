import type { Db } from "../db/client.js";

/**
 * Automation preferences — currently just the scanner-always-gate toggle.
 *
 * When `scannerAlwaysGate` is true (the default), every scanner-proposed
 * action routes through the W9 countdown gate even on `full_auto`
 * domains. Flipping it off makes the scanner respect per-host policy
 * literally: full_auto sites run silently, ask_first prompts.
 */

const KEY = "automation_prefs";

export interface AutomationPrefs {
  scannerAlwaysGate: boolean;
}

const DEFAULTS: AutomationPrefs = { scannerAlwaysGate: true };

export function getAutomationPrefs(db: Db): AutomationPrefs {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = ?").get(KEY) as
    | { value: string }
    | undefined;
  if (!row) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(row.value) as Partial<AutomationPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

export function setAutomationPrefs(db: Db, patch: Partial<AutomationPrefs>): AutomationPrefs {
  const next = { ...getAutomationPrefs(db), ...patch };
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(KEY, JSON.stringify(next));
  return next;
}
