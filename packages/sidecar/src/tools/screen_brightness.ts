import { execSync, spawnSync } from "node:child_process";

/**
 * Best-effort brightness nudge for the distraction-dimmer. Uses
 * xrandr --brightness on X11. No-ops silently on Wayland.
 */

let lastApplied: number | null = null;

export function setBrightness(level: number): { ok: boolean; reason?: string } {
  const clamped = Math.max(0.4, Math.min(1.0, level));
  if (lastApplied !== null && Math.abs(lastApplied - clamped) < 0.02)
    return { ok: true };
  try {
    const outputs = execSync("xrandr --listactivemonitors | tail -n +2 | awk '{print $4}'", {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const out of outputs) {
      spawnSync("xrandr", ["--output", out, "--brightness", clamped.toFixed(2)], {
        stdio: "ignore",
      });
    }
    lastApplied = clamped;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export function restoreBrightness(): void {
  setBrightness(1.0);
}
