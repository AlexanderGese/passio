/**
 * Voice pipeline: Whisper STT in, OpenAI TTS out.
 *
 * Audio round-trips as base64 through JSON-RPC — avoids adding a second
 * transport just for blobs. For one-off PTT recordings this is cheap
 * (<200 KB typical). Long-form dictation arrives in a future plan with
 * streaming upload to avoid memory pressure.
 */

const STT_MODEL = process.env.PASSIO_MODEL_STT || "whisper-1";
const TTS_MODEL = process.env.PASSIO_MODEL_TTS || "tts-1-hd";
const DEFAULT_VOICE = process.env.PASSIO_TTS_VOICE || "alloy";

function apiKey(): string {
  const k = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OpenAI API key not configured");
  return k;
}

/** Strict-ish heuristic for mapping our `mime` → a filename the API accepts. */
function fileExtension(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3";
  if (mime.includes("m4a") || mime.includes("mp4")) return "m4a";
  return "webm";
}

export interface TranscribeInput {
  audio_base64: string;
  mime_type?: string; // defaults to audio/webm
  language?: string; // ISO code, e.g. "en"
  prompt?: string;
}

export async function transcribe(input: TranscribeInput): Promise<{ text: string }> {
  const mime = input.mime_type ?? "audio/webm";
  const bytes = Buffer.from(input.audio_base64, "base64");
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });

  const form = new FormData();
  form.append("file", blob, `recording.${fileExtension(mime)}`);
  form.append("model", STT_MODEL);
  if (input.language) form.append("language", input.language);
  if (input.prompt) form.append("prompt", input.prompt);
  form.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`whisper STT ${res.status}: ${err || res.statusText}`);
  }
  const data = (await res.json()) as { text?: string };
  return { text: (data.text ?? "").trim() };
}

export interface SynthesizeInput {
  text: string;
  voice?: "alloy" | "echo" | "fable" | "nova" | "onyx" | "shimmer";
  speed?: number; // 0.25–4.0 per API
  format?: "mp3" | "opus" | "aac" | "flac";
}

export async function synthesize(
  input: SynthesizeInput,
): Promise<{ mime_type: string; audio_base64: string }> {
  const format = input.format ?? "mp3";
  const body = {
    model: TTS_MODEL,
    input: input.text,
    voice: input.voice ?? DEFAULT_VOICE,
    speed: input.speed ?? 1,
    response_format: format,
  };
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`openai TTS ${res.status}: ${err || res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = format === "mp3" ? "audio/mpeg" : `audio/${format}`;
  return { mime_type: mime, audio_base64: buf.toString("base64") };
}
