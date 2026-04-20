import { invoke } from "@tauri-apps/api/core";

/**
 * Passthrough helper for ad-hoc sidecar RPC calls from widgets that don't
 * yet have a dedicated typed wrapper in ipc.ts.
 */
export async function sidecarCall<T = unknown>(method: string, params?: unknown): Promise<T> {
  return invoke<T>("sidecar_passthrough", { method, params: params ?? {} });
}
