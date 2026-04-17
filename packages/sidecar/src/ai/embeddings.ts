import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

/**
 * OpenAI text-embedding-3-small wrapper. 1536-dim, $0.02/M tokens.
 * API key comes from env `PASSIO_OPENAI_API_KEY` (set by the Rust core
 * from the OS keychain before spawn) or, in dev, plain `OPENAI_API_KEY`.
 */

const MODEL = "text-embedding-3-small";

function apiKey(): string | undefined {
  return process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
}

function client() {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "OpenAI API key not configured (set PASSIO_OPENAI_API_KEY or OPENAI_API_KEY)",
    );
  }
  return createOpenAI({ apiKey: key });
}

/** Embed a single text; returns a Float32 array of length 1536. */
export async function embedText(text: string): Promise<Float32Array> {
  const openai = client();
  const { embedding } = await embed({
    model: openai.textEmbeddingModel(MODEL),
    value: text,
  });
  return new Float32Array(embedding);
}

/** Embed many texts in one call (cheaper; the API batches for us). */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const openai = client();
  const { embeddings } = await embedMany({
    model: openai.textEmbeddingModel(MODEL),
    values: texts,
  });
  return embeddings.map((e) => new Float32Array(e));
}

/** Serialise a vector for `sqlite-vec`. */
export function vecBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

/** True if embeddings are available (API key + network). */
export function embeddingsAvailable(): boolean {
  return Boolean(apiKey());
}
