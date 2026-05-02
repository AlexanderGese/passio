/**
 * Passio sidecar — lean kit.
 *
 * RPC surface is intentionally minimal: chat, todos + notes + memory,
 * persona/keybinds, spotlight search, autonomous loop, system snapshot.
 * No proactive scan, no voice/vision/vault/seeds/browser-extension.
 */
import { RpcMethods, type PingResult } from "@passio/shared";
import { chat } from "./ai/agent.js";
import { openDb } from "./db/client.js";
import { IdleWatchdog } from "./idle.js";
import { RpcBus } from "./rpc.js";
import {
  cancelLoop,
  listLoops,
  loopEvents,
  markOrphanedLoopsAbandoned,
  resumeAutoLoop,
  startAutoLoop,
} from "./ai/auto_loop.js";
import {
  chatGetConversation,
  chatListConversations,
  chatSearch,
} from "./tools/chat_history.js";
import {
  getIntent,
  memoryForget,
  memoryRemember,
  memorySearch,
  noteSave,
  noteSearch,
  setIntent,
  todoAdd,
  todoDone,
  todoList,
} from "./tools/memory.js";
import { getKeybinds, getPersona, setKeybinds, setPersona } from "./tools/persona.js";
import { spotlightSearch } from "./tools/spotlight.js";
import {
  getProductiveKeywords,
  setProductiveKeywords,
  systemSnapshot,
} from "./tools/system.js";

const SIDECAR_VERSION = "1.0.0";
const DEFAULT_IDLE_MS = Number(process.env.PASSIO_IDLE_MS ?? 90_000);

const bus = new RpcBus();
const startedAt = Date.now();
const db = openDb();

const idle = new IdleWatchdog(DEFAULT_IDLE_MS, () => {
  bus.notify(RpcMethods.NOTIFY_LOG, { level: "info", message: "sidecar idle — shutting down" });
  shutdown("idle");
});

function shutdown(reason: string): void {
  idle.stop();
  try {
    db.$raw.close();
  } catch {
    /* already closed */
  }
  bus.notify(RpcMethods.NOTIFY_LOG, { level: "info", message: `sidecar shutdown (${reason})` });
  setTimeout(() => process.exit(0), 50);
}

const originalFeed = bus.feed.bind(bus);
bus.feed = async (chunk: string) => {
  idle.bump();
  return originalFeed(chunk);
};

// --- Lifecycle ---
bus.on(RpcMethods.PING, async (): Promise<PingResult> => ({
  pong: true,
  sidecarVersion: SIDECAR_VERSION,
  uptimeMs: Date.now() - startedAt,
}));

bus.on(RpcMethods.SHUTDOWN, async () => {
  shutdown("user");
  return { ok: true };
});

// --- Chat ---
bus.on(RpcMethods.CHAT, async (params: unknown) => {
  const { prompt, conversationId } = params as {
    prompt: string;
    conversationId?: number;
  };
  const payload: Parameters<typeof chat>[2] = { prompt };
  if (conversationId !== undefined) payload.conversationId = conversationId;
  return chat(db, (m, p) => bus.notify(m, p), payload);
});
bus.on(RpcMethods.CHAT_SEARCH, async (p: unknown) =>
  chatSearch(db, p as Parameters<typeof chatSearch>[1]),
);
bus.on(RpcMethods.CHAT_LIST_CONVERSATIONS, async (p: unknown) =>
  chatListConversations(db, p as Parameters<typeof chatListConversations>[1]),
);
bus.on(RpcMethods.CHAT_GET_CONVERSATION, async (p: unknown) =>
  chatGetConversation(db, p as Parameters<typeof chatGetConversation>[1]),
);

// --- Todos / notes / memory facts ---
bus.on(RpcMethods.TODO_ADD, async (p: unknown) =>
  todoAdd(db, p as Parameters<typeof todoAdd>[1]),
);
bus.on(RpcMethods.TODO_LIST, async (p: unknown) => {
  const params = (p ?? {}) as { filter?: "open" | "done" | "all" };
  return todoList(db, params);
});
bus.on(RpcMethods.TODO_DONE, async (p: unknown) =>
  todoDone(db, p as Parameters<typeof todoDone>[1]),
);
bus.on(RpcMethods.TODO_DELETE, async (p: unknown) => {
  const { id } = p as { id: number };
  db.$raw.query("DELETE FROM todos WHERE id = ?").run(id);
  return { ok: true as const };
});
bus.on(RpcMethods.TODO_UPDATE, async (p: unknown) => {
  const { id, text, priority, due_at, project } = p as {
    id: number;
    text?: string;
    priority?: number;
    due_at?: string | null;
    project?: string | null;
  };
  const sets: string[] = [];
  const args: unknown[] = [];
  if (text !== undefined) { sets.push("text = ?"); args.push(text); }
  if (priority !== undefined) { sets.push("priority = ?"); args.push(priority); }
  if (due_at !== undefined) { sets.push("due_at = ?"); args.push(due_at); }
  if (project !== undefined) { sets.push("project = ?"); args.push(project); }
  if (sets.length === 0) return { ok: true as const };
  args.push(id);
  db.$raw.query(`UPDATE todos SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  return { ok: true as const };
});
bus.on(RpcMethods.NOTE_SAVE, async (params: unknown) =>
  noteSave(db, params as Parameters<typeof noteSave>[1]),
);
bus.on(RpcMethods.NOTE_SEARCH, async (params: unknown) =>
  noteSearch(db, params as Parameters<typeof noteSearch>[1]),
);
bus.on(RpcMethods.MEMORY_REMEMBER, async (params: unknown) =>
  memoryRemember(db, params as Parameters<typeof memoryRemember>[1]),
);
bus.on(RpcMethods.MEMORY_FORGET, async (params: unknown) =>
  memoryForget(db, params as Parameters<typeof memoryForget>[1]),
);
bus.on(RpcMethods.MEMORY_SEARCH, async (params: unknown) =>
  memorySearch(db, params as Parameters<typeof memorySearch>[1]),
);
bus.on(RpcMethods.INTENT_GET, async () => getIntent(db));
bus.on(RpcMethods.INTENT_SET, async (params: unknown) =>
  setIntent(db, params as Parameters<typeof setIntent>[1]),
);

// --- Persona + keybinds (settings) ---
bus.on(RpcMethods.PERSONA_GET, async () => getPersona(db));
bus.on(RpcMethods.PERSONA_SET, async (patch: unknown) =>
  setPersona(db, patch as Parameters<typeof setPersona>[1]),
);
bus.on(RpcMethods.KEYBINDS_GET, async () => getKeybinds(db));
bus.on(RpcMethods.KEYBINDS_SET, async (patch: unknown) =>
  setKeybinds(db, patch as Parameters<typeof setKeybinds>[1]),
);

// --- Spotlight ---
bus.on(RpcMethods.SPOTLIGHT_SEARCH, async (p: unknown) =>
  spotlightSearch(db, p as Parameters<typeof spotlightSearch>[1]),
);

// --- Autonomous retrigger loop ---
bus.on(RpcMethods.AUTO_LOOP_START, async (p: unknown) => {
  const params = p as { task: string; maxSteps?: number; maxCostUsd?: number; goalId?: number };
  return startAutoLoop(db, { bus }, params);
});
bus.on(RpcMethods.AUTO_LOOP_CANCEL, async (p: unknown) => {
  const { id } = p as { id: number };
  return cancelLoop(db, id);
});
bus.on(RpcMethods.AUTO_LOOP_RESUME, async (p: unknown) => {
  const params = p as { id: number; maxSteps?: number; maxCostUsd?: number };
  return resumeAutoLoop(db, { bus }, params);
});
bus.on(RpcMethods.AUTO_LOOP_LIST, async (p: unknown) =>
  listLoops(db, (p ?? {}) as { limit?: number; status?: string }),
);
bus.on(RpcMethods.AUTO_LOOP_EVENTS, async (p: unknown) =>
  loopEvents(db, p as { id: number }),
);
markOrphanedLoopsAbandoned(db);

// --- System snapshot (active window, classification) — used by chat agent's
// ambient context block; not surfaced as a UI panel anymore.
bus.on(RpcMethods.SYSTEM_SNAPSHOT, async () => systemSnapshot(db));
bus.on(RpcMethods.PRODUCTIVE_KEYWORDS_GET, async () => ({
  keywords: getProductiveKeywords(db),
}));
bus.on(RpcMethods.PRODUCTIVE_KEYWORDS_SET, async (p: unknown) => {
  const { keywords } = p as { keywords: string[] };
  return setProductiveKeywords(db, keywords);
});

// --- stdin loop ---
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => bus.feed(chunk));
process.stdin.on("end", () => shutdown("stdin-closed"));

bus.notify(RpcMethods.NOTIFY_LOG, {
  level: "info",
  message: `passio sidecar v${SIDECAR_VERSION} ready (idle timeout ${DEFAULT_IDLE_MS}ms, hasVec=${db.$hasVec})`,
});
