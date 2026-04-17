/**
 * Vercel Sandbox runner. Stubbed for v2.1 — the real client requires
 * a Vercel team + sandbox credentials. When a token is present in env
 * PASSIO_VERCEL_SANDBOX_TOKEN, we POST to the sandbox API; otherwise
 * the tool returns a clear not-configured error so the agent reports
 * it accurately instead of hallucinating an execution.
 */

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

export async function sandboxRun(input: {
  language: "python" | "node" | "bash";
  source: string;
  stdin?: string;
  timeout_ms?: number;
}): Promise<SandboxResult> {
  const token = process.env.PASSIO_VERCEL_SANDBOX_TOKEN;
  if (!token) {
    throw new Error(
      "Vercel Sandbox not configured. Set PASSIO_VERCEL_SANDBOX_TOKEN in your env (stored in OS keyring as 'vercel_sandbox_token'). Until then, use the shell_run tool for local-only execution.",
    );
  }
  const res = await fetch("https://sandbox.vercel.app/api/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      language: input.language,
      source: input.source,
      stdin: input.stdin ?? "",
      timeout_ms: Math.min(Math.max(input.timeout_ms ?? 10_000, 500), 60_000),
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`sandbox ${res.status}: ${err || res.statusText}`);
  }
  return (await res.json()) as SandboxResult;
}
