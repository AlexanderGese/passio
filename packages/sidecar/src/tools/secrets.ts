import { spawn } from "node:child_process";
import type { Db } from "../db/client.js";

/**
 * Encrypted secrets vault. v2 uses the user's existing `pass` (UNIX
 * password manager) when available — that gives us GPG-encrypted
 * per-secret files under ~/.password-store without rolling our own
 * crypto. Passio just wraps list/get/set/delete.
 *
 * Detection: checks for `pass` on PATH. If missing, falls back to a
 * local AES-backed store keyed on the OS keyring (future work; throws
 * with a clear install hint for now).
 *
 * Namespace: secrets live under `passio/<name>`.
 */

function runPass(
  args: string[],
  stdin?: string,
): Promise<{ exit: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pass", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => reject(e));
    proc.on("exit", (code) => resolve({ exit: code ?? -1, stdout, stderr }));
    if (stdin !== undefined) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }
  });
}

async function ensurePass(): Promise<void> {
  const { exit } = await runPass(["--version"]).catch(() => ({
    exit: -1,
    stdout: "",
    stderr: "",
  }));
  if (exit !== 0) {
    throw new Error(
      "`pass` (UNIX password store) not installed. `sudo apt install pass` and `pass init <gpg-id>` to enable secret vault.",
    );
  }
}

export async function secretSet(
  _db: Db,
  input: { name: string; value: string },
): Promise<{ ok: true }> {
  await ensurePass();
  const path = `passio/${sanitise(input.name)}`;
  const { exit, stderr } = await runPass(["insert", "-m", "-f", path], input.value);
  if (exit !== 0) throw new Error(`pass insert failed: ${stderr.trim()}`);
  return { ok: true };
}

export async function secretGet(
  _db: Db,
  input: { name: string },
): Promise<{ value: string } | null> {
  await ensurePass();
  const path = `passio/${sanitise(input.name)}`;
  const { exit, stdout } = await runPass(["show", path]);
  if (exit !== 0) return null;
  return { value: stdout.split("\n")[0] ?? "" };
}

export async function secretList(_db: Db): Promise<{ names: string[] }> {
  await ensurePass();
  const { exit, stdout } = await runPass(["ls", "passio"]);
  if (exit !== 0) return { names: [] };
  const names: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim().replace(/^[├└│─\s]+/, "");
    if (trimmed && !trimmed.endsWith("/") && !trimmed.startsWith("Password Store")) {
      names.push(trimmed);
    }
  }
  return { names };
}

export async function secretDelete(
  _db: Db,
  input: { name: string },
): Promise<{ ok: true }> {
  await ensurePass();
  const path = `passio/${sanitise(input.name)}`;
  const { exit, stderr } = await runPass(["rm", "-f", path]);
  if (exit !== 0) throw new Error(`pass rm failed: ${stderr.trim()}`);
  return { ok: true };
}

function sanitise(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-./]/g, "_");
}
