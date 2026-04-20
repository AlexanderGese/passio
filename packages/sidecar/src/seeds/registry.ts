import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SeedManifestSchema, type SeedManifest } from "@passio/shared";
import type { Db } from "../db/client.js";
import { seedDir, seedsRoot } from "./paths.js";

/**
 * Installed-seed registry. Persists per-seed state (enabled, settings,
 * source, version) in the `seeds` table so the runtime can re-hydrate on
 * sidecar boot.
 */

export type SeedRow = {
  name: string;
  version: string;
  enabled: boolean;
  manifest: SeedManifest;
  source: string | null; // origin (.seed descriptor, github url, local path)
  installedAt: string;
  settings: Record<string, unknown>;
  dir: string;
};

export function ensureSeedsTable(db: Db): void {
  db.$raw
    .query(
      `CREATE TABLE IF NOT EXISTS seeds (
         name TEXT PRIMARY KEY,
         version TEXT NOT NULL,
         enabled INTEGER NOT NULL DEFAULT 1,
         manifest_json TEXT NOT NULL,
         source_json TEXT,
         installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         settings_json TEXT NOT NULL DEFAULT '{}'
       )`,
    )
    .run();
}

export function readManifestFromDir(dir: string): SeedManifest {
  const path = join(dir, "seed.json");
  if (!existsSync(path)) throw new Error(`no seed.json at ${dir}`);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return SeedManifestSchema.parse(raw);
}

export function listSeeds(db: Db): SeedRow[] {
  ensureSeedsTable(db);
  const rows = db.$raw
    .query(
      "SELECT name, version, enabled, manifest_json AS manifestJson, source_json AS sourceJson, installed_at AS installedAt, settings_json AS settingsJson FROM seeds ORDER BY installed_at DESC",
    )
    .all() as Array<{
    name: string;
    version: string;
    enabled: number;
    manifestJson: string;
    sourceJson: string | null;
    installedAt: string;
    settingsJson: string;
  }>;
  return rows.map((r) => ({
    name: r.name,
    version: r.version,
    enabled: r.enabled === 1,
    manifest: JSON.parse(r.manifestJson) as SeedManifest,
    source: r.sourceJson,
    installedAt: r.installedAt,
    settings: safeJson(r.settingsJson, {}),
    dir: seedDir(r.name),
  }));
}

export function getSeed(db: Db, name: string): SeedRow | null {
  ensureSeedsTable(db);
  const r = db.$raw
    .query(
      "SELECT name, version, enabled, manifest_json AS manifestJson, source_json AS sourceJson, installed_at AS installedAt, settings_json AS settingsJson FROM seeds WHERE name = ?",
    )
    .get(name) as
    | {
        name: string;
        version: string;
        enabled: number;
        manifestJson: string;
        sourceJson: string | null;
        installedAt: string;
        settingsJson: string;
      }
    | undefined;
  if (!r) return null;
  return {
    name: r.name,
    version: r.version,
    enabled: r.enabled === 1,
    manifest: JSON.parse(r.manifestJson) as SeedManifest,
    source: r.sourceJson,
    installedAt: r.installedAt,
    settings: safeJson(r.settingsJson, {}),
    dir: seedDir(r.name),
  };
}

export function saveSeed(
  db: Db,
  manifest: SeedManifest,
  source: unknown,
  settings: Record<string, unknown> = {},
): void {
  ensureSeedsTable(db);
  db.$raw
    .query(
      "INSERT INTO seeds(name, version, manifest_json, source_json, settings_json) VALUES(?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET version = excluded.version, manifest_json = excluded.manifest_json, source_json = excluded.source_json",
    )
    .run(
      manifest.name,
      manifest.version,
      JSON.stringify(manifest),
      source === undefined ? null : JSON.stringify(source),
      JSON.stringify(settings),
    );
}

export function setEnabled(db: Db, name: string, enabled: boolean): void {
  ensureSeedsTable(db);
  db.$raw.query("UPDATE seeds SET enabled = ? WHERE name = ?").run(enabled ? 1 : 0, name);
}

export function removeSeed(db: Db, name: string): void {
  ensureSeedsTable(db);
  db.$raw.query("DELETE FROM seeds WHERE name = ?").run(name);
  const dir = seedDir(name);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

export function updateSettings(
  db: Db,
  name: string,
  settings: Record<string, unknown>,
): void {
  ensureSeedsTable(db);
  db.$raw
    .query("UPDATE seeds SET settings_json = ? WHERE name = ?")
    .run(JSON.stringify(settings), name);
}

export function seedsRootDir(): string {
  return seedsRoot();
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
