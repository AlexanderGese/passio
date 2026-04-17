/**
 * Passio sidecar entrypoint.
 *
 * The sidecar is spawned on-demand by the Rust core and communicates over
 * JSON-RPC 2.0 on stdin/stdout (newline-delimited). It terminates itself
 * after a configurable idle timeout to keep baseline resource usage low.
 *
 * v1 scope:
 *   - passio.ping, passio.shutdown (scaffold)
 *   - passio.chat  (AI SDK agent loop w/ tool calling)
 *   - passio.scan  (scaffold; full proactive loop arrives in week 5)
 *   - Memory / todo / note / intent RPCs for direct HUD & agent use
 */
import { RpcMethods, type PingResult } from "@passio/shared";
import { chat } from "./ai/agent.js";
import {
  deletePolicy,
  getBlocklist,
  getCountdownSeconds,
  getPolicies,
  setBlocklist,
  setCountdownSeconds,
  setPolicy,
  type BlocklistEntry,
  type Policy,
} from "./bridge/gate.js";
import { dailyRecap, morningBriefing } from "./ai/recap.js";
import { scan } from "./ai/scan.js";
import { rewrite, translate } from "./ai/transform.js";
import { synthesize, transcribe } from "./ai/voice.js";
import {
  activityLog,
  habitLog,
  habitSummary,
  habitUpsert,
  journalAdd,
  journalRecent,
  timeBlockCreate,
} from "./tools/analytics.js";
import { cardGrade, cardsDue, flashcardsFromNote } from "./tools/flashcards.js";
import { fileSearch, indexFiles } from "./tools/files.js";
import { edgeAdd, entityUpsert, graphQuery } from "./tools/graph.js";
import {
  gitCommitMsg,
  gitPrDescription,
  shellAllow,
  shellAllowList,
  shellRun,
} from "./tools/shell.js";
import { startBridge } from "./bridge/server.js";
import { openDb } from "./db/client.js";
import { IdleWatchdog } from "./idle.js";
import { RpcBus } from "./rpc.js";
import {
  cyclePack,
  focusStart,
  focusStop,
  getActivePack,
  getDistractingDomains,
  getDndUntil,
  getFocusState,
  getProactiveInterval,
  getProactiveMode,
  setActivePack,
  setDistractingDomains,
  setDnd,
  setProactiveInterval,
  setProactiveMode,
  toggleDnd,
} from "./tools/focus.js";
import {
  goalCreate,
  goalDecompose,
  goalList,
  goalReview,
  goalUpdate,
  milestoneAdd,
  milestoneDone,
  milestoneReschedule,
} from "./tools/goals.js";
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
import { indexVault } from "./vault/indexer.js";
import {
  dailyNoteAppendRecap,
  getVaultRoot,
  setVaultRoot,
  vaultListTags,
  vaultReadNote,
  vaultSearch,
  vaultWriteNote,
} from "./vault/tools.js";
import { watchVault } from "./vault/watcher.js";

const SIDECAR_VERSION = "0.8.0";
const DEFAULT_IDLE_MS = Number(process.env.PASSIO_IDLE_MS ?? 90_000);

const bus = new RpcBus();
const startedAt = Date.now();

// Open DB eagerly — SQLite open is ~2ms; the expensive thing is the
// embeddings network call which is lazy.
const db = openDb();

// Start the local browser-extension bridge (WS on 127.0.0.1). Token is
// rotated per sidecar launch and written to a chmod-600 file the user
// pastes into the extension's options page.
const bridge = startBridge((msg) =>
  bus.notify(RpcMethods.NOTIFY_LOG, { level: "info", message: msg }),
);

const idle = new IdleWatchdog(DEFAULT_IDLE_MS, () => {
  bus.notify(RpcMethods.NOTIFY_LOG, { level: "info", message: "sidecar idle — shutting down" });
  shutdown("idle");
});

function shutdown(reason: string): void {
  idle.stop();
  bridge.stop().catch(() => {});
  try {
    db.$raw.close();
  } catch {
    /* already closed */
  }
  bus.notify(RpcMethods.NOTIFY_LOG, { level: "info", message: `sidecar shutdown (${reason})` });
  setTimeout(() => process.exit(0), 50);
}

// Bump idle timer on every incoming message
const originalFeed = bus.feed.bind(bus);
bus.feed = async (chunk: string) => {
  idle.bump();
  return originalFeed(chunk);
};

bus.on(RpcMethods.PING, async (): Promise<PingResult> => ({
  pong: true,
  sidecarVersion: SIDECAR_VERSION,
  uptimeMs: Date.now() - startedAt,
}));

bus.on(RpcMethods.SHUTDOWN, async () => {
  shutdown("user");
  return { ok: true };
});

bus.on(RpcMethods.SCAN, async (params: unknown) => {
  const p = (params ?? {}) as { reason?: "cron" | "manual" | "force" };
  const decision = await scan(db, bridge, {
    reason: p.reason ?? "manual",
    mode: getProactiveMode(db),
    pack: getActivePack(db),
    dndUntil: getDndUntil(db),
    distractingDomains: getDistractingDomains(db),
  });
  // Surface non-quiet decisions to the HUD as bubble state updates.
  if (decision.decision !== "quiet") {
    bus.notify(RpcMethods.NOTIFY_BUBBLE_STATE, {
      state: "alert",
      message: decision.message ?? decision.reason,
      badge: 1,
    });
  }
  return decision;
});

bus.on(RpcMethods.CHAT, async (params: unknown) => {
  const { prompt, conversationId } = params as {
    prompt: string;
    conversationId?: number;
  };
  return chat(
    db,
    (m, p) => bus.notify(m, p),
    conversationId !== undefined ? { prompt, conversationId } : { prompt },
    bridge,
    bus,
  );
});

// --- Safety rails: policy / blocklist / gate ---
bus.on(RpcMethods.POLICY_GET, async () => ({
  domains: getPolicies(db),
  countdownSeconds: getCountdownSeconds(db),
  blocklist: getBlocklist(db),
}));
bus.on(RpcMethods.POLICY_SET, async (p: unknown) => {
  const { host, policy } = p as { host: string; policy: Policy };
  setPolicy(db, host, policy);
  return { ok: true };
});
bus.on(RpcMethods.POLICY_DELETE, async (p: unknown) => {
  const { host } = p as { host: string };
  deletePolicy(db, host);
  return { ok: true };
});
bus.on(RpcMethods.POLICY_SET_COUNTDOWN, async (p: unknown) => {
  const { seconds } = p as { seconds: number };
  setCountdownSeconds(db, seconds);
  return { ok: true };
});
bus.on(RpcMethods.BLOCKLIST_SET, async (p: unknown) => {
  const { entries } = p as { entries: BlocklistEntry[] };
  setBlocklist(db, entries);
  return { ok: true };
});
bus.on(RpcMethods.GATE_RESOLVE, async (p: unknown) => {
  const { id, allowed } = p as { id: string; allowed: boolean };
  bus.resolveGate(id, allowed);
  return { ok: true };
});

// Direct memory / todo / note / intent RPCs (for the HUD to call without
// going through the LLM — cheap, deterministic, local).
bus.on(RpcMethods.MEMORY_REMEMBER, async (params: unknown) =>
  memoryRemember(db, params as Parameters<typeof memoryRemember>[1]),
);
bus.on(RpcMethods.MEMORY_FORGET, async (params: unknown) =>
  memoryForget(db, params as Parameters<typeof memoryForget>[1]),
);
bus.on(RpcMethods.MEMORY_SEARCH, async (params: unknown) =>
  memorySearch(db, params as Parameters<typeof memorySearch>[1]),
);
bus.on(RpcMethods.TODO_ADD, async (params: unknown) =>
  todoAdd(db, params as Parameters<typeof todoAdd>[1]),
);
bus.on(RpcMethods.TODO_LIST, async (params: unknown) =>
  todoList(db, params as Parameters<typeof todoList>[1]),
);
bus.on(RpcMethods.TODO_DONE, async (params: unknown) =>
  todoDone(db, params as Parameters<typeof todoDone>[1]),
);
bus.on(RpcMethods.NOTE_SAVE, async (params: unknown) =>
  noteSave(db, params as Parameters<typeof noteSave>[1]),
);
bus.on(RpcMethods.NOTE_SEARCH, async (params: unknown) =>
  noteSearch(db, params as Parameters<typeof noteSearch>[1]),
);
bus.on(RpcMethods.INTENT_SET, async (params: unknown) =>
  setIntent(db, params as Parameters<typeof setIntent>[1]),
);
bus.on(RpcMethods.INTENT_GET, async () => getIntent(db));

// --- Goals ---
bus.on(RpcMethods.GOAL_CREATE, async (params: unknown) =>
  goalCreate(db, params as Parameters<typeof goalCreate>[1]),
);
bus.on(RpcMethods.GOAL_LIST, async (params: unknown) =>
  goalList(db, (params ?? {}) as Parameters<typeof goalList>[1]),
);
bus.on(RpcMethods.GOAL_UPDATE, async (params: unknown) =>
  goalUpdate(db, params as Parameters<typeof goalUpdate>[1]),
);
bus.on(RpcMethods.GOAL_DECOMPOSE, async (params: unknown) =>
  goalDecompose(db, params as Parameters<typeof goalDecompose>[1]),
);
bus.on(RpcMethods.GOAL_REVIEW, async (params: unknown) =>
  goalReview(db, params as Parameters<typeof goalReview>[1]),
);
bus.on(RpcMethods.MILESTONE_ADD, async (params: unknown) =>
  milestoneAdd(db, params as Parameters<typeof milestoneAdd>[1]),
);
bus.on(RpcMethods.MILESTONE_DONE, async (params: unknown) =>
  milestoneDone(db, params as Parameters<typeof milestoneDone>[1]),
);
bus.on(RpcMethods.MILESTONE_RESCHEDULE, async (params: unknown) =>
  milestoneReschedule(db, params as Parameters<typeof milestoneReschedule>[1]),
);

// --- Obsidian vault ---
bus.on(RpcMethods.VAULT_SET_ROOT, async (params: unknown) => {
  const res = await setVaultRoot(db, params as Parameters<typeof setVaultRoot>[1]);
  // Kick off an initial index + watcher after root is (re)configured.
  const root = await getVaultRoot(db);
  if (root) {
    try {
      const indexResult = await indexVault(db, root);
      bus.notify(RpcMethods.NOTIFY_LOG, {
        level: "info",
        message: `vault indexed: ${indexResult.indexed}/${indexResult.total_md} files`,
      });
      if (!vaultWatcherClose) {
        vaultWatcherClose = watchVault(db, root);
      }
    } catch (err) {
      bus.notify(RpcMethods.NOTIFY_LOG, {
        level: "warn",
        message: `vault init failed: ${(err as Error).message}`,
      });
    }
  } else if (vaultWatcherClose) {
    await vaultWatcherClose.close();
    vaultWatcherClose = null;
  }
  return res;
});
bus.on(RpcMethods.VAULT_GET_ROOT, async () => ({ path: await getVaultRoot(db) }));
bus.on(RpcMethods.VAULT_INDEX, async (params: unknown) => {
  const root = await getVaultRoot(db);
  if (!root) throw new Error("vault root not configured");
  const opts = (params ?? {}) as { limit?: number };
  return indexVault(db, root, opts.limit);
});
bus.on(RpcMethods.VAULT_SEARCH, async (params: unknown) =>
  vaultSearch(db, params as Parameters<typeof vaultSearch>[1]),
);
bus.on(RpcMethods.VAULT_READ, async (params: unknown) =>
  vaultReadNote(db, params as Parameters<typeof vaultReadNote>[1]),
);
bus.on(RpcMethods.VAULT_WRITE, async (params: unknown) =>
  vaultWriteNote(db, params as Parameters<typeof vaultWriteNote>[1]),
);
bus.on(RpcMethods.VAULT_LIST_TAGS, async () => vaultListTags(db));
bus.on(RpcMethods.VAULT_DAILY_RECAP, async (params: unknown) =>
  dailyNoteAppendRecap(db, params as Parameters<typeof dailyNoteAppendRecap>[1]),
);

// --- Focus / packs / DND / proactive / recap ---
bus.on(RpcMethods.FOCUS_GET_STATE, async () => getFocusState(db));
bus.on(RpcMethods.FOCUS_START, async (params: unknown) => {
  const { duration_min } = (params ?? {}) as { duration_min?: number };
  return focusStart(db, duration_min ?? 25);
});
bus.on(RpcMethods.FOCUS_STOP, async () => focusStop(db));

bus.on(RpcMethods.PACK_GET, async () => ({ pack: getActivePack(db) }));
bus.on(RpcMethods.PACK_SET, async (params: unknown) => {
  const { pack } = params as { pack: "work" | "study" | "chill" | "custom" };
  return setActivePack(db, pack);
});
bus.on(RpcMethods.PACK_CYCLE, async () => cyclePack(db));

bus.on(RpcMethods.DND_GET, async () => ({ until: getDndUntil(db) }));
bus.on(RpcMethods.DND_SET, async (params: unknown) => {
  const p = params as { minutes: number | null };
  return setDnd(db, p);
});
bus.on(RpcMethods.DND_TOGGLE, async () => toggleDnd(db));

bus.on(RpcMethods.PROACTIVE_GET, async () => ({
  mode: getProactiveMode(db),
  interval_min: getProactiveInterval(db),
}));
bus.on(RpcMethods.PROACTIVE_SET, async (params: unknown) => {
  const p = params as {
    mode?: "check-in" | "active-assist" | "summary-decide";
    interval_min?: number;
  };
  if (p.mode) setProactiveMode(db, p.mode);
  if (typeof p.interval_min === "number") setProactiveInterval(db, p.interval_min);
  return {
    ok: true,
    mode: getProactiveMode(db),
    interval_min: getProactiveInterval(db),
  };
});

bus.on(RpcMethods.DISTRACTING_GET, async () => ({ domains: getDistractingDomains(db) }));
bus.on(RpcMethods.DISTRACTING_SET, async (params: unknown) => {
  const { domains } = params as { domains: string[] };
  return setDistractingDomains(db, domains);
});

// --- Analytics ---
bus.on(RpcMethods.HABIT_UPSERT, async (p: unknown) =>
  habitUpsert(db, p as Parameters<typeof habitUpsert>[1]),
);
bus.on(RpcMethods.HABIT_LOG, async (p: unknown) =>
  habitLog(db, p as Parameters<typeof habitLog>[1]),
);
bus.on(RpcMethods.HABIT_SUMMARY, async (p: unknown) =>
  habitSummary(db, (p ?? {}) as Parameters<typeof habitSummary>[1]),
);
bus.on(RpcMethods.JOURNAL_ADD, async (p: unknown) =>
  journalAdd(db, p as Parameters<typeof journalAdd>[1]),
);
bus.on(RpcMethods.JOURNAL_RECENT, async (p: unknown) =>
  journalRecent(db, (p ?? {}) as Parameters<typeof journalRecent>[1]),
);
bus.on(RpcMethods.TIMEBLOCK_CREATE, async (p: unknown) =>
  timeBlockCreate(db, p as Parameters<typeof timeBlockCreate>[1]),
);
bus.on(RpcMethods.ACTIVITY_LOG, async (p: unknown) =>
  activityLog(db, p as Parameters<typeof activityLog>[1]),
);

// --- Knowledge graph ---
bus.on(RpcMethods.GRAPH_ENTITY_UPSERT, async (p: unknown) =>
  entityUpsert(db, p as Parameters<typeof entityUpsert>[1]),
);
bus.on(RpcMethods.GRAPH_EDGE_ADD, async (p: unknown) =>
  edgeAdd(db, p as Parameters<typeof edgeAdd>[1]),
);
bus.on(RpcMethods.GRAPH_QUERY, async (p: unknown) =>
  graphQuery(db, p as Parameters<typeof graphQuery>[1]),
);

// --- File index ---
bus.on(RpcMethods.FILE_INDEX, async (p: unknown) => {
  const { root, limit } = p as { root: string; limit?: number };
  return indexFiles(db, root, limit);
});
bus.on(RpcMethods.FILE_SEARCH, async (p: unknown) =>
  fileSearch(db, p as Parameters<typeof fileSearch>[1]),
);

// --- Flashcards ---
bus.on(RpcMethods.CARDS_FROM_NOTE, async (p: unknown) =>
  flashcardsFromNote(db, p as Parameters<typeof flashcardsFromNote>[1]),
);
bus.on(RpcMethods.CARDS_DUE, async (p: unknown) =>
  cardsDue(db, (p ?? {}) as Parameters<typeof cardsDue>[1]),
);
bus.on(RpcMethods.CARDS_GRADE, async (p: unknown) =>
  cardGrade(db, p as Parameters<typeof cardGrade>[1]),
);

// --- Shell + git ---
bus.on(RpcMethods.SHELL_ALLOWLIST, async () => shellAllowList(db));
bus.on(RpcMethods.SHELL_ALLOW, async (p: unknown) =>
  shellAllow(db, p as Parameters<typeof shellAllow>[1]),
);
bus.on(RpcMethods.SHELL_RUN, async (p: unknown) =>
  shellRun(db, p as Parameters<typeof shellRun>[1]),
);
bus.on(RpcMethods.GIT_COMMIT_MSG, async (p: unknown) =>
  gitCommitMsg(db, p as Parameters<typeof gitCommitMsg>[1]),
);
bus.on(RpcMethods.GIT_PR_DESCRIPTION, async (p: unknown) =>
  gitPrDescription(p as Parameters<typeof gitPrDescription>[0]),
);

// --- Voice ---
bus.on(RpcMethods.VOICE_TRANSCRIBE, async (params: unknown) =>
  transcribe(params as Parameters<typeof transcribe>[0]),
);
bus.on(RpcMethods.VOICE_SYNTHESIZE, async (params: unknown) =>
  synthesize(params as Parameters<typeof synthesize>[0]),
);

// --- Text transforms ---
bus.on(RpcMethods.REWRITE, async (params: unknown) =>
  rewrite(params as Parameters<typeof rewrite>[0]),
);
bus.on(RpcMethods.TRANSLATE, async (params: unknown) =>
  translate(params as Parameters<typeof translate>[0]),
);

bus.on(RpcMethods.DAILY_RECAP, async (params: unknown) => {
  const p = (params ?? {}) as { date?: string };
  return dailyRecap(db, p);
});
bus.on(RpcMethods.MORNING_BRIEFING, async () => morningBriefing(db));

// --- Browser bridge ---
bus.on(RpcMethods.BRIDGE_STATUS, async () => ({
  port: bridge.port,
  token: bridge.token,
  pairingFile: bridge.pairingFile,
  connected: bridge.clients() > 0,
  clients: bridge.clients(),
}));

bus.on(RpcMethods.BROWSER_GET_CURRENT_TAB, async () => {
  const { getCurrentTab } = await import("./tools/browser.js");
  return getCurrentTab({ bridge, db });
});

bus.on(RpcMethods.BROWSER_SUMMARIZE_PAGE, async (params: unknown) => {
  const { summarizePage } = await import("./tools/browser_compound.js");
  const opts = (params ?? {}) as { style?: "tldr" | "detailed" | "bullet" };
  return summarizePage({ bridge, db, ...(opts.style ? { style: opts.style } : {}) });
});

// Vault watcher lifecycle — created if a root is already configured on boot.
let vaultWatcherClose: Awaited<ReturnType<typeof watchVault>> | null = null;
getVaultRoot(db).then((root) => {
  if (root) {
    vaultWatcherClose = watchVault(db, root);
    bus.notify(RpcMethods.NOTIFY_LOG, {
      level: "info",
      message: `vault watcher started at ${root}`,
    });
  }
});

// === Wire stdin ===
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk: string) => {
  try {
    await bus.feed(chunk);
  } catch (err) {
    bus.notify(RpcMethods.NOTIFY_LOG, {
      level: "error",
      message: `feed error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});
process.stdin.on("end", () => shutdown("stdin-closed"));

// === Signals ===
process.on("SIGTERM", () => shutdown("sigterm"));
process.on("SIGINT", () => shutdown("sigint"));

// === Boot ===
idle.start();
bus.notify(RpcMethods.NOTIFY_LOG, {
  level: "info",
  message: `passio sidecar v${SIDECAR_VERSION} ready (idle timeout ${DEFAULT_IDLE_MS}ms, hasVec=${db.$hasVec})`,
});
