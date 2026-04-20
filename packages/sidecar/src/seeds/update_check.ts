import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, cpSync } from "node:fs";
import type { Db } from "../db/client.js";
import { listSeeds } from "./registry.js";
import { SeedManifestSchema } from "@passio/shared";

/**
 * For each installed seed whose source is a GitHub ref, fetch the remote
 * manifest and compare versions. Returns a list of seeds with a newer
 * version available; the user opts in to reinstall.
 */
export async function checkUpdates(
  db: Db,
): Promise<{
  updates: Array<{
    name: string;
    installed: string;
    available: string;
    source: unknown;
  }>;
}> {
  const rows = listSeeds(db);
  const updates: Array<{ name: string; installed: string; available: string; source: unknown }> = [];
  for (const row of rows) {
    const src = row.source as { type?: string; repo?: string; ref?: string; subdir?: string } | null;
    if (!src || src.type !== "github" || !src.repo) continue;
    try {
      const remote = await fetchRemoteManifest(src.repo, src.ref ?? "main", src.subdir);
      if (remote && isNewerVersion(remote.version, row.version)) {
        updates.push({
          name: row.name,
          installed: row.version,
          available: remote.version,
          source: src,
        });
      }
    } catch {
      /* network fail is not fatal */
    }
  }
  return { updates };
}

async function fetchRemoteManifest(repo: string, ref: string, subdir?: string) {
  // Prefer raw.githubusercontent for speed.
  const base = `https://raw.githubusercontent.com/${repo}/${ref}`;
  const path = subdir ? `${subdir}/seed.json` : "seed.json";
  const res = await fetch(`${base}/${path}`);
  if (!res.ok) {
    // Fallback: shallow clone (handles private repos + unusual refs).
    return fetchViaGit(repo, ref, subdir);
  }
  const body = await res.text();
  return SeedManifestSchema.parse(JSON.parse(body));
}

function fetchViaGit(repo: string, ref: string, subdir?: string) {
  const dir = join(tmpdir(), `passio-update-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const clone = spawnSync(
      "git",
      ["clone", "--depth", "1", "--branch", ref, `https://github.com/${repo}.git`, dir],
      { stdio: "ignore" },
    );
    if (clone.status !== 0) return null;
    const manifestPath = join(dir, subdir ?? "", "seed.json");
    if (!existsSync(manifestPath)) return null;
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    return SeedManifestSchema.parse(raw);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    void cpSync;
  }
}

function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split(/[.\-]/).map((s) => Number(s) || 0);
  const pb = b.split(/[.\-]/).map((s) => Number(s) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
