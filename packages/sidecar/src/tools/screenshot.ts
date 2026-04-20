import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { Db } from "../db/client.js";
import { logUsage } from "./cost.js";

/**
 * Screenshot-and-ask. On Linux with maim + slop (most X11 distros, incl.
 * Kali), we grab a user-selected region, base64 it, and ask the vision
 * model. On Wayland users need grim+slurp; we fall back to gnome-screenshot
 * or scrot for best-effort coverage.
 */

export async function screenshotAndAsk(
  db: Db,
  input: { question?: string },
): Promise<{ answer: string; path: string | null }> {
  const file = join(tmpdir(), `passio-shot-${Date.now()}.png`);
  const took = tryCapture(file);
  if (!took) {
    return { answer: "No screenshot tool found. Install maim+slop or grim+slurp.", path: null };
  }

  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    return { answer: "Set an OpenAI key in Settings to use vision.", path: file };
  }
  const bytes = readFileSync(file);
  const b64 = bytes.toString("base64");
  const question = input.question?.trim() || "What is shown in this screenshot? Be concise.";

  const openai = createOpenAI({ apiKey: key });
  const model = process.env.PASSIO_MODEL_VISION || "gpt-4o-mini";
  try {
    const { text, usage } = await generateText({
      model: openai(model),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image", image: `data:image/png;base64,${b64}` },
          ],
        },
      ],
    });
    logUsage(db, {
      tier: "economy",
      model,
      inTokens: usage?.inputTokens ?? 0,
      outTokens: usage?.outputTokens ?? 0,
    });
    try {
      unlinkSync(file);
    } catch {
      /* ignore */
    }
    return { answer: text, path: null };
  } catch (err) {
    return { answer: `Vision failed: ${(err as Error).message}`, path: file };
  }
}

function tryCapture(file: string): boolean {
  const candidates = [
    ["maim", "-s", file],
    ["flameshot", "gui", "-p", file],
    ["gnome-screenshot", "-a", "-f", file],
    ["scrot", "-s", file],
    ["grim", "-g", "$(slurp)", file],
  ];
  for (const [bin, ...args] of candidates) {
    try {
      const res = spawnSync(bin as string, args as string[], {
        stdio: "ignore",
        shell: bin === "grim",
      });
      if (res.status === 0) return true;
    } catch {
      /* next */
    }
  }
  return false;
}
