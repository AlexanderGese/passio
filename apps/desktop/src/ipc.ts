import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BubbleState } from "@passio/shared";

/**
 * Thin wrapper around Tauri IPC. Keeps typed commands and events in one place
 * so the rest of the HUD never touches `invoke`/`listen` directly.
 */

export async function pingSidecar(): Promise<{ pong: true; sidecarVersion: string; uptimeMs: number }> {
  return invoke("ping_sidecar");
}

export async function requestScan(reason: "cron" | "manual" | "force"): Promise<unknown> {
  return invoke("request_scan", { reason });
}

export async function shutdownSidecar(): Promise<void> {
  return invoke("shutdown_sidecar");
}

export function onBubbleState(cb: (state: BubbleState) => void): Promise<UnlistenFn> {
  return listen<BubbleState>("passio://bubble-state", (e) => cb(e.payload));
}

export function onSidecarLog(cb: (log: { level: string; message: string }) => void): Promise<UnlistenFn> {
  return listen<{ level: string; message: string }>("passio://sidecar-log", (e) => cb(e.payload));
}

export function onHotkey(cb: (name: string) => void): Promise<UnlistenFn> {
  return listen<string>("passio://hotkey", (e) => cb(e.payload));
}
