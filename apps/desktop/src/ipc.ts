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
