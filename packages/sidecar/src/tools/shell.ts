import { spawn } from "node:child_process";
import type { Db } from "../db/client.js";
import { events } from "../db/schema.js";

/**
 * Guarded shell tool. A command must either:
 *   • match a remembered allowlist entry (stored in settings.value JSON), or
 *   • be user-approved for this invocation (the agent must pass
 *     `approved: true` after showing a countdown/confirmation UI — the HUD
 *     layer handles the interactive confirmation dialog).
 *
 * Output is captured with a 5s wallclock cap and 8 KB buffer cap so we
 * never hand the LLM a wall of logs.
 */

const ALLOW_KEY = "shell_allowlist";
const DEFAULT_ALLOW = ["ls", "pwd", "whoami", "git status", "git diff", "git log", "uname -a"];

function getAllow(db: Db): string[] {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = ?").get(ALLOW_KEY) as
    | { value: string }
    | undefined;
  if (!row) return DEFAULT_ALLOW;
  try {
    return JSON.parse(row.value) as string[];
  } catch {
    return DEFAULT_ALLOW;
  }
}

function setAllow(db: Db, list: string[]): void {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(ALLOW_KEY, JSON.stringify([...new Set(list)]));
}

export function shellAllowList(db: Db): { entries: string[] } {
  return { entries: getAllow(db) };
}

export function shellAllow(db: Db, input: { command: string }): { ok: true } {
  const list = getAllow(db);
  list.push(input.command.trim());
  setAllow(db, list);
  return { ok: true };
}

export async function shellRun(
  db: Db,
  input: { command: string; approved?: boolean; cwd?: string },
): Promise<{ exit_code: number; stdout: string; stderr: string; allowed: boolean }> {
  const cmd = input.command.trim();
  const allowlist = getAllow(db);
  const allowed = allowlist.some((prefix) => cmd === prefix || cmd.startsWith(prefix + " "));
  if (!allowed && !input.approved) {
    throw new Error(
      `command requires approval: '${cmd}' — call with approved:true after user confirms, or add prefix to shell allowlist`,
    );
  }

  const result = await run(cmd, input.cwd);
  await db.insert(events).values({
    kind: "action",
    content: JSON.stringify({ tool: "shell_run", command: cmd, exit_code: result.exit_code }),
    summary: `shell: ${cmd} (exit ${result.exit_code})`,
    importance: 3,
  });

  // Learn: if user approved, promote the prefix to allowlist.
  if (!allowed && input.approved) {
    const prefix = cmd.split(/\s+/).slice(0, 2).join(" ");
    setAllow(db, [...allowlist, prefix]);
  }

  return { ...result, allowed: true };
}

function run(
  cmd: string,
  cwd?: string,
): Promise<{ exit_code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("/bin/bash", ["-lc", cmd], { cwd });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    const CAP = 8_192;
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 500);
    }, 5_000);
    proc.stdout?.on("data", (d: Buffer) => {
      outBytes += d.length;
      if (outBytes <= CAP) outChunks.push(d);
    });
    proc.stderr?.on("data", (d: Buffer) => {
      errBytes += d.length;
      if (errBytes <= CAP) errChunks.push(d);
    });
    proc.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      const stdout = Buffer.concat(outChunks).toString("utf8");
      const stderr = Buffer.concat(errChunks).toString("utf8");
      const truncated = outBytes > CAP || errBytes > CAP;
      resolve({
        exit_code: code ?? -1,
        stdout: truncated ? `${stdout}\n…[truncated ${outBytes} bytes]` : stdout,
        stderr: truncated ? `${stderr}\n…[truncated ${errBytes} bytes]` : stderr,
      });
    });
  });
}

export async function gitCommitMsg(
  db: Db,
  input: { cwd: string; style?: "conventional" | "plain" },
): Promise<{ message: string; diff_lines: number }> {
  const { stdout: diff } = await run("git diff --cached --unified=3", input.cwd);
  if (!diff.trim()) throw new Error("no staged changes");

  const { createOpenAI } = await import("@ai-sdk/openai");
  const { generateText } = await import("ai");
  const openai = createOpenAI({
    apiKey: process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY!,
  });
  const { text } = await generateText({
    model: openai(process.env.PASSIO_MODEL_ECONOMY || "gpt-4o-mini"),
    system:
      input.style === "conventional"
        ? "Write a Conventional Commits message (type(scope): summary) for the diff. Subject ≤72 chars. One blank line then a short body if useful. No prose outside the message."
        : "Write a concise git commit message for the diff. Subject ≤72 chars. Optional short body. No prose outside the message.",
    prompt: diff.slice(0, 8000),
  });
  void db;
  return { message: text.trim(), diff_lines: diff.split("\n").length };
}

export async function gitPrDescription(
  input: { cwd: string; base?: string },
): Promise<{ description: string }> {
  const base = input.base ?? "main";
  const { stdout: log } = await run(`git log --no-merges ${base}..HEAD --pretty=%s%n%b`, input.cwd);
  if (!log.trim()) throw new Error(`no commits between ${base} and HEAD`);

  const { createOpenAI } = await import("@ai-sdk/openai");
  const { generateText } = await import("ai");
  const openai = createOpenAI({
    apiKey: process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY!,
  });
  const { text } = await generateText({
    model: openai(process.env.PASSIO_MODEL_STANDARD || "gpt-4.1"),
    system:
      "Write a PR description: 2–3 sentence summary, then ## Test plan with a short bulleted checklist. No extra sections.",
    prompt: log.slice(0, 12000),
  });
  return { description: text.trim() };
}
