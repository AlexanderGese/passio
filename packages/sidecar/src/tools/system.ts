import { spawn } from "node:child_process";
import type { Db } from "../db/client.js";

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

// Substrings that, when present in the window title, reclassify a would-be
// "distraction" hit as "work". The idea: being on YouTube doesn't mean
// you're slacking — coding tutorials, documentation walkthroughs, lofi
// streams and study music are all productive uses of the same domain.
// Users can override this list via passio.system.productiveKeywords.set.
const DEFAULT_PRODUCTIVE_KEYWORDS = [
  // Learning / reference
  "tutorial",
  "how to",
  "how-to",
  "course",
  "lecture",
  "masterclass",
  "crash course",
  "deep dive",
  "walkthrough",
  "explained",
  "documentation",
  " docs ",
  "guide",
  "intro to",
  "learn ",
  "study ",
  "study with me",
  "ted talk",
  // Music / ambient — code-to-this territory
  "music",
  "playlist",
  " mix ",
  "album",
  "lo-fi",
  "lofi",
  "lo fi",
  "ambient",
  "focus",
  "meditation",
  "radio",
  "concert",
  "live stream",
  "ost",
  "soundtrack",
  // Tech-flavoured content that tends to be work-adjacent
  "coding",
  "programming",
  "algorithm",
  "javascript",
  "typescript",
  "python",
  "rust ",
  "react",
  "linux",
  "kubernetes",
  "devops",
  "security",
  "ctf",
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
  productiveKeywords: string[],
): Snapshot["classification"] {
  if (!app && !title) return "idle";
  const haystack = `${app ?? ""} ${title ?? ""}`.toLowerCase();
  if (distractionList.some((d) => haystack.includes(d))) {
    // Escape hatch: a YouTube tab titled "React hooks tutorial" or a
    // "lofi hip hop radio" stream is the user working, not slacking.
    // Pad with spaces so "rust " doesn't match "trustpilot" inside titles.
    const paddedHaystack = ` ${haystack} `;
    if (productiveKeywords.some((k) => paddedHaystack.includes(k.toLowerCase()))) {
      return "work";
    }
    return "distraction";
  }
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

export function getProductiveKeywords(db: Db): string[] {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'productive_keywords'")
    .get() as { value: string } | undefined;
  if (!row) return DEFAULT_PRODUCTIVE_KEYWORDS;
  try {
    return JSON.parse(row.value) as string[];
  } catch {
    return DEFAULT_PRODUCTIVE_KEYWORDS;
  }
}

export function setProductiveKeywords(db: Db, keywords: string[]): { ok: true } {
  const clean = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('productive_keywords', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(clean));
  return { ok: true };
}

export async function systemSnapshot(db: Db): Promise<Snapshot> {
  const [procs, { app, title }] = await Promise.all([topProcesses(), activeWindow()]);
  const cls = classify(app, title, getDistractionList(db), getProductiveKeywords(db));
  return {
    ts: new Date().toISOString(),
    activeApp: app,
    activeTitle: title,
    topProcesses: procs,
    classification: cls,
  };
}

/**
 * Classify an app/title — exposed for HUD "work/fun" label (Jarvis #15).
 */
export function classifyActivity(db: Db, app: string | null, title: string | null): Snapshot["classification"] {
  return classify(app, title, getDistractionList(db));
}
