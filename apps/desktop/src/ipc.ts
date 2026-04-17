import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BubbleState } from "@passio/shared";

/**
 * Thin typed wrapper around Tauri IPC. Keeps commands and events in one
 * place so the rest of the HUD never touches `invoke`/`listen` directly.
 */

export type Hit = {
  kind: "fact" | "note" | "event";
  id: number;
  content: string;
  score: number;
  source: "vec" | "fts" | "both";
};

export async function pingSidecar(): Promise<{
  pong: true;
  sidecarVersion: string;
  uptimeMs: number;
}> {
  return invoke("ping_sidecar");
}

export async function requestScan(reason: "cron" | "manual" | "force"): Promise<unknown> {
  return invoke("request_scan", { reason });
}

export async function shutdownSidecar(): Promise<void> {
  return invoke("shutdown_sidecar");
}

export async function chat(
  prompt: string,
  conversationId?: number,
): Promise<{ conversationId: number; text: string }> {
  return invoke("chat", {
    prompt,
    conversationId: conversationId ?? null,
  });
}

export async function todoList(
  filter: "open" | "done" | "all" = "open",
): Promise<{ todos: Array<{ id: number; text: string; done: boolean }> }> {
  return invoke("todo_list", { filter });
}

export async function memorySearch(query: string, limit?: number): Promise<{ hits: Hit[] }> {
  return invoke("memory_search", { query, limit: limit ?? null });
}

export type Milestone = {
  id: number;
  goalId: number;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: "pending" | "in_progress" | "done" | "missed";
  sortOrder: number;
  completedAt: string | null;
};

export type Goal = {
  id: number;
  createdAt: string;
  title: string;
  description: string | null;
  category: string | null;
  targetDate: string | null;
  status: "active" | "paused" | "achieved" | "abandoned";
  priority: number;
  progress: number;
  motivation: string | null;
  lastReviewed: string | null;
  milestones: Milestone[];
};

export async function goalList(
  status: "active" | "paused" | "achieved" | "abandoned" | "all" = "active",
): Promise<{ goals: Goal[] }> {
  return invoke("goal_list", { status });
}

export async function goalCreate(input: {
  title: string;
  category?: string;
  target_date: string;
  motivation?: string;
  description?: string;
}): Promise<{ id: number }> {
  return invoke("goal_create", { payload: input });
}

export async function milestoneDone(id: number): Promise<{ ok: true; progress: number }> {
  return invoke("milestone_done", { id });
}

export type BridgeStatus = {
  port: number;
  token: string;
  pairingFile: string;
  connected: boolean;
  clients: number;
};

export async function bridgeStatus(): Promise<BridgeStatus> {
  return invoke("bridge_status");
}

export async function summarizePage(
  style: "bullet" | "tldr" | "detailed" = "bullet",
): Promise<{ url: string; title: string; summary: string }> {
  return invoke("summarize_page", { style });
}

export type Pack = "work" | "study" | "chill" | "custom";
export type ProactiveMode = "check-in" | "active-assist" | "summary-decide";
export type FocusState = {
  active: boolean;
  remainingSeconds: number;
  durationMin: number;
  startedAt: string | null;
};

export const focusApi = {
  state: () => invoke<FocusState>("focus_state"),
  start: (duration_min = 25) => invoke<FocusState>("focus_start", { durationMin: duration_min }),
  stop: () => invoke<FocusState>("focus_stop"),
};
export const packApi = {
  get: () => invoke<{ pack: Pack }>("pack_get"),
  set: (pack: Pack) => invoke<{ ok: true; pack: Pack }>("pack_set", { pack }),
  cycle: () => invoke<{ pack: Pack }>("pack_cycle"),
};
export const dndApi = {
  get: () => invoke<{ until: string | null }>("dnd_get"),
  toggle: () => invoke<{ until: string | null }>("dnd_toggle"),
  set: (minutes: number | null) => invoke<{ until: string | null }>("dnd_set", { minutes }),
};
export const proactiveApi = {
  get: () => invoke<{ mode: ProactiveMode; interval_min: number }>("proactive_get"),
  set: (input: { mode?: ProactiveMode; interval_min?: number }) =>
    invoke<{ ok: true; mode: ProactiveMode; interval_min: number }>("proactive_set", input),
};
export const briefingApi = {
  morning: () => invoke<{ briefing: string }>("morning_briefing"),
  recap: () => invoke<{ dateStr: string; recap: string }>("daily_recap"),
};

export type ScanResult = {
  decision: "quiet" | "nudge" | "act";
  reason: string;
  message?: string;
  proposed_tool?: string;
};
export function onScanResult(cb: (r: ScanResult) => void): Promise<UnlistenFn> {
  return listen<ScanResult>("passio://scan-result", (e) => cb(e.payload));
}

export type SelectionResult = { kind: "rewrite" | "translate"; ok: boolean; text?: string; error?: string };
export function onSelectionResult(cb: (r: SelectionResult) => void): Promise<UnlistenFn> {
  return listen<SelectionResult>("passio://selection-result", (e) => cb(e.payload));
}

export type Persona = {
  name: string;
  pronouns: string;
  voice: "alloy" | "echo" | "fable" | "nova" | "onyx" | "shimmer";
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

export const keychainApi = {
  set: (key: string, value: string) => invoke<void>("keychain_set", { key, value }),
  has: (key: string) => invoke<boolean>("keychain_has", { key }),
  delete: (key: string) => invoke<void>("keychain_delete", { key }),
};

export const voiceApi = {
  transcribe: (input: { audio_base64: string; mime_type?: string; language?: string }) =>
    invoke<{ text: string }>("voice_transcribe", {
      audioBase64: input.audio_base64,
      mimeType: input.mime_type ?? null,
      language: input.language ?? null,
    }),
  synthesize: (input: { text: string; voice?: string }) =>
    invoke<{ mime_type: string; audio_base64: string }>("voice_synthesize", {
      text: input.text,
      voice: input.voice ?? null,
    }),
};

export function onBubbleState(cb: (state: BubbleState) => void): Promise<UnlistenFn> {
  return listen<BubbleState>("passio://bubble-state", (e) => cb(e.payload));
}

export function onSidecarLog(
  cb: (log: { level: string; message: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ level: string; message: string }>("passio://sidecar-log", (e) =>
    cb(e.payload),
  );
}

export function onHotkey(cb: (name: string) => void): Promise<UnlistenFn> {
  return listen<string>("passio://hotkey", (e) => cb(e.payload));
}
