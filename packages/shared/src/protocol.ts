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

  // Memory / context
  MEMORY_REMEMBER: "passio.memory.remember",
  MEMORY_FORGET: "passio.memory.forget",
  MEMORY_SEARCH: "passio.memory.search",
  // Todos
  TODO_ADD: "passio.todo.add",
  TODO_LIST: "passio.todo.list",
  TODO_DONE: "passio.todo.done",
  // Notes
  NOTE_SAVE: "passio.note.save",
  NOTE_SEARCH: "passio.note.search",
  // Intent
  INTENT_SET: "passio.intent.set",
  INTENT_GET: "passio.intent.get",
  // Goals
  GOAL_CREATE: "passio.goal.create",
  GOAL_LIST: "passio.goal.list",
  GOAL_UPDATE: "passio.goal.update",
  GOAL_DECOMPOSE: "passio.goal.decompose",
  GOAL_REVIEW: "passio.goal.review",
  MILESTONE_ADD: "passio.milestone.add",
  MILESTONE_DONE: "passio.milestone.done",
  MILESTONE_RESCHEDULE: "passio.milestone.reschedule",
  // Focus / packs / DND / proactive
  FOCUS_GET_STATE: "passio.focus.getState",
  FOCUS_START: "passio.focus.start",
  FOCUS_STOP: "passio.focus.stop",
  PACK_GET: "passio.pack.get",
  PACK_SET: "passio.pack.set",
  PACK_CYCLE: "passio.pack.cycle",
  DND_GET: "passio.dnd.get",
  DND_SET: "passio.dnd.set",
  DND_TOGGLE: "passio.dnd.toggle",
  PROACTIVE_GET: "passio.proactive.get",
  PROACTIVE_SET: "passio.proactive.set",
  DISTRACTING_GET: "passio.distracting.get",
  DISTRACTING_SET: "passio.distracting.set",
  DAILY_RECAP: "passio.dailyRecap",
  MORNING_BRIEFING: "passio.morningBriefing",
  // Browser bridge
  BRIDGE_STATUS: "passio.bridge.status",
  BROWSER_GET_CURRENT_TAB: "passio.browser.getCurrentTab",
  BROWSER_SUMMARIZE_PAGE: "passio.browser.summarizePage",

  // Obsidian vault
  VAULT_SET_ROOT: "passio.vault.setRoot",
  VAULT_GET_ROOT: "passio.vault.getRoot",
  VAULT_INDEX: "passio.vault.index",
  VAULT_SEARCH: "passio.vault.search",
  VAULT_READ: "passio.vault.read",
  VAULT_WRITE: "passio.vault.write",
  VAULT_LIST_TAGS: "passio.vault.listTags",
  VAULT_DAILY_RECAP: "passio.vault.dailyRecap",

  // Sidecar → Rust notifications
  NOTIFY_BUBBLE_STATE: "passio.bubbleState",
  NOTIFY_LOG: "passio.log",
  NOTIFY_CHAT_CHUNK: "passio.chat.chunk",
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
