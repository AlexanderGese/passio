import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { SeedBridgeMessage, SeedManifest } from "@passio/shared";
import type { Db } from "../db/client.js";
import type { RpcBus } from "../rpc.js";
import { getSeed, listSeeds, setEnabled } from "./registry.js";
import { seedDir } from "./paths.js";

/**
 * Per-seed runtime. Each enabled seed gets a dedicated Bun Worker with a
 * capability-gated `passio` global injected via a generated preamble file.
 * Host ↔ seed communicate via SeedBridgeMessage postMessage envelopes.
 *
 * v1 scope deliberately avoids full isolation (Bun workers share the
 * process heap). We enforce capability checks on the host side for every
 * RPC call, so a malicious seed can't bypass by skipping the proxy — it
 * would have to find a native escape, same as any JS running in-process.
 * If that becomes a concern we can move to a subprocess per seed later.
 */

export interface RunningSeed {
  name: string;
  worker: Worker;
  manifest: SeedManifest;
  tools: Map<string, { description?: string; input?: unknown }>;
  hotkeyHandlers: Map<string, true>;
  schedulerTimers: Map<string, ReturnType<typeof setInterval>>;
  kv: Map<string, unknown>; // persisted in seed-scoped settings bucket
  logBuffer: Array<{ ts: number; level: string; message: string }>;
  ready: Promise<void>;
}

const running = new Map<string, RunningSeed>();

export function isRunning(name: string): boolean {
  return running.has(name);
}

export function registeredTools(): Array<{ seed: string; name: string; description?: string }> {
  const out: Array<{ seed: string; name: string; description?: string }> = [];
  for (const [seed, rs] of running) {
    for (const [tname, meta] of rs.tools) {
      out.push({ seed, name: tname, description: meta.description });
    }
  }
  return out;
}

/** Returns the seed-declared tabs flagged with `promoteToMainTab` from every
 *  currently running seed. The HUD renders these alongside its built-ins. */
export function promotedMainTabs(): Array<{
  seed: string;
  id: string;
  title: string;
  icon?: string;
  panel: string;
}> {
  const out: Array<{ seed: string; id: string; title: string; icon?: string; panel: string }> = [];
  for (const [seed, rs] of running) {
    const tabs = rs.manifest.contributes?.tabs ?? [];
    for (const t of tabs) {
      if (t.promoteToMainTab) {
        out.push({
          seed,
          id: t.id,
          title: t.title,
          panel: t.panel,
          ...(t.icon ? { icon: t.icon } : {}),
        });
      }
    }
  }
  return out;
}

export function logsFor(name: string): RunningSeed["logBuffer"] {
  return running.get(name)?.logBuffer ?? [];
}

export async function startSeed(
  db: Db,
  bus: RpcBus,
  name: string,
): Promise<{ ok: boolean; reason?: string }> {
  const row = getSeed(db, name);
  if (!row) return { ok: false, reason: "not_installed" };
  if (running.has(name)) return { ok: true };
  const dir = seedDir(name);
  if (!existsSync(dir)) return { ok: false, reason: "missing_folder" };

  const manifest = row.manifest;
  const entry = resolve(dir, manifest.entry ?? "./index.js");
  if (!existsSync(entry)) return { ok: false, reason: `entry missing: ${entry}` };

  // License gate — only for seeds that declared `licensed: true`. The key
  // lives in the seed's own settings blob under `license`. We verify
  // locally against the manifest's `licensePublicKey`; no network call.
  if (manifest.licensed) {
    const license =
      typeof row.settings?.license === "string" ? (row.settings.license as string) : "";
    if (!license.trim()) {
      bus.notify("passio.seed.event", {
        name,
        kind: "error",
        message: "This seed is paid — paste your license in Grove → seed → Settings to enable it.",
      });
      return { ok: false, reason: "missing_license" };
    }
    const { verifyLicense } = await import("./license.js");
    const pub = manifest.licensePublicKey ?? "";
    if (!pub) return { ok: false, reason: "manifest missing licensePublicKey" };
    const check = verifyLicense(license, manifest.name, pub);
    if (!check.ok) {
      bus.notify("passio.seed.event", {
        name,
        kind: "error",
        message: `License invalid: ${check.reason}`,
      });
      return { ok: false, reason: `license: ${check.reason}` };
    }
  }

  const preamblePath = writePreamble(dir, manifest, entry);
  const worker = new Worker(preamblePath, { type: "module" });
  const rs: RunningSeed = {
    name,
    worker,
    manifest,
    tools: new Map(),
    hotkeyHandlers: new Map(),
    schedulerTimers: new Map(),
    kv: new Map(Object.entries(row.settings ?? {})),
    logBuffer: [],
    ready: Promise.resolve(),
  };
  running.set(name, rs);

  worker.addEventListener("message", (ev) => {
    void handleMessage(db, bus, rs, ev.data as SeedBridgeMessage);
  });
  worker.addEventListener("error", (ev: ErrorEvent) => {
    pushLog(rs, "error", String(ev.message ?? ev));
    bus.notify("passio.seed.event", { name, kind: "error", message: String(ev.message ?? "seed error") });
  });

  // Kick off init handshake.
  worker.postMessage({
    kind: "hello",
    seedId: name,
    permissions: manifest.permissions,
    settings: row.settings,
  } satisfies SeedBridgeMessage);

  setEnabled(db, name, true);
  bus.notify("passio.seed.event", { name, kind: "started" });

  // Register scheduler loops declared in the manifest.
  for (const s of manifest.contributes.scheduler ?? []) {
    const timer = setInterval(() => {
      worker.postMessage({
        kind: "event",
        event: `scheduler:${s.id}`,
        payload: { ts: Date.now() },
      } satisfies SeedBridgeMessage);
    }, s.every_seconds * 1000);
    rs.schedulerTimers.set(s.id, timer);
  }

  return { ok: true };
}

export function stopSeed(db: Db, bus: RpcBus, name: string): { ok: boolean } {
  const rs = running.get(name);
  if (!rs) return { ok: true };
  for (const t of rs.schedulerTimers.values()) clearInterval(t);
  try {
    rs.worker.terminate();
  } catch {
    /* ignore */
  }
  running.delete(name);
  setEnabled(db, name, false);
  bus.notify("passio.seed.event", { name, kind: "stopped" });
  return { ok: true };
}

export function restartSeed(db: Db, bus: RpcBus, name: string): Promise<{ ok: boolean; reason?: string }> {
  stopSeed(db, bus, name);
  return startSeed(db, bus, name);
}

export function dispatchEvent(
  event: "chat" | "scan" | "activity" | "bubble_state" | "hotkey",
  payload: unknown,
): void {
  for (const rs of running.values()) {
    if (!rs.manifest.contributes.events?.includes(event)) continue;
    rs.worker.postMessage({ kind: "event", event, payload } satisfies SeedBridgeMessage);
  }
}

/**
 * Fire a seed-declared hotkey. The worker side registered a handler via
 * `passio.hotkeys.register({id, onTrigger})`; we emit an `hotkey:<id>`
 * event which the worker-side preamble dispatches to the right handler.
 */
export function invokeHotkey(seedName: string, hotkeyId: string): void {
  const rs = running.get(seedName);
  if (!rs) return;
  rs.worker.postMessage({
    kind: "event",
    event: `hotkey:${hotkeyId}`,
    payload: { id: hotkeyId, ts: Date.now() },
  } satisfies SeedBridgeMessage);
}

export async function invokeToolOnSeed(
  seedName: string,
  tool: string,
  args: unknown,
  timeoutMs = 15_000,
): Promise<unknown> {
  const rs = running.get(seedName);
  if (!rs) throw new Error(`seed not running: ${seedName}`);
  if (!rs.tools.has(tool)) throw new Error(`seed ${seedName} does not expose ${tool}`);
  const id = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      rs.worker.removeEventListener("message", listener);
      reject(new Error("seed tool timed out"));
    }, timeoutMs);
    const listener = (ev: MessageEvent) => {
      const msg = ev.data as SeedBridgeMessage;
      if (msg.kind !== "tool.result" || msg.id !== id) return;
      clearTimeout(timer);
      rs.worker.removeEventListener("message", listener);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.result);
    };
    rs.worker.addEventListener("message", listener);
    rs.worker.postMessage({ kind: "tool.invoke", id, tool, args } satisfies SeedBridgeMessage);
  });
}

export function startAllEnabled(db: Db, bus: RpcBus): void {
  for (const row of listSeeds(db)) {
    if (!row.enabled) continue;
    startSeed(db, bus, row.name).catch((err) => {
      bus.notify("passio.seed.event", {
        name: row.name,
        kind: "error",
        message: `start failed: ${(err as Error).message}`,
      });
    });
  }
}

export function stopAll(): void {
  for (const name of [...running.keys()]) {
    const rs = running.get(name)!;
    for (const t of rs.schedulerTimers.values()) clearInterval(t);
    try {
      rs.worker.terminate();
    } catch {
      /* ignore */
    }
    running.delete(name);
  }
}

// ===== message dispatch =====

async function handleMessage(db: Db, bus: RpcBus, rs: RunningSeed, msg: SeedBridgeMessage): Promise<void> {
  switch (msg.kind) {
    case "log":
      pushLog(rs, msg.level, msg.args.map(String).join(" "));
      bus.notify("passio.seed.event", {
        name: rs.name,
        kind: "log",
        level: msg.level,
        message: msg.args.map(String).join(" "),
      });
      return;
    case "rpc.call":
      {
        const reply = (result: unknown, error?: string) => {
          const env: SeedBridgeMessage =
            error !== undefined
              ? { kind: "rpc.reply", id: msg.id, error }
              : { kind: "rpc.reply", id: msg.id, result };
          rs.worker.postMessage(env);
        };
        try {
          const result = await handleRpc(db, bus, rs, msg.method, msg.params);
          reply(result);
        } catch (err) {
          reply(undefined, (err as Error).message);
        }
      }
      return;
    default:
      return;
  }
}

async function handleRpc(
  db: Db,
  bus: RpcBus,
  rs: RunningSeed,
  method: string,
  params: unknown,
): Promise<unknown> {
  switch (method) {
    case "tools.register": {
      const p = params as { name: string; description?: string; input?: unknown };
      rs.tools.set(p.name, { ...(p.description !== undefined ? { description: p.description } : {}), ...(p.input !== undefined ? { input: p.input } : {}) });
      return { ok: true };
    }
    case "hotkeys.register": {
      const p = params as { id: string };
      rs.hotkeyHandlers.set(p.id, true);
      return { ok: true };
    }
    case "kv.get": {
      const { key } = params as { key: string };
      return rs.kv.has(key) ? { value: rs.kv.get(key) } : { value: null };
    }
    case "kv.set": {
      const { key, value } = params as { key: string; value: unknown };
      rs.kv.set(key, value);
      persistKv(db, rs);
      return { ok: true };
    }
    case "kv.del": {
      const { key } = params as { key: string };
      rs.kv.delete(key);
      persistKv(db, rs);
      return { ok: true };
    }
    case "net.fetch": {
      const { url, init } = params as { url: string; init?: RequestInit };
      const host = new URL(url).hostname;
      const allowed = rs.manifest.permissions.network ?? [];
      if (!allowed.some((h) => host === h || host.endsWith(`.${h}`))) {
        throw new Error(`network denied for ${host} — declare in permissions.network`);
      }
      const res = await fetch(url, init);
      const body = await res.text();
      return { status: res.status, body, headers: Object.fromEntries(res.headers.entries()) };
    }
    case "secrets.get": {
      const { name } = params as { name: string };
      if (!(rs.manifest.permissions.secrets ?? []).includes(name)) {
        throw new Error(`secret denied: ${name} not declared in permissions.secrets`);
      }
      const { secretGet } = await import("../tools/secrets.js");
      const v = await secretGet(db, { name: `seed:${rs.name}:${name}` });
      return v;
    }
    case "secrets.set": {
      const { name, value } = params as { name: string; value: string };
      if (!(rs.manifest.permissions.secrets ?? []).includes(name)) {
        throw new Error(`secret denied: ${name}`);
      }
      const { secretSet } = await import("../tools/secrets.js");
      return secretSet(db, { name: `seed:${rs.name}:${name}`, value });
    }
    case "bubble.speak": {
      // Lets a seed surface a speech bubble to the HUD.
      const { message } = params as { message: string };
      bus.notify("passio.bubbleState", { state: "alert", message, badge: 1 });
      return { ok: true };
    }
    case "todos.add": {
      const { text, priority, due_at } = params as {
        text: string;
        priority?: number;
        due_at?: string;
      };
      const { todoAdd } = await import("../tools/memory.js");
      return todoAdd(db, {
        text,
        ...(priority !== undefined ? { priority } : {}),
        ...(due_at !== undefined ? { due_at } : {}),
      });
    }
    case "notes.save": {
      const { title, body, tags } = params as { title?: string; body: string; tags?: string };
      const { noteSave } = await import("../tools/memory.js");
      return noteSave(db, {
        body,
        ...(title !== undefined ? { title } : {}),
        ...(tags !== undefined ? { tags } : {}),
      });
    }
    case "mail.unread": {
      const { mailUnread } = await import("../tools/mail.js");
      const p = (params ?? {}) as Record<string, never>;
      return mailUnread(db, p);
    }
    case "mail.send": {
      const { mailSend } = await import("../tools/mail.js");
      const p = params as Parameters<typeof mailSend>[1];
      return mailSend(db, p);
    }
    case "calendar.upcoming": {
      const { upcomingEvents } = await import("../tools/calendar.js");
      const p = (params ?? {}) as Parameters<typeof upcomingEvents>[1];
      return upcomingEvents(db, p);
    }
    case "vault.dailyTodos.sync": {
      const { items, date } = params as {
        items: Array<{ text: string; done: boolean }>;
        date?: string;
      };
      const { syncDailyTodosSection } = await import("../vault/daily_todos.js");
      return syncDailyTodosSection(db, { items, ...(date ? { date } : {}) });
    }
    case "vault.dailyTodos.read": {
      const { date } = (params ?? {}) as { date?: string };
      const { readDailyTodosSection } = await import("../vault/daily_todos.js");
      return readDailyTodosSection(db, { ...(date ? { date } : {}) });
    }
    default:
      throw new Error(`unknown host method: ${method}`);
  }
}

function persistKv(db: Db, rs: RunningSeed): void {
  db.$raw
    .query("UPDATE seeds SET settings_json = ? WHERE name = ?")
    .run(JSON.stringify(Object.fromEntries(rs.kv)), rs.name);
}

function pushLog(rs: RunningSeed, level: string, message: string): void {
  rs.logBuffer.push({ ts: Date.now(), level, message });
  if (rs.logBuffer.length > 500) rs.logBuffer.splice(0, rs.logBuffer.length - 500);
}

// ===== preamble generation =====

/**
 * Generates the Worker entry file that wires the capability-limited
 * `passio` global and delegates to the seed's declared entry.
 *
 * Written to a temp file so the worker can `import()` it without colliding
 * with the user's entry file on disk.
 */
function writePreamble(dir: string, manifest: SeedManifest, entry: string): string {
  const tmp = mkdtempSync(join(tmpdir(), `passio-seed-${manifest.name}-`));
  const preamble = join(tmp, "preamble.mjs");
  writeFileSync(
    preamble,
    PREAMBLE_TEMPLATE.replaceAll("__ENTRY__", pathToFileUrl(entry)),
    "utf8",
  );
  return preamble;
}

function pathToFileUrl(p: string): string {
  return `file://${resolve(p)}`;
}

const PREAMBLE_TEMPLATE = `/* auto-generated — do not edit */
let pendingResolvers = new Map();
let readyResolve;
const ready = new Promise((r) => { readyResolve = r; });

function rpc(method, params) {
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    pendingResolvers.set(id, { resolve, reject });
    self.postMessage({ kind: "rpc.call", id, method, params });
  });
}

function mkPassio() {
  const toolHandlers = new Map();
  const hotkeyHandlers = new Map();
  const scheduleHandlers = new Map();
  const eventHandlers = new Map();

  self.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg.kind !== "string") return;
    if (msg.kind === "rpc.reply") {
      const p = pendingResolvers.get(msg.id);
      if (!p) return;
      pendingResolvers.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    } else if (msg.kind === "tool.invoke") {
      const fn = toolHandlers.get(msg.tool);
      Promise.resolve(fn ? fn(msg.args) : Promise.reject(new Error("no such tool")))
        .then((result) => self.postMessage({ kind: "tool.result", id: msg.id, result }))
        .catch((err) => self.postMessage({ kind: "tool.result", id: msg.id, error: err.message }));
    } else if (msg.kind === "event") {
      if (msg.event.startsWith("scheduler:")) {
        const id = msg.event.slice("scheduler:".length);
        const fn = scheduleHandlers.get(id);
        if (fn) Promise.resolve(fn(msg.payload)).catch((e) => console.error("schedule", id, e));
        return;
      }
      if (msg.event.startsWith("hotkey:")) {
        const id = msg.event.slice("hotkey:".length);
        const fn = hotkeyHandlers.get(id);
        if (fn) Promise.resolve(fn(msg.payload)).catch((e) => console.error("hotkey", id, e));
        return;
      }
      const fn = eventHandlers.get(msg.event);
      if (fn) Promise.resolve(fn(msg.payload)).catch((e) => console.error("event", msg.event, e));
    } else if (msg.kind === "hello") {
      readyResolve(msg);
    }
  });

  const log = (level) => (...args) => {
    const safe = args.map((a) => {
      try { return typeof a === "string" ? a : JSON.stringify(a); } catch { return String(a); }
    });
    self.postMessage({ kind: "log", level, args: safe });
  };

  return {
    tools: {
      register(def) {
        const { name, description, input, execute } = def;
        toolHandlers.set(name, execute);
        return rpc("tools.register", { name, description, input });
      },
    },
    hotkeys: {
      register(def) {
        hotkeyHandlers.set(def.id, def.onTrigger);
        return rpc("hotkeys.register", { id: def.id, default: def.default });
      },
    },
    schedule(cfg, fn) {
      scheduleHandlers.set(cfg.id, fn);
    },
    on(event, fn) {
      eventHandlers.set(event, fn);
    },
    kv: {
      get: (key) => rpc("kv.get", { key }).then((r) => r?.value ?? null),
      set: (key, value) => rpc("kv.set", { key, value }),
      del: (key) => rpc("kv.del", { key }),
    },
    net: {
      fetch: async (url, init) => {
        const r = await rpc("net.fetch", { url, init });
        return {
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          headers: r.headers,
          text: async () => r.body,
          json: async () => JSON.parse(r.body),
        };
      },
    },
    secrets: {
      get: (name) => rpc("secrets.get", { name }),
      set: (name, value) => rpc("secrets.set", { name, value }),
    },
    bubble: { speak: (message) => rpc("bubble.speak", { message }) },
    todos: { add: (input) => rpc("todos.add", input) },
    notes: { save: (input) => rpc("notes.save", input) },
    mail: {
      unread: (limit) => rpc("mail.unread", { limit }),
      send: (input) => rpc("mail.send", input),
    },
    calendar: { upcoming: (input) => rpc("calendar.upcoming", input ?? {}) },
    log: log("info"),
    warn: log("warn"),
    error: log("error"),
  };
}

(async () => {
  const passio = mkPassio();
  await ready;
  try {
    const mod = await import("__ENTRY__");
    const init = mod.default ?? mod.init;
    if (typeof init === "function") await init(passio);
  } catch (err) {
    self.postMessage({ kind: "log", level: "error", args: ["seed init failed: " + err.message] });
  }
})();
`;
