import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";

/**
 * Linux .desktop app index. Scans the XDG application dirs, parses each
 * Desktop Entry, caches the result, and refreshes every 10 minutes (cheap
 * because we only read small files).
 */

export type AppEntry = {
  name: string;
  exec: string;
  icon?: string;
  /** Absolute path to the icon file on disk, if we could resolve it. */
  iconPath?: string;
  keywords: string[];
  genericName?: string;
  comment?: string;
  path: string; // path of the .desktop file (for dedup + debug)
};

const SEARCH_DIRS = [
  "/usr/share/applications",
  "/usr/local/share/applications",
  join(homedir(), ".local/share/applications"),
  "/var/lib/flatpak/exports/share/applications",
  join(homedir(), ".local/share/flatpak/exports/share/applications"),
  "/var/lib/snapd/desktop/applications",
];

let cache: AppEntry[] | null = null;
let lastRefresh = 0;
const TTL_MS = 10 * 60 * 1000;

export function listApps(): AppEntry[] {
  const now = Date.now();
  if (cache && now - lastRefresh < TTL_MS) return cache;
  cache = scanAll();
  lastRefresh = now;
  return cache;
}

function scanAll(): AppEntry[] {
  const seen = new Set<string>();
  const out: AppEntry[] = [];
  for (const dir of SEARCH_DIRS) {
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".desktop")) continue;
      const path = join(dir, f);
      try {
        const st = statSync(path);
        if (!st.isFile()) continue;
      } catch {
        continue;
      }
      const entry = parseDesktopFile(path);
      if (!entry) continue;
      // Dedup by .desktop filename; user-local overrides system.
      const key = f.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function parseDesktopFile(path: string): AppEntry | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  // Only read the [Desktop Entry] group (stop at any other [Section]).
  const lines = text.split("\n");
  let inMain = false;
  const kv = new Map<string, string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("[")) {
      inMain = trimmed === "[Desktop Entry]";
      continue;
    }
    if (!inMain) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    // Prefer the un-locale-suffixed value ("Name" over "Name[de]").
    if (!kv.has(key)) kv.set(key, val);
  }
  if (kv.get("Type") !== "Application") return null;
  if (kv.get("NoDisplay") === "true" || kv.get("Hidden") === "true") return null;
  const name = kv.get("Name");
  const exec = kv.get("Exec");
  if (!name || !exec) return null;

  const keywords = (kv.get("Keywords") ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const iconRaw = kv.get("Icon");
  const iconPath = iconRaw ? resolveIcon(iconRaw) : null;

  return {
    name,
    exec,
    keywords,
    path,
    ...(iconRaw ? { icon: iconRaw } : {}),
    ...(iconPath ? { iconPath } : {}),
    ...(kv.get("GenericName") ? { genericName: kv.get("GenericName")! } : {}),
    ...(kv.get("Comment") ? { comment: kv.get("Comment")! } : {}),
  };
}

// --- Icon theme resolution --------------------------------------------------

const ICON_THEME_DIRS = [
  "/usr/share/icons",
  "/usr/local/share/icons",
  join(homedir(), ".local/share/icons"),
];
const PIXMAPS_DIRS = ["/usr/share/pixmaps", "/usr/local/share/pixmaps"];
const THEMES = ["hicolor", "Adwaita", "breeze", "gnome", "oxygen", "Papirus"];
const SIZES = ["256x256", "128x128", "64x64", "48x48", "scalable"];
const EXTS = ["png", "svg", "xpm"];

function resolveIcon(name: string): string | null {
  // Absolute path: honour directly if it exists.
  if (name.startsWith("/")) return existsSync(name) ? name : null;
  // `Icon=foo.png` — sometimes already has extension. Strip it so we can
  // look across preferred sizes/extensions uniformly.
  const stem = extname(name) ? name.slice(0, -extname(name).length) : name;

  for (const dir of ICON_THEME_DIRS) {
    for (const theme of THEMES) {
      for (const size of SIZES) {
        for (const ext of EXTS) {
          const p = `${dir}/${theme}/${size}/apps/${stem}.${ext}`;
          if (existsSync(p)) return p;
        }
      }
    }
  }
  for (const dir of PIXMAPS_DIRS) {
    for (const ext of EXTS) {
      const p = `${dir}/${stem}.${ext}`;
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const DATA_URL_CACHE = new Map<string, string>();
const DATA_URL_MAX_BYTES = 200 * 1024; // skip huge SVGs/PNGs

/**
 * Read an icon file and encode it as a data URL the webview can render
 * directly (no asset-protocol permissions needed). Results are cached by
 * path — hits are repeated every keystroke in the spotlight.
 */
export function iconDataUrl(path: string): string | null {
  const cached = DATA_URL_CACHE.get(path);
  if (cached !== undefined) return cached;
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > DATA_URL_MAX_BYTES) {
      DATA_URL_CACHE.set(path, "");
      return null;
    }
    const buf = readFileSync(path);
    const mime = mimeFor(path);
    const url = `data:${mime};base64,${buf.toString("base64")}`;
    DATA_URL_CACHE.set(path, url);
    return url;
  } catch {
    DATA_URL_CACHE.set(path, "");
    return null;
  }
}

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".xpm") return "image/x-xpixmap"; // webview won't render these well, but honour
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}
