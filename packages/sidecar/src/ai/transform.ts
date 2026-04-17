import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

/** Small fixed-format transforms used by the selection hotkeys. */

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

function standardModel(): string {
  return process.env.PASSIO_MODEL_STANDARD || "gpt-4.1";
}

export type RewriteStyle =
  | "concise"
  | "friendly"
  | "professional"
  | "casual"
  | "clearer"
  | "stronger";

const STYLE_INSTRUCTION: Record<RewriteStyle, string> = {
  concise: "Keep the same meaning; cut filler; prefer short sentences.",
  friendly: "Warm, first-person, a touch of personality — no saccharine energy.",
  professional: "Clear, direct, appropriate for a work email.",
  casual: "Sound like a friend texting. Contractions OK.",
  clearer:
    "Preserve meaning and tone; fix ambiguity, tighten structure, prefer plain language.",
  stronger: "Keep the claim; strengthen the verbs; cut hedging words.",
};

export async function rewrite(input: {
  text: string;
  style?: RewriteStyle;
}): Promise<{ text: string }> {
  const style = input.style ?? "clearer";
  const { text } = await generateText({
    model: openai()(standardModel()),
    system:
      "You are a rewrite tool. Return ONLY the rewritten text — no explanations, no quotation marks, no prefix.",
    prompt: `Rewrite the following text.\nStyle: ${STYLE_INSTRUCTION[style]}\n\n---\n${input.text}`,
  });
  return { text: text.trim() };
}

export async function translate(input: {
  text: string;
  target_language?: string;
}): Promise<{ text: string; target: string }> {
  const target = input.target_language ?? "English";
  const { text } = await generateText({
    model: openai()(standardModel()),
    system:
      "You are a translation tool. Return ONLY the translated text — no explanations, no quotation marks, no prefix. Preserve tone and formatting.",
    prompt: `Translate to ${target}:\n\n${input.text}`,
  });
  return { text: text.trim(), target };
}
