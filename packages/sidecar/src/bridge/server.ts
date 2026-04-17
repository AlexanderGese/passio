import { mkdirSync, writeFileSync, chmodSync, unlinkSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ServerWebSocket } from "bun";

/**
 * Local WebSocket bridge between the sidecar and the Chrome extension.
 *
 * Protocol (newline-free JSON messages):
 *   client → server: {"type":"hello","token":"..."}
 *   server → client: {"type":"auth_ok"} | {"type":"auth_fail","reason":"..."}
 *
 *   server → client: {"type":"request","id":"uuid","tool":"click","params":{...}}
 *   client → server: {"type":"response","id":"uuid","ok":true,"result":{...}}
 *                    {"type":"response","id":"uuid","ok":false,"error":"..."}
 *
 *   client → server: {"type":"event","kind":"tab_updated","payload":{...}}
 *
 * Pairing: on start the server writes {port, token} to a chmod-600 file
 * under the config dir. The user copies the token into the extension's
 * options page (first-run wizard automates this later).
 */

export interface BridgeMessage {
  type: string;
  [key: string]: unknown;
}

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timeout: Timer;
};

export interface BridgeServer {
  port: number;
  token: string;
  pairingFile: string;
  clients(): number;
  /** Send a tool request to the connected extension; resolves with its response. */
  request<T = unknown>(tool: string, params: unknown, timeoutMs?: number): Promise<T>;
  stop(): Promise<void>;
  /** Subscribe to events published by the extension. */
  onEvent(cb: (evt: { kind: string; payload: unknown }) => void): () => void;
}

const DEFAULT_TIMEOUT = 15_000;

export function startBridge(logger?: (msg: string) => void): BridgeServer {
  const log = (m: string) => {
    if (logger) logger(m);
    else
      console.error(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "passio.log",
          params: { level: "info", message: m },
        }),
      );
  };

  const token = randomBytes(24).toString("hex");
  const connected = new Set<ServerWebSocket<{ authed: boolean }>>();
  const pending = new Map<string, PendingResolver>();
  const eventSubs = new Set<(e: { kind: string; payload: unknown }) => void>();

  const server = Bun.serve<{ authed: boolean }>({
    port: 0, // let the OS pick a free port
    hostname: "127.0.0.1",
    websocket: {
      open(ws) {
        ws.data = { authed: false };
        connected.add(ws);
      },
      message(ws, message) {
        let msg: BridgeMessage;
        try {
          msg = JSON.parse(typeof message === "string" ? message : message.toString());
        } catch {
          ws.send(JSON.stringify({ type: "error", reason: "invalid_json" }));
          return;
        }

        if (!ws.data.authed) {
          if (msg.type === "hello" && typeof msg.token === "string" && msg.token === token) {
            ws.data.authed = true;
            ws.send(JSON.stringify({ type: "auth_ok" }));
            log("extension paired");
          } else {
            ws.send(JSON.stringify({ type: "auth_fail", reason: "bad_token" }));
            ws.close(4001, "auth");
          }
          return;
        }

        if (msg.type === "response" && typeof msg.id === "string") {
          const p = pending.get(msg.id);
          if (!p) return;
          pending.delete(msg.id);
          clearTimeout(p.timeout);
          if (msg.ok) p.resolve(msg.result);
          else p.reject(new Error(String(msg.error ?? "tool error")));
          return;
        }
        if (msg.type === "event" && typeof msg.kind === "string") {
          for (const fn of eventSubs) fn({ kind: msg.kind, payload: msg.payload });
          return;
        }
        if (msg.type === "pong") return;
      },
      close(ws) {
        connected.delete(ws);
      },
    },
    fetch(req, srv) {
      if (srv.upgrade(req, { data: { authed: false } })) return;
      return new Response("passio bridge", { status: 200 });
    },
  });

  const port = server.port ?? 0;
  const pairingFile = writePairingFile(port, token);
  log(`bridge listening on 127.0.0.1:${port} (token in ${pairingFile})`);

  // Heartbeat — keeps MV3 service worker alive and detects dead sockets.
  const heartbeat = setInterval(() => {
    for (const ws of connected) {
      try {
        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      } catch {
        connected.delete(ws);
      }
    }
  }, 20_000);

  function firstAuthed(): ServerWebSocket<{ authed: boolean }> | null {
    for (const ws of connected) {
      if (ws.data.authed) return ws;
    }
    return null;
  }

  return {
    port,
    token,
    pairingFile,
    clients() {
      let n = 0;
      for (const ws of connected) if (ws.data.authed) n++;
      return n;
    },
    async request<T = unknown>(tool: string, params: unknown, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
      const ws = firstAuthed();
      if (!ws) throw new Error("browser extension not connected");
      const id = randomBytes(8).toString("hex");
      return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`browser tool '${tool}' timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (v) => resolve(v as T),
          reject,
          timeout,
        });
        ws.send(JSON.stringify({ type: "request", id, tool, params }));
      });
    },
    onEvent(cb) {
      eventSubs.add(cb);
      return () => eventSubs.delete(cb);
    },
    async stop() {
      clearInterval(heartbeat);
      try {
        unlinkSync(pairingFile);
      } catch {
        /* already gone */
      }
      for (const ws of connected) ws.close(1001, "shutdown");
      server.stop();
    },
  };
}

function writePairingFile(port: number, token: string): string {
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const dir = join(xdg, "passio");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "extension-pairing.json");
  writeFileSync(file, JSON.stringify({ port, token }, null, 2));
  try {
    chmodSync(file, 0o600);
  } catch {
    /* chmod may fail on non-POSIX fs */
  }
  void existsSync;
  return file;
}
