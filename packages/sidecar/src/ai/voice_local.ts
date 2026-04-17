import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

/**
 * Local Whisper STT via whisper.cpp. We shell out to `whisper-cli`
 * (from whisper.cpp), which is the smallest footprint option —
 * avoids pulling a ~150 MB native binding into the Bun compile step.
 *
 * Auto-detects models at:
 *   $PASSIO_WHISPER_MODEL (env path) — takes priority
 *   ~/.config/passio/whisper/ggml-base.en.bin
 *   /usr/share/whisper.cpp/ggml-base.en.bin
 *
 * If neither binary nor model is present, throws a clear install hint.
 */

function modelPath(): string {
  const env = process.env.PASSIO_WHISPER_MODEL;
  if (env && existsSync(env)) return env;
  const candidates = [
    join(homedir(), ".config", "passio", "whisper", "ggml-base.en.bin"),
    join(homedir(), ".local", "share", "passio", "whisper", "ggml-base.en.bin"),
    "/usr/share/whisper.cpp/ggml-base.en.bin",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(
    "whisper model not found. Download ggml-base.en.bin from huggingface and place it in ~/.config/passio/whisper/ggml-base.en.bin (or set PASSIO_WHISPER_MODEL)",
  );
}

function whisperBin(): string {
  return process.env.PASSIO_WHISPER_CLI || "whisper-cli";
}

export async function transcribeLocal(input: {
  audio_base64: string;
  mime_type?: string;
}): Promise<{ text: string; backend: "whisper.cpp" }> {
  const model = modelPath();
  const bytes = Buffer.from(input.audio_base64, "base64");
  const tmp = join("/tmp", `passio-${randomUUID()}.wav`);
  await writeFile(tmp, bytes);
  try {
    const out = await new Promise<string>((resolve, reject) => {
      const proc = spawn(whisperBin(), [
        "-m",
        model,
        "-f",
        tmp,
        "-nt",
        "-np",
        "-otxt",
        "-of",
        tmp + ".out",
      ]);
      let stderr = "";
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("error", (e) => reject(e));
      proc.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`whisper-cli exit ${code}: ${stderr.slice(0, 400)}`));
          return;
        }
        Bun.file(`${tmp}.out.txt`)
          .text()
          .then((t) => resolve(t.trim()))
          .catch(reject);
      });
    });
    return { text: out, backend: "whisper.cpp" };
  } finally {
    await Promise.all([
      unlink(tmp).catch(() => {}),
      unlink(`${tmp}.out.txt`).catch(() => {}),
    ]);
  }
}
