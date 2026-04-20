import type { Db } from "../db/client.js";
import { OrchardIndexSchema, type OrchardIndex } from "@passio/shared";

const DEFAULT_ORCHARD_URL =
  "https://raw.githubusercontent.com/alexandergese/passio/main/orchard/index.json";

export function getOrchardUrl(db: Db): string {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'orchard_url'")
    .get() as { value: string } | undefined;
  if (!row) return DEFAULT_ORCHARD_URL;
  try {
    return JSON.parse(row.value) as string;
  } catch {
    return DEFAULT_ORCHARD_URL;
  }
}

export function setOrchardUrl(db: Db, url: string): { ok: true } {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('orchard_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(url));
  return { ok: true };
}

/**
 * Fetch the Orchard index. No auth — this is a public curated list. We
 * validate via zod so a malformed index doesn't poison the HUD.
 */
export async function fetchOrchard(
  db: Db,
): Promise<{ index: OrchardIndex; url: string }> {
  const url = getOrchardUrl(db);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Orchard ${res.status}`);
  const body = await res.text();
  const parsed = OrchardIndexSchema.parse(JSON.parse(body));
  return { index: parsed, url };
}
