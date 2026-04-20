import { spawn } from "node:child_process";
import type { Db } from "../db/client.js";
import { activityLog } from "./analytics.js";
import { restoreBrightness, setBrightness } from "./screen_brightness.js";

/**
 * Ambient system tracker. Every tick:
 *   • `ps` — top 5 CPU-heavy processes
 *   • `xdotool getactivewindow` → window title + pid → exe name
 *   • classify (rough heuristic, overridable) and append to activity_log
 *
 * Rolled-up classification happens in a separate pass (`rollupActivity`)
 * via the economy-tier LLM so the live snapshot stays cheap.
 */

export interface Snapshot {
  ts: string;
  activeApp: string | null;
  activeTitle: string | null;
  topProcesses: Array<{ name: string; cpu: number; mem: number }>;
  classification: "work" | "distraction" | "idle" | "unknown";
}

const DEFAULT_DISTRACTION = [
  "twitter",
  "x.com",
  "reddit",
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
  "netflix",
];

function shell(cmd: string, args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve({ stdout: "", code: -1 }));
    proc.on("exit", (code) => resolve({ stdout: out, code: code ?? -1 }));
  });
}

async function topProcesses(): Promise<Snapshot["topProcesses"]> {
  const { stdout } = await shell("ps", [
    "-eo",
    "comm,%cpu,%mem",
    "--sort=-%cpu",
    "--no-headers",
  ]);
  return stdout
    .split("\n")
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        name: parts[0] ?? "?",
        cpu: Number(parts[1] ?? 0),
        mem: Number(parts[2] ?? 0),
      };
    });
}

async function activeWindow(): Promise<{ app: string | null; title: string | null }> {
  const { stdout: idOut, code } = await shell("xdotool", ["getactivewindow"]);
  if (code !== 0) return { app: null, title: null };
  const winId = idOut.trim();
  if (!winId) return { app: null, title: null };
  const [titleRes, pidRes] = await Promise.all([
    shell("xdotool", ["getwindowname", winId]),
    shell("xdotool", ["getwindowpid", winId]),
  ]);
  const title = titleRes.stdout.trim() || null;
  const pid = pidRes.stdout.trim();
  if (!pid) return { app: null, title };
  const { stdout } = await shell("ps", ["-p", pid, "-o", "comm="]);
  return { app: stdout.trim() || null, title };
}

function classify(
  app: string | null,
  title: string | null,
  distractionList: string[],
): Snapshot["classification"] {
  if (!app && !title) return "idle";
  const haystack = `${app ?? ""} ${title ?? ""}`.toLowerCase();
  if (distractionList.some((d) => haystack.includes(d))) return "distraction";
  // Rough work heuristic: known dev / productivity apps.
  if (
    /code|vim|emacs|intellij|jetbrains|passio|terminal|qterminal|bash|zsh|obsidian|cursor|warp/i.test(
      haystack,
    )
  ) {
    return "work";
  }
  return "unknown";
}

function getDistractionList(db: Db): string[] {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'distracting_domains'")
    .get() as { value: string } | undefined;
  if (!row) return DEFAULT_DISTRACTION;
  try {
    return JSON.parse(row.value) as string[];
  } catch {
    return DEFAULT_DISTRACTION;
  }
}

export async function systemSnapshot(db: Db): Promise<Snapshot> {
  const [procs, { app, title }] = await Promise.all([topProcesses(), activeWindow()]);
  const cls = classify(app, title, getDistractionList(db));
  activityLog(db, {
    ...(app !== null ? { app } : {}),
    ...(title !== null ? { window_title: title } : {}),
    duration_seconds: 60,
    classification: cls,
  });
  return {
    ts: new Date().toISOString(),
    activeApp: app,
    activeTitle: title,
    topProcesses: procs,
    classification: cls,
  };
}

/**
 * Recent activity summary. Returns hour+today breakdown of classified
 * time. Used by HUD + rollup prompt.
 */
export function activityStats(db: Db): {
  today: Record<Snapshot["classification"], number>;
  lastHour: Record<Snapshot["classification"], number>;
  streakDistractionMin: number;
  currentApp: string | null;
  currentTitle: string | null;
} {
  const rows = db.$raw
    .query(
      `SELECT classification, duration_seconds, ts, app, window_title
         FROM activity_log
        WHERE ts >= datetime('now', '-24 hours')
        ORDER BY ts DESC`,
    )
    .all() as Array<{
    classification: Snapshot["classification"];
    duration_seconds: number;
    ts: string;
    app: string | null;
    window_title: string | null;
  }>;

  const zero = { work: 0, distraction: 0, idle: 0, unknown: 0 } as Record<
    Snapshot["classification"],
    number
  >;
  const today = { ...zero };
  const lastHour = { ...zero };
  const hourAgo = Date.now() - 3600_000;

  for (const r of rows) {
    const cls = (r.classification ?? "unknown") as Snapshot["classification"];
    today[cls] += r.duration_seconds ?? 60;
    if (Date.parse(r.ts) >= hourAgo) lastHour[cls] += r.duration_seconds ?? 60;
  }

  // Walk backwards from most recent to count consecutive distraction entries
  let streakDistractionMin = 0;
  for (const r of rows) {
    if (r.classification === "distraction") streakDistractionMin += (r.duration_seconds ?? 60) / 60;
    else break;
  }

  return {
    today,
    lastHour,
    streakDistractionMin: Math.round(streakDistractionMin),
    currentApp: rows[0]?.app ?? null,
    currentTitle: rows[0]?.window_title ?? null,
  };
}

/**
 * Nudge check — called by the radar scheduler. Returns a message if the
 * user has been on distracting apps for more than N min continuously.
 * Also dims the screen slightly after sustained distraction (Jarvis #14).
 */
export function distractionNudge(db: Db, thresholdMin = 25): string | null {
  const s = activityStats(db);
  // Ambient dimmer: 0–15 min normal, 15–30 slight dim, 30+ stronger.
  if (s.streakDistractionMin >= 30) setBrightness(0.7);
  else if (s.streakDistractionMin >= 15) setBrightness(0.85);
  else restoreBrightness();

  if (s.streakDistractionMin < thresholdMin) return null;
  return `You've been on ${s.currentApp ?? "a distracting app"} for ${s.streakDistractionMin}min straight — want me to get you back to your plan?`;
}

/**
 * Stand-up nudge. Fires when the user has been continuously active at the
 * keyboard for 90+ minutes. Best-effort — we use activity_log rows as a
 * proxy since X11 idle detection requires xss-lock / xscreensaver.
 */
export function sittingNudge(db: Db, thresholdMin = 90): string | null {
  const rows = db.$raw
    .query(
      `SELECT duration_seconds, classification, ts FROM activity_log
        WHERE ts >= datetime('now', '-3 hours')
        ORDER BY ts DESC`,
    )
    .all() as Array<{ duration_seconds: number; classification: string; ts: string }>;
  let sittingMin = 0;
  for (const r of rows) {
    if (r.classification === "idle") break;
    sittingMin += (r.duration_seconds ?? 60) / 60;
  }
  if (sittingMin < thresholdMin) return null;
  return `You've been at it for ${Math.round(sittingMin)} min — stand up and stretch for 60s?`;
}

/**
 * Classify an app/title — exposed for HUD "work/fun" label (Jarvis #15).
 */
export function classifyActivity(db: Db, app: string | null, title: string | null): Snapshot["classification"] {
  return classify(app, title, getDistractionList(db));
}
