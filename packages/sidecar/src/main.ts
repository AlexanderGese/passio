/**
 * Passio sidecar entrypoint.
 *
 * The sidecar is spawned on-demand by the Rust core and communicates over
 * JSON-RPC 2.0 on stdin/stdout (newline-delimited). It terminates itself
 * after a configurable idle timeout to keep baseline resource usage low.
 *
 * v1 scope:
 *   - passio.ping, passio.shutdown (scaffold)
 *   - passio.chat  (AI SDK agent loop w/ tool calling)
 *   - passio.scan  (scaffold; full proactive loop arrives in week 5)
 *   - Memory / todo / note / intent RPCs for direct HUD & agent use
 */
import { RpcMethods, type PingResult } from "@passio/shared";
import { chat } from "./ai/agent.js";
import { openDb } from "./db/client.js";
import { IdleWatchdog } from "./idle.js";
import { RpcBus } from "./rpc.js";
import {
  getIntent,
  memoryForget,
  memoryRemember,
  memorySearch,
  noteSave,
  noteSearch,
  setIntent,
  todoAdd,
  todoDone,
  todoList,
} from "./tools/memory.js";

const SIDECAR_VERSION = "0.2.0";
const DEFAULT_IDLE_MS = Number(process.env.PASSIO_IDLE_MS ?? 90_000);

const bus = new RpcBus();
const startedAt = Date.now();

// Open DB eagerly — SQLite open is ~2ms; the expensive thing is the
// embeddings network call which is lazy.
const db = openDb();

const idle = new IdleWatchdog(DEFAULT_IDLE_MS, () => {
  bus.notify(RpcMethods.NOTIFY_LOG, { level: "info", message: "sidecar idle — shutting down" });
  shutdown("idle");
});

function shutdown(reason: string): void {
  idle.stop();
  try {
    db.$raw.close();
  } catch {
    /* already closed */
  }
  bus.notify(RpcMethods.NOTIFY_LOG, { level: "info", message: `sidecar shutdown (${reason})` });
  setTimeout(() => process.exit(0), 50);
}

// Bump idle timer on every incoming message
const originalFeed = bus.feed.bind(bus);
bus.feed = async (chunk: string) => {
  idle.bump();
  return originalFeed(chunk);
};

bus.on(RpcMethods.PING, async (): Promise<PingResult> => ({
  pong: true,
  sidecarVersion: SIDECAR_VERSION,
  uptimeMs: Date.now() - startedAt,
}));

bus.on(RpcMethods.SHUTDOWN, async () => {
  shutdown("user");
  return { ok: true };
});

bus.on(RpcMethods.SCAN, async () => ({
  decision: "quiet",
  reason: "scan pipeline not yet implemented (week 5)",
}));

bus.on(RpcMethods.CHAT, async (params: unknown) => {
  const { prompt, conversationId } = params as {
    prompt: string;
    conversationId?: number;
  };
  return chat(db, (m, p) => bus.notify(m, p), { prompt, conversationId });
});

// Direct memory / todo / note / intent RPCs (for the HUD to call without
// going through the LLM — cheap, deterministic, local).
bus.on(RpcMethods.MEMORY_REMEMBER, async (params: unknown) =>
  memoryRemember(db, params as Parameters<typeof memoryRemember>[1]),
);
bus.on(RpcMethods.MEMORY_FORGET, async (params: unknown) =>
  memoryForget(db, params as Parameters<typeof memoryForget>[1]),
);
bus.on(RpcMethods.MEMORY_SEARCH, async (params: unknown) =>
  memorySearch(db, params as Parameters<typeof memorySearch>[1]),
);
bus.on(RpcMethods.TODO_ADD, async (params: unknown) =>
  todoAdd(db, params as Parameters<typeof todoAdd>[1]),
);
bus.on(RpcMethods.TODO_LIST, async (params: unknown) =>
  todoList(db, params as Parameters<typeof todoList>[1]),
);
bus.on(RpcMethods.TODO_DONE, async (params: unknown) =>
  todoDone(db, params as Parameters<typeof todoDone>[1]),
);
bus.on(RpcMethods.NOTE_SAVE, async (params: unknown) =>
  noteSave(db, params as Parameters<typeof noteSave>[1]),
);
bus.on(RpcMethods.NOTE_SEARCH, async (params: unknown) =>
  noteSearch(db, params as Parameters<typeof noteSearch>[1]),
);
bus.on(RpcMethods.INTENT_SET, async (params: unknown) =>
  setIntent(db, params as Parameters<typeof setIntent>[1]),
);
bus.on(RpcMethods.INTENT_GET, async () => getIntent(db));

// === Wire stdin ===
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk: string) => {
  try {
    await bus.feed(chunk);
  } catch (err) {
    bus.notify(RpcMethods.NOTIFY_LOG, {
      level: "error",
      message: `feed error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});
process.stdin.on("end", () => shutdown("stdin-closed"));

// === Signals ===
process.on("SIGTERM", () => shutdown("sigterm"));
process.on("SIGINT", () => shutdown("sigint"));

// === Boot ===
idle.start();
bus.notify(RpcMethods.NOTIFY_LOG, {
  level: "info",
  message: `passio sidecar v${SIDECAR_VERSION} ready (idle timeout ${DEFAULT_IDLE_MS}ms, hasVec=${db.$hasVec})`,
});
