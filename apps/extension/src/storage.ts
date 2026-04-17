import type { PairingInfo } from "./protocol.js";

/**
 * Persist pairing info in chrome.storage.local. The service worker reads
 * this on startup and reconnects to the sidecar WS.
 */

const KEY = "passio.pairing";

export async function getPairing(): Promise<PairingInfo | null> {
  const data = await chrome.storage.local.get(KEY);
  const raw = data[KEY];
  if (!raw || typeof raw !== "object") return null;
  const { port, token } = raw as { port?: number; token?: string };
  if (typeof port !== "number" || typeof token !== "string") return null;
  return { port, token };
}

export async function setPairing(info: PairingInfo | null): Promise<void> {
  if (info === null) {
    await chrome.storage.local.remove(KEY);
    return;
  }
  await chrome.storage.local.set({ [KEY]: info });
}
