import { mkdirSync, writeFileSync, chmodSync, unlinkSync, existsSync, readFileSync } from "node:fs";
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
  /** HTTP RPC handler injection — sidecar main wires the dispatcher here. */
  setHttpRpcDispatcher(fn: (method: string, params: unknown) => Promise<unknown>): void;
  /** Hook the chat-stream HTTP endpoint up to a streaming chat fn. */
  setChatStreamer(
    fn: (
      prompt: string,
      opts: { conversationId?: number; goalId?: number },
    ) => AsyncIterable<{ delta?: string; done?: boolean; text?: string; conversationId?: number }>,
  ): void;
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

  const token = loadOrCreateToken();
  const connected = new Set<ServerWebSocket<{ authed: boolean }>>();
  const pending = new Map<string, PendingResolver>();
  const eventSubs = new Set<(e: { kind: string; payload: unknown }) => void>();

  // Try the user's preferred stable port first so the extension doesn't
  // need a new pairing file every respawn; fall back to OS-assigned.
  const preferredPort = Number(process.env.PASSIO_BRIDGE_PORT ?? 31763);
  const websocket = {
    open(ws: ServerWebSocket<{ authed: boolean }>) {
      ws.data = { authed: false };
      connected.add(ws);
    },
    message(ws: ServerWebSocket<{ authed: boolean }>, message: string | Buffer) {
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
    close(ws: ServerWebSocket<{ authed: boolean }>) {
      connected.delete(ws);
    },
  };
  let httpDispatcher: ((method: string, params: unknown) => Promise<unknown>) | null = null;
  type ChatStreamer = (prompt: string, opts: { conversationId?: number; goalId?: number }) => AsyncIterable<{ delta?: string; done?: boolean; text?: string; conversationId?: number }>;
  let chatStreamer: ChatStreamer | null = null;

  const fetchFn = async (
    req: Request,
    srv: { upgrade: (r: Request, o: { data: { authed: boolean } }) => boolean },
  ): Promise<Response | undefined> => {
    if (srv.upgrade(req, { data: { authed: false } })) return undefined;
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/stream/chat") {
      const headerToken = req.headers.get("x-passio-token") ?? "";
      if (headerToken !== token) return new Response("unauthorized", { status: 401 });
      if (!chatStreamer) return new Response("stream not ready", { status: 503 });
      const body = (await req.json()) as { prompt?: string; conversationId?: number; goalId?: number };
      if (!body.prompt) return new Response("missing prompt", { status: 400 });
      const streamer = chatStreamer;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamer(body.prompt!, {
              ...(body.conversationId !== undefined ? { conversationId: body.conversationId } : {}),
              ...(body.goalId !== undefined ? { goalId: body.goalId } : {}),
            })) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            controller.enqueue(encoder.encode("event: end\ndata: {}\n\n"));
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`,
              ),
            );
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    }
    if (req.method === "POST" && url.pathname === "/rpc") {
      const headerToken = req.headers.get("x-passio-token") ?? "";
      if (headerToken !== token) return new Response("unauthorized", { status: 401 });
      try {
        const body = (await req.json()) as { method?: string; params?: unknown; id?: number | string };
        if (!body.method || typeof body.method !== "string") {
          return Response.json({ error: { code: -32600, message: "missing method" } });
        }
        if (!httpDispatcher) {
          return Response.json({ error: { code: -32000, message: "sidecar not ready" } });
        }
        const result = await httpDispatcher(body.method, body.params ?? {});
        return Response.json({ jsonrpc: "2.0", id: body.id ?? null, result });
      } catch (err) {
        return Response.json({
          jsonrpc: "2.0",
          error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    if (url.pathname === "/health") return new Response("ok", { status: 200 });
    return new Response("passio bridge", { status: 200 });
  };
  let server: ReturnType<typeof Bun.serve<{ authed: boolean }>>;
  try {
    server = Bun.serve<{ authed: boolean }>({
      port: preferredPort,
      hostname: "127.0.0.1",
      websocket,
      fetch: fetchFn,
    });
  } catch {
    server = Bun.serve<{ authed: boolean }>({
      port: 0,
      hostname: "127.0.0.1",
      websocket,
      fetch: fetchFn,
    });
  }

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
    setHttpRpcDispatcher(fn: (method: string, params: unknown) => Promise<unknown>): void {
      httpDispatcher = fn;
    },
    setChatStreamer(fn: ChatStreamer): void {
      chatStreamer = fn;
    },
  };
}

function loadOrCreateToken(): string {
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const tokenFile = join(xdg, "passio", "bridge-token");
  try {
    if (existsSync(tokenFile)) {
      const existing = readFileSync(tokenFile, "utf8").trim();
      if (/^[a-f0-9]{48}$/.test(existing)) return existing;
    }
  } catch { /* fall through */ }
  const token = randomBytes(24).toString("hex");
  try {
    mkdirSync(join(xdg, "passio"), { recursive: true });
    writeFileSync(tokenFile, token);
    chmodSync(tokenFile, 0o600);
  } catch { /* best-effort */ }
  return token;
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
