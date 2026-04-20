import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { Db } from "../db/client.js";
import type { RpcBus } from "../rpc.js";
import { readManifestFromDir } from "./registry.js";
import { installFromLocalPath } from "./installer.js";
import { restartSeed, stopSeed } from "./runtime.js";

/**
 * Dev-mode file watcher. Points at a local seed folder, (re-)installs it
 * into the registry on every change + restarts the worker. Debounces
 * rapid edits.
 */

let current: { watcher: FSWatcher; seedName: string } | null = null;

export async function startDev(
  db: Db,
  bus: RpcBus,
  input: { path: string },
): Promise<{ ok: true; name: string }> {
  const abs = resolve(input.path);
  if (!existsSync(abs)) throw new Error(`folder not found: ${abs}`);
  const manifest = readManifestFromDir(abs);
  if (current) await stopDev(db, bus);
  await installFromLocalPath(db, abs);
  await restartSeed(db, bus, manifest.name);
  bus.notify("passio.seed.event", { name: manifest.name, kind: "dev_started", path: abs });

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const watcher = chokidar.watch(abs, {
    ignoreInitial: true,
    ignored: /(^|[\\/])\./,
  });
  const reload = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try {
        await installFromLocalPath(db, abs);
        await restartSeed(db, bus, manifest.name);
        bus.notify("passio.seed.event", { name: manifest.name, kind: "dev_reloaded" });
      } catch (err) {
        bus.notify("passio.seed.event", {
          name: manifest.name,
          kind: "error",
          message: `dev reload failed: ${(err as Error).message}`,
        });
      }
    }, 200);
  };
  watcher.on("add", reload).on("change", reload).on("unlink", reload);
  current = { watcher, seedName: manifest.name };
  return { ok: true, name: manifest.name };
}

export async function stopDev(db: Db, bus: RpcBus): Promise<{ ok: true }> {
  if (!current) return { ok: true };
  await current.watcher.close().catch(() => undefined);
  stopSeed(db, bus, current.seedName);
  bus.notify("passio.seed.event", { name: current.seedName, kind: "dev_stopped" });
  current = null;
  return { ok: true };
}

export function readPanelSrc(dir: string, panelRelPath: string): string {
  const full = resolve(dir, panelRelPath);
  if (!existsSync(full)) throw new Error(`panel not found: ${panelRelPath}`);
  return readFileSync(full, "utf8");
}
