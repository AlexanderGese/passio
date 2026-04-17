import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";
import type { BridgeServer } from "../bridge/server.js";
import type { RpcBus } from "../rpc.js";
import { extract, navigate } from "./browser.js";
import { noteSave } from "./memory.js";

/**
 * Multi-step web research:
 *   1. Power-tier LLM plans 3–8 search queries.
 *   2. For each, navigate → extract (via gated browser tools).
 *   3. Summarise findings with citations.
 *   4. Save as a note tagged `research`.
 */

const PlanSchema = z.object({
  queries: z
    .array(
      z.object({
        q: z.string().min(3).max(200),
        purpose: z.string().max(200),
      }),
    )
    .min(2)
    .max(8),
});

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

const STANDARD = () => process.env.PASSIO_MODEL_STANDARD || "gpt-4.1";
const POWER = () => process.env.PASSIO_MODEL_POWER || "gpt-5";

function searchUrl(q: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

export async function research(
  db: Db,
  ctx: { bridge: BridgeServer; bus: RpcBus },
  input: { topic: string; depth?: "quick" | "standard" | "deep" },
): Promise<{ noteId: number; title: string; url_count: number }> {
  const depth = input.depth ?? "standard";
  const max_visits =
    depth === "quick" ? 2 : depth === "deep" ? 6 : 4;

  // 1. Plan
  const plan = await generateObject({
    model: openai()(POWER()),
    schema: PlanSchema,
    system:
      "You are a research planner. Produce concrete web search queries that will surface primary sources on the topic. Avoid single-word queries. Prefer a few targeted queries over many broad ones.",
    prompt: `Topic: ${input.topic}\nDepth: ${depth}`,
  });

  // 2. Visit + extract
  const findings: Array<{ url: string; title: string; excerpt: string }> = [];
  const deps = { db, bridge: ctx.bridge, bus: ctx.bus };
  for (const { q } of plan.object.queries.slice(0, max_visits)) {
    try {
      await navigate(deps, { url: searchUrl(q) });
      await new Promise<void>((r) => setTimeout(r, 1200));
      const page = await extract(deps, {});
      findings.push({
        url: page.url,
        title: page.title,
        excerpt: page.text.slice(0, 3000),
      });
    } catch (e) {
      findings.push({
        url: searchUrl(q),
        title: `(failed) ${q}`,
        excerpt: (e as Error).message,
      });
    }
  }

  // 3. Synthesise
  const synthesisPrompt = [
    `Topic: ${input.topic}`,
    `Findings (with sources):`,
    ...findings.map(
      (f, i) =>
        `\n[${i + 1}] ${f.title}\n${f.url}\n${f.excerpt.slice(0, 1500)}`,
    ),
    `\nWrite a concise (300-600 word) briefing with inline citations like [1]. End with a "Sources" list.`,
  ].join("\n");

  const { text } = await generateText({
    model: openai()(STANDARD()),
    system:
      "You are a research writer. Summarise evidence accurately, attribute claims via [N] citations, note contradictions, flag low-quality sources. Do not invent facts.",
    prompt: synthesisPrompt,
  });

  const body = [
    `# Research: ${input.topic}`,
    "",
    text.trim(),
    "",
    "## Sources",
    ...findings.map((f, i) => `${i + 1}. [${f.title}](${f.url})`),
  ].join("\n");

  const { id } = await noteSave(db, {
    title: `Research: ${input.topic}`,
    body,
    tags: "research",
  });

  return {
    noteId: id,
    title: `Research: ${input.topic}`,
    url_count: findings.length,
  };
}
