/**
 * Model router. Picks the appropriate OpenAI model for a given task
 * shape. "Reasoning" models (o3/gpt-5) are preferred for multi-step
 * planning; economy for classification-like calls; standard for chat
 * and transforms. Every choice is overridable per-call.
 */

export type Tier = "economy" | "standard" | "power" | "reasoning";

export function ollamaAvailable(): boolean {
  return Boolean(process.env.PASSIO_OLLAMA_URL);
}
export function ollamaModel(): string {
  return process.env.PASSIO_OLLAMA_MODEL || "llama3.2:3b";
}
export function ollamaUrl(): string {
  return process.env.PASSIO_OLLAMA_URL || "http://localhost:11434";
}

/** Minimal Ollama chat completion. Doesn't stream; returns text. */
export async function ollamaChat(
  prompt: string,
  system?: string,
): Promise<string> {
  const res = await fetch(`${ollamaUrl()}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel(),
      prompt,
      ...(system ? { system } : {}),
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const j = (await res.json()) as { response?: string };
  return (j.response ?? "").trim();
}

export function resolveModel(tier: Tier): string {
  switch (tier) {
    case "economy":
      return process.env.PASSIO_MODEL_ECONOMY || "gpt-4o-mini";
    case "standard":
      return process.env.PASSIO_MODEL_STANDARD || "gpt-4.1";
    case "power":
      return process.env.PASSIO_MODEL_POWER || "gpt-5";
    case "reasoning":
      return process.env.PASSIO_MODEL_REASONING || "o3";
  }
}

/**
 * Heuristic: pick a tier based on prompt length + keyword signals.
 * Surfaces `suggested_tier` so callers can override if they prefer.
 */
export function suggestTierForPrompt(prompt: string): Tier {
  const lower = prompt.toLowerCase();
  const long = prompt.length > 400;
  const reasoningHints =
    /plan|debug|prove|derive|architect|reason|strategy|optimi(s|z)e|algorithm|compare trade.?off/;
  const autoHints = /book|schedule|automate|navigate to|go to|click|type/;
  if (reasoningHints.test(lower) && long) return "reasoning";
  if (autoHints.test(lower)) return "power";
  if (long) return "standard";
  return "economy";
}
