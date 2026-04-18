import { spawn } from "node:child_process";
import { basename } from "node:path";
import type { Db } from "../db/client.js";
import { noteSave } from "./memory.js";

/**
 * PDF ingestion via `pdftotext` (poppler-utils). Avoids pulling pdf-parse
 * into the Bun compile; poppler is everywhere on Linux and a `brew
 * install poppler` on mac. If the binary is missing we throw a clear
 * install hint.
 *
 * Extract → chunk summary (first 8k chars) → save as note tagged `pdf`.
 * The memory tool path automatically embeds the body when vec is loaded.
 */

export async function pdfIngest(
  db: Db,
  input: { path: string; title?: string; tags?: string },
): Promise<{ noteId: number; pages_guess: number; chars: number }> {
  const text = await runPdftotext(input.path);
  const chars = text.length;
  const pagesGuess = (text.match(/\f/g)?.length ?? 0) + 1;

  const title = (input.title ?? basename(input.path).replace(/\.pdf$/i, "")).trim();
  const body = [
    `# ${title}`,
    "",
    `> source: ${input.path}`,
    `> ${pagesGuess} page${pagesGuess === 1 ? "" : "s"} · ${chars.toLocaleString()} chars`,
    "",
    text,
  ].join("\n");

  const tagList = ["pdf", ...(input.tags ? input.tags.split(/[,\s]+/).filter(Boolean) : [])];
  const { id } = await noteSave(db, { title, body, tags: tagList.join(",") });
  return { noteId: id, pages_guess: pagesGuess, chars };
}

function runPdftotext(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pdftotext", ["-layout", "-nopgbrk", path, "-"]);
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") {
        reject(
          new Error(
            "`pdftotext` not installed. `sudo apt install poppler-utils` (Linux) or `brew install poppler` (mac) to enable PDF ingestion.",
          ),
        );
        return;
      }
      reject(e);
    });
    proc.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`pdftotext exit ${code}: ${stderr.trim().slice(0, 400)}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}
