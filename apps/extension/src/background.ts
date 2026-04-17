import type { IncomingMsg, OutgoingMsg, RequestMsg, PairingInfo } from "./protocol.js";
import { getPairing } from "./storage.js";
import * as tools from "./tools.js";

/**
 * Background service worker: maintains the WebSocket to the Passio sidecar,
 * handles auth + ping/pong, dispatches incoming tool requests, and broadcasts
 * connection status via chrome.runtime messages so popup/options UIs can
 * reflect it live.
 */

type ToolHandler = (params: any) => Promise<unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_current_tab: () => tools.getCurrentTab(),
  get_all_tabs: () => tools.getAllTabs(),
  navigate: (p) => tools.navigate(p),
  new_tab: (p) => tools.newTab(p),
  close_tab: (p) => tools.closeTab(p),
  click: (p) => tools.click(p),
  type: (p) => tools.typeText(p),
  scroll: (p) => tools.scroll(p),
  extract: (p) => tools.extract(p),
  screenshot: (p) => tools.screenshot(p),
};

let ws: WebSocket | null = null;
let status: "idle" | "connecting" | "paired" | "unpaired" | "error" = "idle";
let lastError: string | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;

function broadcast() {
  void chrome.runtime
    .sendMessage({
      type: "passio.status",
      status,
      lastError,
    })
    .catch(() => undefined);
}

function setStatus(s: typeof status, err?: string) {
  status = s;
  lastError = err ?? null;
  broadcast();
}

function send(msg: OutgoingMsg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

async function handleRequest(msg: RequestMsg) {
  const handler = TOOL_HANDLERS[msg.tool];
  if (!handler) {
    send({ type: "response", id: msg.id, ok: false, error: `unknown tool: ${msg.tool}` });
    return;
  }
  try {
    const result = await handler((msg.params ?? {}) as never);
    send({ type: "response", id: msg.id, ok: true, result });
  } catch (err) {
    send({
      type: "response",
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function scheduleReconnect(pairing: PairingInfo) {
  if (reconnectTimer !== null) return;
  reconnectAttempt += 1;
  const delay = Math.min(1_000 * 2 ** Math.min(reconnectAttempt - 1, 5), 30_000);
  reconnectTimer = self.setTimeout(() => {
    reconnectTimer = null;
    void connect(pairing);
  }, delay);
}

async function connect(pairing: PairingInfo) {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  setStatus("connecting");
  try {
    ws = new WebSocket(`ws://127.0.0.1:${pairing.port}/`);
  } catch (e) {
    setStatus("error", e instanceof Error ? e.message : String(e));
    scheduleReconnect(pairing);
    return;
  }
  ws.addEventListener("open", () => {
    send({ type: "hello", token: pairing.token });
  });
  ws.addEventListener("message", (ev) => {
    let parsed: IncomingMsg;
    try {
      parsed = JSON.parse(typeof ev.data === "string" ? ev.data : "{}");
    } catch {
      return;
    }
    if (parsed.type === "auth_ok") {
      reconnectAttempt = 0;
      setStatus("paired");
      return;
    }
    if (parsed.type === "auth_fail") {
      setStatus("unpaired", parsed.reason);
      ws?.close();
      return;
    }
    if (parsed.type === "ping") {
      send({ type: "pong" });
      return;
    }
    if (parsed.type === "request") {
      void handleRequest(parsed);
      return;
    }
  });
  ws.addEventListener("close", () => {
    if (status !== "unpaired") setStatus("idle");
    ws = null;
    scheduleReconnect(pairing);
  });
  ws.addEventListener("error", () => {
    setStatus("error", "socket error");
  });
}

async function boot() {
  const pairing = await getPairing();
  if (!pairing) {
    setStatus("unpaired");
    return;
  }
  reconnectAttempt = 0;
  void connect(pairing);
}

chrome.runtime.onInstalled.addListener(() => void boot());
chrome.runtime.onStartup.addListener(() => void boot());

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "passio.get_status") {
    sendResponse({ status, lastError });
    return;
  }
  if (msg?.type === "passio.reconnect") {
    // Options page saved new pairing — reset and reconnect.
    reconnectAttempt = 0;
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
    void boot();
    sendResponse({ ok: true });
    return;
  }
});

// Also boot at worker wake time.
void boot();
