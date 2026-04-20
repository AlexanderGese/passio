import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Db } from "../db/client.js";
import { indexFile } from "./indexer.js";
import { getVaultRoot, resolveDailyNotePath } from "./tools.js";

/**
 * Two-way sync of a `## Daily Todos` section inside the user's daily
 * Obsidian note. Format is standard markdown checkboxes (`- [ ]` / `- [x]`)
 * so the user can edit them directly in Obsidian and Passio picks up the
 * state on the next read.
 */

const HEADING = "## Daily Todos";

function ensureWithinVault(root: string, rel: string): string {
  const { resolve, relative, sep } = require("node:path") as typeof import("node:path");
  const abs = resolve(root, rel);
  const diff = relative(root, abs);
  if (diff.startsWith("..") || diff.includes(`..${sep}`)) {
    throw new Error(`path escapes vault: ${rel}`);
  }
  return abs;
}

export async function syncDailyTodosSection(
  db: Db,
  input: { items: Array<{ text: string; done: boolean }>; date?: string },
): Promise<{ path: string }> {
  const root = await getVaultRoot(db);
  if (!root) throw new Error("obsidian_vault_path is not configured");
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const rel = resolveDailyNotePath(db, date);
  const abs = ensureWithinVault(root, rel);

  const body = input.items
    .map((t) => `- [${t.done ? "x" : " "}] ${t.text.replace(/\r?\n/g, " ").trim()}`)
    .join("\n");

  let existing = "";
  try {
    existing = await readFile(abs, "utf8");
  } catch {
    existing = `# ${date}\n`;
  }

  const section = `${HEADING}\n${body}\n`;
  const updated = existing.includes(HEADING)
    ? existing.replace(/## Daily Todos[\s\S]*?(?=\n##\s|$)/, section)
    : existing.replace(/\s+$/, "") + "\n\n" + section;

  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, updated, "utf8");
  await indexFile(db, root, abs);
  return { path: rel };
}

export async function readDailyTodosSection(
  db: Db,
  input: { date?: string },
): Promise<{ items: Array<{ text: string; done: boolean }>; path: string | null }> {
  const root = await getVaultRoot(db);
  if (!root) return { items: [], path: null };
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const rel = resolveDailyNotePath(db, date);
  const abs = ensureWithinVault(root, rel);

  let existing = "";
  try {
    existing = await readFile(abs, "utf8");
  } catch {
    return { items: [], path: rel };
  }

  const match = existing.match(/## Daily Todos\n([\s\S]*?)(?=\n##\s|$)/);
  if (!match) return { items: [], path: rel };

  const items: Array<{ text: string; done: boolean }> = [];
  for (const line of match[1]!.split("\n")) {
    const m = line.match(/^- \[([ xX])\]\s+(.*)$/);
    if (m) items.push({ done: m[1]!.toLowerCase() === "x", text: m[2]!.trim() });
  }
  return { items, path: rel };
}
