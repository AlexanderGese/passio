/**
 * Wire protocol types shared between the background service worker,
 * content scripts, and the popup/options pages. Mirrors
 * packages/sidecar/src/bridge/server.ts.
 */

export type HelloMsg = { type: "hello"; token: string };
export type AuthOkMsg = { type: "auth_ok" };
export type AuthFailMsg = { type: "auth_fail"; reason: string };
export type PingMsg = { type: "ping"; ts: number };
export type PongMsg = { type: "pong" };
export type RequestMsg = { type: "request"; id: string; tool: string; params: unknown };
export type ResponseMsg =
  | { type: "response"; id: string; ok: true; result: unknown }
  | { type: "response"; id: string; ok: false; error: string };
export type EventMsg = { type: "event"; kind: string; payload: unknown };

export type IncomingMsg = AuthOkMsg | AuthFailMsg | PingMsg | RequestMsg;
export type OutgoingMsg = HelloMsg | PongMsg | ResponseMsg | EventMsg;

export interface PairingInfo {
  port: number;
  token: string;
}
