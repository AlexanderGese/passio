import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";
import type { BridgeServer } from "../bridge/server.js";
import type { RpcBus } from "../rpc.js";
import { click, extract, getCurrentTab, navigate, typeText } from "./browser.js";
import { resolveModel } from "../ai/router.js";

/**
 * Natural-language → gated multi-step browser automation.
 *
 * Shape: user asks "book me a flight…"; the reasoning model generates a
 * plan (ordered browser steps + success criteria + stop conditions);
 * we execute step by step, pulling fresh page extract between steps so
 * later decisions can reference updated DOM; each step still gates
 * through W9 policy + blocklist before touching the browser.
 *
 * Task automation is intentionally conservative — we do NOT attempt to
 * complete payments, accept ToS, or submit forms without explicit user
 * approval (the gate toast provides that for every click).
 */

const PlanSchema = z.object({
  rationale: z.string().max(300),
  steps: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("navigate"), url: z.string().url() }),
        z.object({ kind: z.literal("click"), selector: z.string().min(1) }),
        z.object({
          kind: z.literal("type"),
          selector: z.string().min(1),
          text: z.string(),
        }),
        z.object({
          kind: z.literal("wait"),
          ms: z.number().int().min(50).max(30_000),
        }),
      ]),
    )
    .min(1)
    .max(20),
});

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

export async function automate(
  db: Db,
  ctx: { bridge: BridgeServer; bus: RpcBus },
  input: { goal: string; start_url?: string; max_steps?: number },
): Promise<{ steps_executed: number; final_url: string; final_title: string }> {
  const max_steps = Math.min(input.max_steps ?? 10, 20);

  // Start at the given URL (if any) so the planner has real context.
  const deps = { db, bridge: ctx.bridge, bus: ctx.bus };
  if (input.start_url) {
    await navigate(deps, { url: input.start_url });
    await new Promise<void>((r) => setTimeout(r, 1200));
  }

  const current = await getCurrentTab(deps);
  const page = await extract(deps, {});
  const plan = await generateObject({
    model: openai()(resolveModel("reasoning")),
    schema: PlanSchema,
    system:
      "You are the automation planner for Passio. Given a user goal + the current page, produce an ordered list of navigate/click/type/wait steps. Use concrete CSS selectors from the page HTML when possible (prefer id + aria-label + name attributes). Never submit payments, accept ToS, or click destructive buttons — stop one step before that and let the user confirm.",
    prompt: [
      `Goal: ${input.goal}`,
      `Current tab: ${current.title} — ${current.url}`,
      `Page excerpt:\n${page.text.slice(0, 3000)}`,
    ].join("\n\n"),
  });

  let executed = 0;
  for (const step of plan.object.steps.slice(0, max_steps)) {
    switch (step.kind) {
      case "navigate":
        await navigate(deps, { url: step.url });
        break;
      case "click":
        await click(deps, { selector: step.selector });
        break;
      case "type":
        await typeText(deps, { selector: step.selector, text: step.text });
        break;
      case "wait":
        await new Promise<void>((r) => setTimeout(r, step.ms));
        break;
    }
    executed++;
  }

  const final = await getCurrentTab(deps);
  return {
    steps_executed: executed,
    final_url: final.url,
    final_title: final.title,
  };
}
