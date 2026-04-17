import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as sqliteVec from "sqlite-vec";
import { migrate } from "./migrations.js";
import * as schema from "./schema.js";

export type Db = BunSQLiteDatabase<typeof schema> & {
  $raw: Database;
  $hasVec: boolean;
};

/**
 * Resolve the SQLite path under XDG_DATA_HOME or ~/.local/share/passio/.
 * Respects PASSIO_DB_PATH for testing.
 */
export function resolveDbPath(): string {
  if (process.env.PASSIO_DB_PATH) return process.env.PASSIO_DB_PATH;
  const xdg = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(xdg, "passio", "db.sqlite");
}

/**
 * Open the DB, attempt to load sqlite-vec, run migrations, return Drizzle.
 * `hasVec=false` when the extension fails to load — retrieval falls back
 * to FTS-only on those systems (vector search disabled).
 */
export function openDb(path = resolveDbPath()): Db {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path, { create: true });

  // Optional SQLCipher at-rest encryption: if PASSIO_DB_CIPHER_KEY is set,
  // apply `PRAGMA key = '<key>'` before any DDL. Note: this requires the
  // SQLite binary to be compiled with SQLCipher — stock `bun:sqlite` does
  // NOT include it. Ship a SQLCipher-patched binary and set
  // PASSIO_SQLITE_LIB to the path, then bun:sqlite loads that lib.
  const cipherKey = process.env.PASSIO_DB_CIPHER_KEY;
  if (cipherKey) {
    try {
      raw.exec(`PRAGMA key = ${JSON.stringify(cipherKey)}`);
    } catch (e) {
      console.error(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "passio.log",
          params: {
            level: "warn",
            message: `SQLCipher PRAGMA failed — binary not SQLCipher-compiled? ${(e as Error).message}`,
          },
        }),
      );
    }
  }

  let hasVec = false;
  // Prefer an explicit path (set by the Rust core / dev script) because
  // the sqlite-vec npm layout isn't accessible from inside `bun --compile`
  // binaries. Fall back to the npm loader for plain `bun run` dev.
  const explicit = process.env.PASSIO_VEC_SO;
  try {
    if (explicit) {
      (raw as unknown as { loadExtension: (p: string, entry?: string) => void }).loadExtension(
        explicit,
      );
      hasVec = true;
    } else {
      sqliteVec.load(raw);
      hasVec = true;
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "passio.log",
        params: {
          level: "warn",
          message: `sqlite-vec not loaded — vector search disabled: ${(err as Error).message}`,
        },
      }),
    );
  }

  migrate(raw, hasVec);

  const orm = drizzle(raw, { schema }) as unknown as Db;
  orm.$raw = raw;
  orm.$hasVec = hasVec;
  return orm;
}

void existsSync; // keep import for clarity; path creation uses mkdirSync
