import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// =====================================================================
// Tauri command bridges (Rust → JS)
// =====================================================================

export type BubbleState = "idle" | "thinking" | "talking" | "alert";

export type ChatChunk = {
  conversationId: number;
  delta: string;
  done: boolean;
};

export function onChatChunk(cb: (c: ChatChunk) => void): Promise<UnlistenFn> {
  return listen<ChatChunk>("passio://chat-chunk", (e) => cb(e.payload));
}

export function onBubbleState(cb: (state: BubbleState) => void): Promise<UnlistenFn> {
  return listen<{ state: BubbleState; message?: string; badge?: number }>(
    "passio://bubble-state",
    (e) => cb(e.payload.state),
  );
}

export function onSidecarLog(
  cb: (log: { level: "info" | "warn" | "error"; message: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ level: "info" | "warn" | "error"; message: string }>(
    "passio://sidecar-log",
    (e) => cb(e.payload),
  );
}

export function onHotkey(cb: (name: string) => void): Promise<UnlistenFn> {
  return listen<string>("passio://hotkey", (e) => cb(e.payload));
}

// =====================================================================
// Sidecar JSON-RPC pass-through
// =====================================================================

async function sidecarCall<T>(method: string, params?: unknown): Promise<T> {
  return invoke<T>("sidecar_passthrough", { method, params: params ?? {} });
}

export async function pingSidecar(): Promise<{ pong: true; sidecarVersion: string; uptimeMs: number }> {
  return sidecarCall("passio.ping");
}

// --- Chat ---
export function chat(prompt: string, conversationId?: number): Promise<{ conversationId: number; text: string }> {
  return sidecarCall("passio.chat", {
    prompt,
    ...(conversationId !== undefined ? { conversationId } : {}),
  });
}

export type ConversationSummary = {
  id: number;
  startedAt: string;
  preview: string;
  messageCount: number;
};

export type ConversationDetail = {
  id: number;
  messages: { role: "user" | "assistant"; content: string; ts: string }[];
};

export const chatHistoryApi = {
  list: () => sidecarCall<{ conversations: ConversationSummary[] }>("passio.chat.list"),
  get: (id: number) =>
    sidecarCall<ConversationDetail>("passio.chat.get", { id }),
  search: (q: string, limit = 20) =>
    sidecarCall<{ hits: { conversationId: number; messageId: number; snippet: string; ts: string }[] }>(
      "passio.chat.search",
      { query: q, limit },
    ),
};

// --- Todos / notes / memory ---
export type Todo = {
  id: number;
  text: string;
  done: boolean;
  priority: number;
  dueAt: string | null;
  project: string | null;
  goalId: number | null;
};

export const todoApi = {
  list: (filter: "open" | "done" | "all" = "open") =>
    sidecarCall<{ todos: Todo[] }>("passio.todo.list", { filter }),
  add: (input: { text: string; priority?: number; due_at?: string; project?: string }) =>
    sidecarCall<{ id: number }>("passio.todo.add", input),
  done: (id: number) => sidecarCall<{ ok: true }>("passio.todo.done", { id }),
  delete: (id: number) => sidecarCall<{ ok: true }>("passio.todo.delete", { id }),
  update: (input: { id: number; text?: string; priority?: number; due_at?: string | null; project?: string | null }) =>
    sidecarCall<{ ok: true }>("passio.todo.update", input),
};

export const noteApi = {
  save: (input: { title?: string; body: string; tags?: string }) =>
    sidecarCall<{ id: number }>("passio.note.save", input),
};

// --- Persona + keybinds (settings) ---
export type Persona = {
  name: string;
  pronouns: string;
  voice: string;
};

export const personaApi = {
  get: (): Promise<Persona> => invoke<Persona>("persona_get"),
  set: (patch: Partial<Persona>): Promise<Persona> => invoke<Persona>("persona_set", { patch }),
};

export type Keybinds = Record<string, string>;
export const keybindsApi = {
  get: (): Promise<Keybinds> => invoke<Keybinds>("keybinds_get"),
  set: (patch: Keybinds): Promise<Keybinds> => invoke<Keybinds>("keybinds_set", { patch }),
};

// --- OpenAI key (OS keyring) ---
export const keychainApi = {
  set: (name: string, value: string) => invoke<void>("keychain_set", { name, value }),
  has: (name: string) => invoke<boolean>("keychain_has", { name }),
  delete: (name: string) => invoke<void>("keychain_delete", { name }),
};

// --- Spotlight ---
export const spotlightApi = {
  search: (query: string) =>
    sidecarCall<{
      hits: Array<{
        kind: "todo" | "fact" | "note" | "goal" | "conversation" | "file" | "vault" | "app";
        id: number;
        title: string;
        snippet: string;
        score: number;
        exec?: string;
        path?: string;
        icon?: string;
        iconUrl?: string;
      }>;
    }>("passio.spotlight.search", { query }),
};

// --- Auto-loop ---
export type AutoLoopRow = {
  id: number;
  task: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  stepCount: number;
  replanCount: number;
  costUsd: number;
  maxCostUsd: number;
  lastMessage: string | null;
};

export type AutoLoopEvent = {
  id: number;
  ts: string;
  kind: string;
  title: string | null;
  content: string | null;
};

export const autoLoopApi = {
  start: (input: { task: string; maxSteps?: number; maxCostUsd?: number }) =>
    sidecarCall<{ id: number }>("passio.autoLoop.start", input),
  cancel: (id: number) => sidecarCall<{ ok: boolean }>("passio.autoLoop.cancel", { id }),
  resume: (input: { id: number; maxSteps?: number; maxCostUsd?: number }) =>
    sidecarCall<{ id: number }>("passio.autoLoop.resume", input),
  list: (input: { limit?: number; status?: string } = {}) =>
    sidecarCall<{ loops: AutoLoopRow[] }>("passio.autoLoop.list", input),
  events: (id: number) => sidecarCall<{ events: AutoLoopEvent[] }>("passio.autoLoop.events", { id }),
};

export function onAutoLoopUpdate(
  cb: (update: { id: number; status: string; message: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ id: number; status: string; message: string }>(
    "passio://auto-loop-update",
    (e) => cb(e.payload),
  );
}
