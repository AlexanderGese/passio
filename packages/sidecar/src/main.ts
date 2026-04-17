/**
 * Passio sidecar entrypoint.
 *
 * The sidecar is spawned on-demand by the Rust core and communicates over
 * JSON-RPC 2.0 on stdin/stdout (newline-delimited). It terminates itself
 * after a configurable idle timeout to keep baseline resource usage low.
 *
 * This v1 scaffold handles `passio.ping`, `passio.scan`, and `passio.shutdown`.
 * Richer tools (chat, voice, context engine) layer in during subsequent weeks.
 */
import { RpcMethods, type PingResult } from "@passio/shared";
import { IdleWatchdog } from "./idle.js";
import { RpcBus } from "./rpc.js";

const SIDECAR_VERSION = "0.1.0";
const DEFAULT_IDLE_MS = Number(process.env.PASSIO_IDLE_MS ?? 90_000);

const bus = new RpcBus();
const startedAt = Date.now();

const idle = new IdleWatchdog(DEFAULT_IDLE_MS, () => {
  bus.notify(RpcMethods.NOTIFY_LOG, { level: "info", message: "sidecar idle — shutting down" });
  shutdown("idle");
});

function shutdown(reason: string): void {
  idle.stop();
  bus.notify(RpcMethods.NOTIFY_LOG, { level: "info", message: `sidecar shutdown (${reason})` });
  // Allow queued stdout to flush
  setTimeout(() => process.exit(0), 50);
}

// Bump idle timer on every incoming message (wrap RpcBus.feed)
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

bus.on(RpcMethods.SCAN, async (_params: unknown) => {
  // v1 scaffold: real implementation arrives with Week 5 (proactive loop)
  return { decision: "quiet", reason: "scan pipeline not yet implemented" };
});

bus.on(RpcMethods.CHAT, async (_params: unknown) => {
  // v1 scaffold: real implementation arrives with Week 2 (context engine + AI SDK)
  return { conversationId: 0, delta: "(chat not yet implemented)", done: true };
});

bus.on(RpcMethods.SHUTDOWN, async () => {
  shutdown("user");
  return { ok: true };
});

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
  message: `passio sidecar v${SIDECAR_VERSION} ready (idle timeout ${DEFAULT_IDLE_MS}ms)`,
});
