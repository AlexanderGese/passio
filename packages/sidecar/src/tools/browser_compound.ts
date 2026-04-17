import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { Db } from "../db/client.js";
import type { BridgeServer } from "../bridge/server.js";
import { extract } from "./browser.js";
import { noteSave } from "./memory.js";

/**
 * Compound tools that combine a browser call with the LLM. Kept separate
 * from `browser.ts` so that the bridge layer stays provider-agnostic.
 */

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

function standardModel(): string {
  return process.env.PASSIO_MODEL_STANDARD || "gpt-4.1";
}

export async function summarizePage(deps: {
  bridge: BridgeServer;
  db: Db;
  style?: "tldr" | "detailed" | "bullet";
}): Promise<{ url: string; title: string; summary: string }> {
  const extracted = await extract({ bridge: deps.bridge, db: deps.db }, {});
  const style = deps.style ?? "bullet";
  const styleNote = {
    tldr: "Write a 1-sentence TLDR.",
    bullet: "Write 3–6 bullet points, each under 15 words. Focus on concrete facts and conclusions.",
    detailed: "Write a ~150-word summary covering the main arguments and supporting evidence.",
  }[style];
  const { text } = await generateText({
    model: openai()(standardModel()),
    system:
      "You are Passio, a desktop assistant producing a faithful summary of a web page. No opinions, no filler. Preserve the author's stance.",
    prompt: `Page title: ${extracted.title}\nURL: ${extracted.url}\n\n${styleNote}\n\n---\n${extracted.text.slice(0, 12000)}`,
  });
  return { url: extracted.url, title: extracted.title, summary: text.trim() };
}

export async function savePage(deps: {
  bridge: BridgeServer;
  db: Db;
}): Promise<{ noteId: number; url: string }> {
  const extracted = await extract({ bridge: deps.bridge, db: deps.db }, {});
  const body = [
    `# ${extracted.title}`,
    "",
    `> source: ${extracted.url}`,
    extracted.byline ? `> by ${extracted.byline}` : null,
    "",
    extracted.text,
  ]
    .filter((v) => v !== null)
    .join("\n");
  const { id } = await noteSave(deps.db, {
    title: extracted.title,
    body,
    tags: "saved-page",
  });
  return { noteId: id, url: extracted.url };
}

export async function explainSelection(deps: {
  bridge: BridgeServer;
  db: Db;
  text: string;
  url?: string;
}): Promise<{ explanation: string }> {
  void deps.bridge; // reserved for future lookup
  void deps.db;
  const { text } = await generateText({
    model: openai()(standardModel()),
    system:
      "You are Passio explaining a specific highlighted excerpt to the user. Define terms, surface the claim, point out caveats. Respond in <120 words.",
    prompt: deps.url
      ? `From ${deps.url}:\n\n"${deps.text}"\n\nExplain.`
      : `Explain this: "${deps.text}"`,
  });
  return { explanation: text.trim() };
}
