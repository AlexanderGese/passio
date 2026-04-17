import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import type { Db } from "../db/client.js";
import { setActivePack } from "./focus.js";
import { setLocation as setWeatherLocation } from "./weather.js";

/**
 * Location awareness via hashed WiFi BSSID. We never store raw BSSID
 * or coordinates — just a salted hash mapped to a user-defined label
 * like 'home' / 'cafe' / 'office'. On network change we can switch
 * the active pack + weather location accordingly.
 */

const SALT_KEY = "location_salt";
const MAP_KEY = "location_map"; // { [bssid_hash]: { label, pack?, weatherLocName? } }

function getSalt(db: Db): string {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = ?").get(SALT_KEY) as
    | { value: string }
    | undefined;
  if (row) return JSON.parse(row.value) as string;
  const s = createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 24);
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(SALT_KEY, JSON.stringify(s));
  return s;
}

export function hashBssid(db: Db, bssid: string): string {
  return createHash("sha256").update(`${getSalt(db)}:${bssid.toLowerCase()}`).digest("hex").slice(0, 16);
}

interface LocationEntry {
  label: string;
  pack?: "work" | "study" | "chill" | "custom";
  weatherLoc?: { lat: number; lon: number; name: string };
}

function getMap(db: Db): Record<string, LocationEntry> {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = ?").get(MAP_KEY) as
    | { value: string }
    | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, LocationEntry>;
  } catch {
    return {};
  }
}

function saveMap(db: Db, m: Record<string, LocationEntry>): void {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(MAP_KEY, JSON.stringify(m));
}

export function registerLocation(
  db: Db,
  input: { bssid: string; label: string; pack?: LocationEntry["pack"]; weatherLoc?: LocationEntry["weatherLoc"] },
): { hash: string } {
  const hash = hashBssid(db, input.bssid);
  const map = getMap(db);
  map[hash] = {
    label: input.label,
    ...(input.pack !== undefined ? { pack: input.pack } : {}),
    ...(input.weatherLoc !== undefined ? { weatherLoc: input.weatherLoc } : {}),
  };
  saveMap(db, map);
  return { hash };
}

/** Applies the current WiFi → context switch. Safe to poll from scheduler. */
export async function applyCurrentLocation(db: Db): Promise<{ label: string | null }> {
  const bssid = await detectBssid();
  if (!bssid) return { label: null };
  const entry = getMap(db)[hashBssid(db, bssid)];
  if (!entry) return { label: null };
  if (entry.pack) setActivePack(db, entry.pack);
  if (entry.weatherLoc) setWeatherLocation(db, entry.weatherLoc);
  return { label: entry.label };
}

/** Reads the current WiFi BSSID via `iwgetid -ar` (Linux-only). */
async function detectBssid(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("iwgetid", ["-ar"]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve(null));
    proc.on("exit", (code) => {
      if (code !== 0) resolve(null);
      else resolve(out.trim() || null);
    });
  });
}
