import { z } from "zod";

/**
 * JSON-RPC 2.0 message types spoken between Rust core and Bun sidecar
 * (stdin/stdout) and between sidecar and browser extension (local WS).
 *
 * All messages are JSON lines (one object per line, newline-delimited).
 */

export const RpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.unknown().optional(),
});
export type RpcRequest = z.infer<typeof RpcRequestSchema>;

export const RpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});
export type RpcResponse = z.infer<typeof RpcResponseSchema>;

export const RpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.unknown().optional(),
});
export type RpcNotification = z.infer<typeof RpcNotificationSchema>;

export type RpcMessage = RpcRequest | RpcResponse | RpcNotification;

// === Core RPC methods (sidecar exposes; Rust core calls) ===

export const PingParams = z.object({}).optional();
export const PingResult = z.object({
  pong: z.literal(true),
  sidecarVersion: z.string(),
  uptimeMs: z.number(),
});
export type PingResult = z.infer<typeof PingResult>;

export const ChatParams = z.object({
  prompt: z.string(),
  conversationId: z.number().optional(),
  mode: z.enum(["text", "voice", "proactive"]).default("text"),
});
export type ChatParams = z.infer<typeof ChatParams>;

export const ChatChunk = z.object({
  conversationId: z.number(),
  delta: z.string(),
  done: z.boolean(),
});
export type ChatChunk = z.infer<typeof ChatChunk>;

export const ScanParams = z.object({
  reason: z.enum(["cron", "manual", "force"]),
});
export type ScanParams = z.infer<typeof ScanParams>;

export const VoicePttStartParams = z.object({});
export const VoicePttStopParams = z.object({});

export const ShutdownParams = z.object({
  reason: z.enum(["idle", "user", "crash"]).optional(),
});

/**
 * Registry of all known RPC method names. Use as the single source of truth
 * for both sides of the bus.
 */
export const RpcMethods = {
  PING: "passio.ping",
  CHAT: "passio.chat",
  SCAN: "passio.scan",
  VOICE_PTT_START: "passio.voice.pttStart",
  VOICE_PTT_STOP: "passio.voice.pttStop",
  SHUTDOWN: "passio.shutdown",

  // Sidecar → Rust notifications
  NOTIFY_BUBBLE_STATE: "passio.bubbleState",
  NOTIFY_LOG: "passio.log",
} as const;

export type RpcMethodName = (typeof RpcMethods)[keyof typeof RpcMethods];

// === Bubble state (sidecar → HUD via Rust relay) ===

export const BubbleState = z.object({
  state: z.enum(["idle", "listening", "thinking", "talking", "alert"]),
  message: z.string().optional(),
  badge: z.number().optional(),
});
export type BubbleState = z.infer<typeof BubbleState>;

// === RPC error codes (JSON-RPC reserves -32768 to -32000) ===

export const RpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Passio custom: -32000..-32099
  SIDECAR_NOT_READY: -32000,
  PROVIDER_UNAVAILABLE: -32001,
  TOOL_REJECTED_BY_POLICY: -32002,
  CONTEXT_BUDGET_EXCEEDED: -32003,
} as const;
