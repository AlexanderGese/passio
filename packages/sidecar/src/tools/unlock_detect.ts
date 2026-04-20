import { spawnSync } from "node:child_process";
import type { Db } from "../db/client.js";

/**
 * Best-effort unlock detection for morning TTS briefing. Reads the screen
 * lock state via loginctl. Stores last-seen-unlocked timestamp in settings
 * so we can detect "transitioned from locked to unlocked".
 */

export function checkUnlockTransition(db: Db): { unlocked: boolean; firstSinceLock: boolean } {
  const locked = isLocked();
  const prev = db.$raw
    .query("SELECT value FROM settings WHERE key = 'screen_locked'")
    .get() as { value: string } | undefined;
  const wasLocked = prev ? JSON.parse(prev.value) === true : false;
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('screen_locked', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(locked));
  return { unlocked: !locked, firstSinceLock: wasLocked && !locked };
}

function isLocked(): boolean {
  // Try loginctl first (systemd-logind).
  try {
    const r = spawnSync("bash", ["-c", "loginctl show-session $(loginctl | awk 'NR==2{print $1}') -p LockedHint --value"], {
      encoding: "utf8",
    });
    if (r.status === 0) return r.stdout.trim() === "yes";
  } catch {
    /* next */
  }
  // xfce4-screensaver / xscreensaver fallback.
  try {
    const r = spawnSync("xscreensaver-command", ["-time"], { encoding: "utf8" });
    if (r.status === 0 && /screen\s+(locked|blanked)/i.test(r.stdout)) return true;
  } catch {
    /* next */
  }
  return false;
}
