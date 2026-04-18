import { readFile } from "node:fs/promises";
import type { Db } from "../db/client.js";

/**
 * Calendar via local .ics files. Google Calendar can publish a
 * private-URL .ics; we fetch it the same way. No OAuth required.
 *
 * Config: settings row `calendar_sources` = string[] of paths or URLs.
 */

interface RawEvent {
  summary: string;
  start: Date;
  end: Date | null;
  location?: string;
  url?: string;
  description?: string;
}

function getSources(db: Db): string[] {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = 'calendar_sources'").get() as
    | { value: string }
    | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.value) as string[];
  } catch {
    return [];
  }
}

export function listCalendarSources(db: Db): { sources: string[] } {
  return { sources: getSources(db) };
}

export function setCalendarSources(db: Db, sources: string[]): { ok: true } {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('calendar_sources', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify([...new Set(sources.map((s) => s.trim()).filter(Boolean))]));
  return { ok: true };
}

export async function upcomingEvents(
  db: Db,
  input: { limit?: number; days?: number },
): Promise<{ events: Array<{ summary: string; start: string; end?: string; location?: string; source: string }> }> {
  const sources = getSources(db);
  if (sources.length === 0) return { events: [] };
  const limit = input.limit ?? 10;
  const days = input.days ?? 14;
  const windowEnd = Date.now() + days * 86_400_000;

  const all: Array<RawEvent & { source: string }> = [];
  for (const src of sources) {
    const ics = await readSource(src);
    for (const e of parseIcs(ics)) {
      all.push({ ...e, source: src });
    }
  }
  const now = Date.now();
  const upcoming = all
    .filter((e) => e.start.getTime() >= now && e.start.getTime() <= windowEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, limit);
  return {
    events: upcoming.map((e) => ({
      summary: e.summary,
      start: e.start.toISOString(),
      ...(e.end ? { end: e.end.toISOString() } : {}),
      ...(e.location ? { location: e.location } : {}),
      source: e.source,
    })),
  };
}

async function readSource(src: string): Promise<string> {
  if (src.startsWith("http://") || src.startsWith("https://")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`calendar source ${src} ${res.status}`);
    return res.text();
  }
  return readFile(src, "utf8");
}

/**
 * Minimal ICS parser. Supports VEVENT with SUMMARY, DTSTART, DTEND,
 * LOCATION, URL, DESCRIPTION. Handles YYYYMMDDTHHMMSSZ and all-day
 * YYYYMMDD. Ignores RRULE (no recurrence expansion in v1).
 */
export function parseIcs(raw: string): RawEvent[] {
  const events: RawEvent[] = [];
  // Unfold continuation lines (RFC 5545)
  const unfolded = raw.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  let current: Partial<RawEvent> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") {
      if (current?.summary && current.start) {
        events.push({
          summary: current.summary,
          start: current.start,
          end: current.end ?? null,
          ...(current.location ? { location: current.location } : {}),
          ...(current.url ? { url: current.url } : {}),
          ...(current.description ? { description: current.description } : {}),
        });
      }
      current = null;
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const key = line.slice(0, colon);
      const val = line.slice(colon + 1);
      if (key.startsWith("SUMMARY")) current.summary = unescapeIcs(val);
      else if (key.startsWith("LOCATION")) current.location = unescapeIcs(val);
      else if (key.startsWith("URL")) current.url = val;
      else if (key.startsWith("DESCRIPTION")) current.description = unescapeIcs(val);
      else if (key.startsWith("DTSTART")) current.start = parseDate(val);
      else if (key.startsWith("DTEND")) current.end = parseDate(val);
    }
  }
  return events;
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseDate(s: string): Date {
  // ZULU: 20260418T130000Z
  if (/^\d{8}T\d{6}Z$/.test(s)) {
    return new Date(
      `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`,
    );
  }
  // Floating local: 20260418T130000 (treat as local)
  if (/^\d{8}T\d{6}$/.test(s)) {
    const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}`;
    return new Date(iso);
  }
  // All-day: 20260418
  if (/^\d{8}$/.test(s)) {
    return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00`);
  }
  return new Date(s);
}
