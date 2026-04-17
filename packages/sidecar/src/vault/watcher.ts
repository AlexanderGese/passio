import chokidar, { type FSWatcher } from "chokidar";
import type { Db } from "../db/client.js";
import { indexFile, removeFromIndex } from "./indexer.js";

/**
 * File-system watcher for the Obsidian vault. Debounces per-file changes
 * to coalesce editor write-bursts (Obsidian writes temp + rename).
 */

interface WatcherHandle {
  close(): Promise<void>;
}

const DEBOUNCE_MS = 500;

export function watchVault(db: Db, root: string): WatcherHandle {
  const timers = new Map<string, Timer>();

  const watcher: FSWatcher = chokidar.watch(root, {
    ignored: [/(^|[\\/])\.(git|obsidian|trash)/, /node_modules/, /\/\.[^/]+/],
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    persistent: true,
  });

  function schedule(path: string, task: () => Promise<void>) {
    const existing = timers.get(path);
    if (existing) clearTimeout(existing);
    timers.set(
      path,
      setTimeout(() => {
        timers.delete(path);
        task().catch((err) =>
          console.error(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "passio.log",
              params: {
                level: "warn",
                message: `vault watcher task failed for ${path}: ${(err as Error).message}`,
              },
            }),
          ),
        );
      }, DEBOUNCE_MS),
    );
  }

  watcher.on("add", (path) => {
    if (!path.endsWith(".md")) return;
    schedule(path, () => indexFile(db, root, path));
  });
  watcher.on("change", (path) => {
    if (!path.endsWith(".md")) return;
    schedule(path, () => indexFile(db, root, path));
  });
  watcher.on("unlink", (path) => {
    if (!path.endsWith(".md")) return;
    schedule(path, () => removeFromIndex(db, root, path));
  });

  return {
    async close() {
      for (const t of timers.values()) clearTimeout(t);
      await watcher.close();
    },
  };
}
