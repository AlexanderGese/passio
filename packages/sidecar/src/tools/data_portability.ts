import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import type { Db } from "../db/client.js";

/**
 * Export the full Passio state as a single tarball. Covers the SQLite DB,
 * all seeds, the bridge pairing, and the current secrets file. Import is
 * guarded — the caller has to pass { wipe: true } to blow away current
 * state before restoring (otherwise we refuse to overwrite).
 *
 * Vault is intentionally NOT copied — the user can rsync that themselves
 * and it's usually tens of gigs.
 */

export async function exportData(_db: Db, input: { destPath: string }): Promise<{ path: string; bytes: number }> {
  const staging = join(tmpdir(), `passio-export-${Date.now()}`);
  mkdirSync(staging, { recursive: true });

  const manifest = {
    kind: "passio-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceHost: process.env.HOSTNAME ?? "unknown",
  };
  writeFileSync(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2));

  const dataDir = xdgData();
  const configDir = xdgConfig();

  cpIfExists(join(dataDir, "db.sqlite"), join(staging, "data/db.sqlite"));
  cpIfExists(join(configDir, "secrets.env"), join(staging, "config/secrets.env"));
  cpIfExists(join(configDir, "bridge-token"), join(staging, "config/bridge-token"));
  cpIfExists(join(configDir, "extension-pairing.json"), join(staging, "config/extension-pairing.json"));
  cpDirIfExists(join(configDir, "seeds"), join(staging, "config/seeds"));

  const dest = input.destPath.endsWith(".tar.gz") ? input.destPath : `${input.destPath}.tar.gz`;
  mkdirSync(dirname(dest), { recursive: true });
  const tar = spawnSync("tar", ["czf", dest, "-C", staging, "."], { stdio: "inherit" });
  try {
    rmSync(staging, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  if (tar.status !== 0) throw new Error("tar failed");
  const st = statSync(dest);
  return { path: dest, bytes: st.size };
}

export async function importData(
  _db: Db,
  input: { sourcePath: string; wipe: boolean },
): Promise<{ restored: string[]; warning?: string }> {
  if (!existsSync(input.sourcePath)) throw new Error(`not found: ${input.sourcePath}`);
  if (!input.wipe) {
    throw new Error(
      "Import would overwrite current state. Pass wipe:true to confirm (this moves current data to *.bak first).",
    );
  }
  const staging = join(tmpdir(), `passio-import-${Date.now()}`);
  mkdirSync(staging, { recursive: true });
  const res = spawnSync("tar", ["xzf", input.sourcePath, "-C", staging], { stdio: "inherit" });
  if (res.status !== 0) throw new Error("tar extraction failed");

  const manifestPath = join(staging, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("manifest.json missing — not a Passio export?");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { kind?: string };
  if (manifest.kind !== "passio-export") throw new Error("not a Passio export bundle");

  const dataDir = xdgData();
  const configDir = xdgConfig();

  const backup = (target: string) => {
    if (!existsSync(target)) return;
    const bak = `${target}.bak-${Date.now()}`;
    try {
      spawnSync("mv", [target, bak]);
    } catch {
      /* ignore */
    }
  };

  const restored: string[] = [];
  const restore = (rel: string, dest: string) => {
    const src = join(staging, rel);
    if (!existsSync(src)) return;
    backup(dest);
    mkdirSync(dirname(dest), { recursive: true });
    if (statSync(src).isDirectory()) {
      spawnSync("cp", ["-r", src, dest]);
    } else {
      copyFileSync(src, dest);
    }
    restored.push(rel);
  };

  restore("data/db.sqlite", join(dataDir, "db.sqlite"));
  restore("config/secrets.env", join(configDir, "secrets.env"));
  restore("config/bridge-token", join(configDir, "bridge-token"));
  restore("config/extension-pairing.json", join(configDir, "extension-pairing.json"));
  restore("config/seeds", join(configDir, "seeds"));

  try {
    rmSync(staging, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  return {
    restored,
    warning: "Passio must be restarted for the imported DB to take effect.",
  };
}

function xdgConfig(): string {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "passio");
}
function xdgData(): string {
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "passio");
}
function cpIfExists(from: string, to: string) {
  if (!existsSync(from)) return;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
function cpDirIfExists(from: string, to: string) {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from)) {
    const src = join(from, e);
    const dst = join(to, e);
    if (statSync(src).isDirectory()) cpDirIfExists(src, dst);
    else copyFileSync(src, dst);
  }
  void basename;
}
