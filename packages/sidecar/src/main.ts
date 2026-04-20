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
import { dispatchScanProposal } from "./ai/scan_dispatch.js";
import { deadlineRadar } from "./ai/radar.js";
import { milestoneToTodos } from "./ai/split.js";
import { getTodoMdPath, setTodoMdPath, syncTodoMd, todaysTopTodos } from "./tools/todo_sync.js";
import { activityStats, distractionNudge, systemSnapshot } from "./tools/system.js";
import { initiativePulse } from "./ai/initiative.js";
import { getAutomationPrefs, setAutomationPrefs } from "./tools/automation_settings.js";
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
import { listCalendarSources, setCalendarSources, upcomingEvents } from "./tools/calendar.js";
import { macroDelete, macroList, macroRun, macroSave } from "./tools/macros.js";
import { automate } from "./tools/automation.js";
import { applyCurrentLocation, registerLocation } from "./tools/location.js";
import {
  chatGetConversation,
  chatListConversations,
  chatSearch,
} from "./tools/chat_history.js";
import { pdfIngest } from "./tools/pdf.js";
import { research } from "./tools/research.js";
import { secretDelete, secretGet, secretList, secretSet } from "./tools/secrets.js";
import { sandboxRun } from "./tools/sandbox.js";
import { cardGrade, cardsDue, flashcardsFromNote } from "./tools/flashcards.js";
import { mailInbox, mailSearch, mailSend, mailUnread } from "./tools/mail.js";
import { latestItems, listFeeds, setFeeds } from "./tools/rss.js";
import { currentWeather, setLocation as setWeatherLocation } from "./tools/weather.js";
import { getKeybinds, getPersona, setKeybinds, setPersona } from "./tools/persona.js";
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
  goalDelete,
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
import { costSummary } from "./tools/cost.js";
import {
  listPendingProposals,
  resolveProposal,
  runReflection,
} from "./ai/reflection.js";
import { browseMemory, deleteMemory, updateMemory } from "./tools/memory_browse.js";
import { spotlightSearch } from "./tools/spotlight.js";
import { whatNext } from "./ai/what_next.js";
import { listAuditable, undoAction } from "./ai/undo.js";
import { screenshotAndAsk } from "./tools/screenshot.js";
import { sittingNudge } from "./tools/system.js";
import { checkUnlockTransition } from "./tools/unlock_detect.js";
import {
  cancelLoop,
  listLoops,
  loopEvents,
  resumeAutoLoop,
  markOrphanedLoopsAbandoned,
  startAutoLoop,
} from "./ai/auto_loop.js";
import {
  dispatchEvent as seedDispatchEvent,
  installFromDescriptor,
  installFromLocalPath,
  invokeToolOnSeed,
  listSeeds as seedList,
  logsFor as seedLogs,
  readManifestFromDir,
  removeSeed,
  restartSeed,
  startAllEnabled,
  startDev,
  startSeed as seedStart,
  stopAll as seedsStopAll,
  stopDev,
  stopSeed as seedStop,
  updateSettings as seedSetSettings,
  readPanelSrc,
  getSeed,
} from "./seeds/index.js";
import { SeedDescriptorSchema } from "@passio/shared";
import { composePersona, PERSONA_TREE } from "./ai/persona_tree.js";
import { budgetCheck } from "./tools/cost.js";
import { exportData, importData } from "./tools/data_portability.js";
import { checkUpdates as seedCheckUpdates } from "./seeds/update_check.js";
import { fetchOrchard, setOrchardUrl } from "./seeds/orchard.js";

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
  seedsStopAll();
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
  seedDispatchEvent("scan", decision);
  // Surface non-quiet decisions to the HUD as bubble state updates.
  if (decision.decision !== "quiet") {
    bus.notify(RpcMethods.NOTIFY_BUBBLE_STATE, {
      state: "alert",
      message: decision.message ?? decision.reason,
      badge: 1,
    });
    seedDispatchEvent("bubble_state", {
      state: "alert",
      message: decision.message ?? decision.reason,
    });
  }
  // Autonomous act dispatch — scanner's proposed tool call runs through
  // the gate (or respects policy, per automation prefs).
  if (decision.decision === "act" && decision.proposed_tool) {
    const dispatched = await dispatchScanProposal(db, { bridge, bus }, decision);
    return { ...decision, dispatch: dispatched };
  }
  return decision;
});

// --- Automation preferences ---
bus.on(RpcMethods.AUTOMATION_GET, async () => getAutomationPrefs(db));
bus.on(RpcMethods.AUTOMATION_SET, async (p: unknown) =>
  setAutomationPrefs(db, p as Parameters<typeof setAutomationPrefs>[1]),
);

bus.on(RpcMethods.CHAT, async (params: unknown) => {
  const { prompt, conversationId, goalId } = params as {
    prompt: string;
    conversationId?: number;
    goalId?: number;
  };
  const payload: Parameters<typeof chat>[2] = { prompt };
  if (conversationId !== undefined) payload.conversationId = conversationId;
  if (goalId !== undefined) payload.goalId = goalId;
  const result = await chat(db, (m, p) => bus.notify(m, p), payload, bridge, bus);
  seedDispatchEvent("chat", { prompt, text: result.text, conversationId: result.conversationId });
  return result;
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

// --- PDF ingestion ---
bus.on(RpcMethods.PDF_INGEST, async (p: unknown) =>
  pdfIngest(db, p as Parameters<typeof pdfIngest>[1]),
);

// --- Chat history ---
bus.on(RpcMethods.CHAT_SEARCH, async (p: unknown) =>
  chatSearch(db, p as Parameters<typeof chatSearch>[1]),
);
bus.on(RpcMethods.CHAT_LIST_CONVERSATIONS, async (p: unknown) =>
  chatListConversations(db, (p ?? {}) as Parameters<typeof chatListConversations>[1]),
);
bus.on(RpcMethods.CHAT_GET_CONVERSATION, async (p: unknown) =>
  chatGetConversation(db, p as Parameters<typeof chatGetConversation>[1]),
);

// --- Automation + Research + Sandbox ---
bus.on(RpcMethods.AUTOMATE, async (p: unknown) =>
  automate(db, { bridge, bus }, p as Parameters<typeof automate>[2]),
);

// --- Secrets vault ---
bus.on(RpcMethods.SECRET_SET, async (p: unknown) =>
  secretSet(db, p as Parameters<typeof secretSet>[1]),
);
bus.on(RpcMethods.SECRET_GET, async (p: unknown) =>
  secretGet(db, p as Parameters<typeof secretGet>[1]),
);
bus.on(RpcMethods.SECRET_LIST, async () => secretList(db));
bus.on(RpcMethods.SECRET_DELETE, async (p: unknown) =>
  secretDelete(db, p as Parameters<typeof secretDelete>[1]),
);

// --- Location ---
bus.on(RpcMethods.LOCATION_REGISTER, async (p: unknown) =>
  registerLocation(db, p as Parameters<typeof registerLocation>[1]),
);
bus.on(RpcMethods.LOCATION_APPLY, async () => applyCurrentLocation(db));
bus.on(RpcMethods.RESEARCH, async (p: unknown) =>
  research(db, { bridge, bus }, p as Parameters<typeof research>[2]),
);
bus.on(RpcMethods.SANDBOX_RUN, async (p: unknown) =>
  sandboxRun(p as Parameters<typeof sandboxRun>[0]),
);

// --- Workflow macros ---
bus.on(RpcMethods.MACRO_SAVE, async (p: unknown) =>
  macroSave(db, p as Parameters<typeof macroSave>[1]),
);
bus.on(RpcMethods.MACRO_LIST, async () => macroList(db));
bus.on(RpcMethods.MACRO_DELETE, async (p: unknown) =>
  macroDelete(db, p as Parameters<typeof macroDelete>[1]),
);
bus.on(RpcMethods.MACRO_RUN, async (p: unknown) =>
  macroRun(db, { bridge, bus }, p as Parameters<typeof macroRun>[2]),
);

// --- Calendar / RSS / Weather ---
bus.on(RpcMethods.CAL_UPCOMING, async (p: unknown) =>
  upcomingEvents(db, (p ?? {}) as Parameters<typeof upcomingEvents>[1]),
);
bus.on(RpcMethods.CAL_SET_SOURCES, async (p: unknown) => {
  const { sources } = p as { sources: string[] };
  return setCalendarSources(db, sources);
});
bus.on(RpcMethods.CAL_LIST, async () => listCalendarSources(db));
bus.on(RpcMethods.RSS_LATEST, async (p: unknown) =>
  latestItems(db, (p ?? {}) as Parameters<typeof latestItems>[1]),
);
bus.on(RpcMethods.RSS_SET_FEEDS, async (p: unknown) => {
  const { feeds } = p as { feeds: string[] };
  return setFeeds(db, feeds);
});
bus.on(RpcMethods.RSS_LIST, async () => listFeeds(db));
bus.on(RpcMethods.WEATHER_NOW, async () => currentWeather(db));
bus.on(RpcMethods.WEATHER_SET_LOCATION, async (p: unknown) => {
  const { location } = p as { location: { lat: number; lon: number; name: string } | null };
  return setWeatherLocation(db, location);
});

// --- Mail ---
bus.on(RpcMethods.MAIL_INBOX, async (p: unknown) =>
  mailInbox(db, (p ?? {}) as Parameters<typeof mailInbox>[1]),
);
bus.on(RpcMethods.MAIL_UNREAD, async (p: unknown) =>
  mailUnread(db, (p ?? {}) as Parameters<typeof mailUnread>[1]),
);
bus.on(RpcMethods.MAIL_SEARCH, async (p: unknown) =>
  mailSearch(db, p as Parameters<typeof mailSearch>[1]),
);
bus.on(RpcMethods.MAIL_SEND, async (p: unknown) =>
  mailSend(db, p as Parameters<typeof mailSend>[1]),
);

// --- Personalisation ---
bus.on(RpcMethods.PERSONA_GET, async () => getPersona(db));
bus.on(RpcMethods.PERSONA_SET, async (p: unknown) =>
  setPersona(db, p as Parameters<typeof setPersona>[1]),
);
bus.on(RpcMethods.KEYBINDS_GET, async () => getKeybinds(db));
bus.on(RpcMethods.KEYBINDS_SET, async (p: unknown) =>
  setKeybinds(db, p as Parameters<typeof setKeybinds>[1]),
);

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
bus.on(RpcMethods.TODO_ADD, async (params: unknown) => {
  const r = await todoAdd(db, params as Parameters<typeof todoAdd>[1]);
  void syncTodoMd(db).catch(() => undefined);
  return r;
});
bus.on(RpcMethods.TODO_LIST, async (params: unknown) =>
  todoList(db, params as Parameters<typeof todoList>[1]),
);
bus.on(RpcMethods.TODO_DONE, async (params: unknown) => {
  const r = await todoDone(db, params as Parameters<typeof todoDone>[1]);
  // Mirror the state change into Obsidian Todo.md if one is configured.
  // Fire-and-forget — a sync error shouldn't fail the primary action.
  void syncTodoMd(db).catch(() => undefined);
  return r;
});
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
bus.on(RpcMethods.MILESTONE_TO_TODOS, async (params: unknown) =>
  milestoneToTodos(db, params as Parameters<typeof milestoneToTodos>[1]),
);
bus.on(RpcMethods.GOAL_DELETE, async (params: unknown) =>
  goalDelete(db, params as Parameters<typeof goalDelete>[1]),
);
bus.on(RpcMethods.FIRST_RUN_GET, async () => {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'first_run_done'")
    .get() as { value: string } | undefined;
  return { done: row ? JSON.parse(row.value) === true : false };
});
bus.on(RpcMethods.FIRST_RUN_MARK, async () => {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('first_run_done', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'",
    )
    .run();
  return { ok: true };
});

bus.on(RpcMethods.TODO_MD_SYNC, async () => syncTodoMd(db));
bus.on(RpcMethods.TODO_MD_PATH_GET, async () => ({ path: getTodoMdPath(db) }));
bus.on(RpcMethods.TODO_MD_PATH_SET, async (p: unknown) => {
  const { path } = p as { path: string };
  return setTodoMdPath(db, path);
});
bus.on(RpcMethods.TODOS_TOP_TODAY, async () => {
  const r = await todaysTopTodos(db);
  if (r.message) {
    bus.notify(RpcMethods.NOTIFY_BUBBLE_STATE, {
      state: "alert",
      message: r.message,
      badge: 1,
    });
  }
  return r;
});

bus.on(RpcMethods.SYSTEM_SNAPSHOT, async () => {
  const snap = await systemSnapshot(db);
  seedDispatchEvent("activity", snap);
  return snap;
});
bus.on(RpcMethods.INITIATIVE_PULSE, async () => {
  const r = await initiativePulse(db);
  if (r.message) {
    bus.notify(RpcMethods.NOTIFY_BUBBLE_STATE, { state: "alert", message: r.message, badge: 1 });
  }
  return r;
});
bus.on(RpcMethods.SYSTEM_STATS, async () => activityStats(db));
bus.on(RpcMethods.SYSTEM_DISTRACTION_CHECK, async () => {
  const msg = distractionNudge(db);
  if (msg) {
    bus.notify(RpcMethods.NOTIFY_BUBBLE_STATE, { state: "alert", message: msg, badge: 1 });
  }
  return { message: msg };
});

bus.on(RpcMethods.RADAR_CHECK, async () => {
  const hit = deadlineRadar(db);
  if (hit) {
    // Surface to the HUD as speech + also as an 'alert' bubble state.
    bus.notify(RpcMethods.NOTIFY_BUBBLE_STATE, {
      state: "alert",
      message: hit.message,
      badge: 1,
    });
  }
  return hit;
});

bus.on(RpcMethods.GOAL_CONVERSATIONS, async (params: unknown) => {
  const { goalId } = params as { goalId: number };
  const rows = db.$raw
    .query(
      `SELECT c.id AS id, c.started_at AS startedAt,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY ts ASC LIMIT 1) AS firstMessage,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS messageCount
         FROM conversations c
        WHERE c.goal_id = ?
        ORDER BY c.started_at DESC`,
    )
    .all(goalId);
  return { conversations: rows };
});

// --- Obsidian vault ---
bus.on(RpcMethods.VAULT_SET_ROOT, async (params: unknown) => {
  // Always close the previous watcher before reconfiguring — otherwise a root
  // change keeps watching the old path forever.
  if (vaultWatcherClose) {
    try {
      await vaultWatcherClose.close();
    } catch {
      /* ignore */
    }
    vaultWatcherClose = null;
  }
  const res = await setVaultRoot(db, params as Parameters<typeof setVaultRoot>[1]);
  const root = await getVaultRoot(db);
  if (root) {
    try {
      const indexResult = await indexVault(db, root);
      bus.notify(RpcMethods.NOTIFY_LOG, {
        level: "info",
        message: `vault indexed: ${indexResult.indexed}/${indexResult.total_md} files at ${root}`,
      });
      vaultWatcherClose = watchVault(db, root);
    } catch (err) {
      bus.notify(RpcMethods.NOTIFY_LOG, {
        level: "warn",
        message: `vault init failed: ${(err as Error).message}`,
      });
    }
  }
  return res;
});
bus.on(RpcMethods.VAULT_GET_ROOT, async () => ({ path: await getVaultRoot(db) }));
bus.on(RpcMethods.VAULT_STATUS, async () => {
  const root = await getVaultRoot(db);
  const countRow = db.$raw
    .query("SELECT COUNT(*) AS n FROM vault_notes")
    .get() as { n: number } | undefined;
  const dailyRow = db.$raw
    .query("SELECT value FROM settings WHERE key = 'vault_daily_note_template'")
    .get() as { value: string } | undefined;
  const todoPath = (await import("./tools/todo_sync.js")).getTodoMdPath(db);
  return {
    root,
    watcherActive: vaultWatcherClose !== null,
    notesIndexed: countRow?.n ?? 0,
    dailyNoteTemplate: dailyRow ? JSON.parse(dailyRow.value) : "daily/YYYY-MM-DD.md",
    todoMdPath: todoPath,
  };
});
bus.on(RpcMethods.VAULT_DAILY_NOTE_PATH_GET, async () => {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'vault_daily_note_template'")
    .get() as { value: string } | undefined;
  return { template: row ? JSON.parse(row.value) : "daily/YYYY-MM-DD.md" };
});
bus.on(RpcMethods.VAULT_DAILY_NOTE_PATH_SET, async (p: unknown) => {
  const { template } = p as { template: string };
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('vault_daily_note_template', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(template));
  return { ok: true };
});
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

// --- Cost / usage ---
bus.on(RpcMethods.COST_SUMMARY, async () => costSummary(db));

// --- Nightly reflection ---
bus.on(RpcMethods.REFLECTION_RUN, async () => runReflection(db));
bus.on(RpcMethods.REFLECTION_PENDING, async () => listPendingProposals(db));
bus.on(RpcMethods.REFLECTION_RESOLVE, async (p: unknown) =>
  resolveProposal(db, p as Parameters<typeof resolveProposal>[1]),
);

// --- Memory browse / update / delete ---
bus.on(RpcMethods.MEMORY_BROWSE, async (p: unknown) =>
  browseMemory(db, (p ?? {}) as Parameters<typeof browseMemory>[1]),
);
bus.on(RpcMethods.MEMORY_UPDATE, async (p: unknown) =>
  updateMemory(db, p as Parameters<typeof updateMemory>[1]),
);
bus.on(RpcMethods.MEMORY_DELETE, async (p: unknown) =>
  deleteMemory(db, p as Parameters<typeof deleteMemory>[1]),
);

// --- Spotlight + what-next ---
bus.on(RpcMethods.SPOTLIGHT_SEARCH, async (p: unknown) =>
  spotlightSearch(db, p as Parameters<typeof spotlightSearch>[1]),
);
bus.on(RpcMethods.WHAT_NEXT, async () => {
  const pick = await whatNext(db);
  bus.notify(RpcMethods.NOTIFY_BUBBLE_STATE, { state: "alert", message: pick.action, badge: 1 });
  return pick;
});

// --- Undo / audit list ---
bus.on(RpcMethods.AUDIT_LIST, async (p: unknown) => {
  const { limit } = (p ?? {}) as { limit?: number };
  return listAuditable(db, limit);
});
bus.on(RpcMethods.AUDIT_UNDO, async (p: unknown) =>
  undoAction(db, bridge, p as Parameters<typeof undoAction>[2]),
);

// --- Vision ---
bus.on(RpcMethods.VISION_ASK, async (p: unknown) =>
  screenshotAndAsk(db, (p ?? {}) as Parameters<typeof screenshotAndAsk>[1]),
);

// --- Todo delete / update ---
bus.on(RpcMethods.TODO_DELETE, async (p: unknown) => {
  const { id } = p as { id: number };
  db.$raw.query("DELETE FROM todos WHERE id = ?").run(id);
  void syncTodoMd(db).catch(() => undefined);
  return { ok: true };
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
  if (text !== undefined) {
    sets.push("text = ?");
    args.push(text);
  }
  if (priority !== undefined) {
    sets.push("priority = ?");
    args.push(priority);
  }
  if (due_at !== undefined) {
    sets.push("due_at = ?");
    args.push(due_at);
  }
  if (project !== undefined) {
    sets.push("project = ?");
    args.push(project);
  }
  if (sets.length === 0) return { ok: true };
  args.push(id);
  db.$raw.query(`UPDATE todos SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  return { ok: true };
});

// --- Auto retrigger loop ---
bus.on(RpcMethods.AUTO_LOOP_START, async (p: unknown) => {
  const params = p as { task: string; maxSteps?: number; maxCostUsd?: number; goalId?: number };
  return startAutoLoop(db, { bridge, bus }, params);
});
bus.on(RpcMethods.AUTO_LOOP_CANCEL, async (p: unknown) => {
  const { id } = p as { id: number };
  return cancelLoop(db, id);
});
bus.on(RpcMethods.AUTO_LOOP_RESUME, async (p: unknown) => {
  const params = p as { id: number; maxSteps?: number; maxCostUsd?: number };
  return resumeAutoLoop(db, { bridge, bus }, params);
});
bus.on(RpcMethods.AUTO_LOOP_LIST, async (p: unknown) => listLoops(db, (p ?? {}) as { limit?: number; status?: string }));
bus.on(RpcMethods.AUTO_LOOP_EVENTS, async (p: unknown) =>
  loopEvents(db, p as { id: number }),
);

// Clean up orphaned loops on boot (marked 'abandoned' so the UI doesn't think
// they're still running after a sidecar restart).
markOrphanedLoopsAbandoned(db);

// --- Sitting / unlock ---
bus.on(RpcMethods.SYSTEM_SITTING, async () => {
  const msg = sittingNudge(db);
  if (msg)
    bus.notify(RpcMethods.NOTIFY_BUBBLE_STATE, {
      state: "alert",
      message: msg,
      badge: 1,
    });
  return { message: msg };
});
bus.on(RpcMethods.SYSTEM_UNLOCK_CHECK, async () => checkUnlockTransition(db));

// Wire HTTP /rpc dispatcher so the mobile PWA can reach the sidecar.
bridge.setHttpRpcDispatcher((method, params) => bus.invoke(method, params));

// Wire the HTTP chat-stream endpoint for the mobile PWA. Yields deltas as
// they arrive from the agent, terminates with a single {done,text} frame.
bridge.setChatStreamer(async function* (prompt, opts) {
  const deltas: string[] = [];
  let convId: number | null = null;
  let done = false;
  const push = (d: string) => deltas.push(d);
  const prom = chat(
    db,
    (method, params) => {
      if (method === "passio.chat.chunk") {
        const c = params as { delta?: string; done?: boolean; conversationId?: number };
        if (c.conversationId !== undefined) convId = c.conversationId;
        if (c.done) {
          done = true;
        } else if (c.delta) {
          push(c.delta);
        }
      }
    },
    { prompt, ...(opts.conversationId !== undefined ? { conversationId: opts.conversationId } : {}), ...(opts.goalId !== undefined ? { goalId: opts.goalId } : {}) },
    bridge,
    bus,
  );
  // Drain deltas from the queue while the chat runs.
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  while (!done) {
    if (deltas.length > 0) yield { delta: deltas.shift()! };
    else await sleep(20);
  }
  while (deltas.length > 0) yield { delta: deltas.shift()! };
  const result = await prom;
  yield { done: true, text: result.text, conversationId: result.conversationId };
});

// Hook bus.notify so every bubble_state broadcast also reaches subscribed
// seeds. Keeps the original host-forwarding behavior intact.
{
  const originalNotify = bus.notify.bind(bus);
  bus.notify = (method: string, params?: unknown) => {
    originalNotify(method, params);
    if (method === RpcMethods.NOTIFY_BUBBLE_STATE) {
      seedDispatchEvent("bubble_state", params);
    }
  };
}

// --- Personality tree ---
bus.on(RpcMethods.SETTINGS_GET, async (p: unknown) => {
  const { key } = p as { key: string };
  const row = db.$raw.query("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? { value: row.value } : null;
});
bus.on(RpcMethods.SETTINGS_SET, async (p: unknown) => {
  const { key, value } = p as { key: string; value: unknown };
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, serialized);
  return { ok: true };
});
bus.on(RpcMethods.SETTINGS_DELETE, async (p: unknown) => {
  const { key } = p as { key: string };
  db.$raw.query("DELETE FROM settings WHERE key = ?").run(key);
  return { ok: true };
});
bus.on(RpcMethods.PERSONA_TREE, async () => ({ tree: PERSONA_TREE }));
bus.on(RpcMethods.PERSONA_APPLY_PATH, async (p: unknown) => {
  const { path } = p as { path: string[] };
  const composed = composePersona(path);
  // Persist: update persona voice + a system-prompt override + default posture.
  const { setPersona } = await import("./tools/persona.js");
  setPersona(db, { voice: composed.voice as "alloy" | "echo" | "fable" | "nova" | "onyx" | "shimmer" });
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('persona_prompt_extra', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify({ prompt: composed.prompt, path }));
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('persona_path', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(path));
  // Apply posture via proactive mode + dnd.
  const { setProactiveMode, setProactiveInterval, setDnd } = await import("./tools/focus.js");
  if (composed.posture === "quiet") {
    setProactiveMode(db, "check-in");
    setProactiveInterval(db, 30);
    setDnd(db, { minutes: 120 });
  } else if (composed.posture === "active") {
    setProactiveMode(db, "active-assist");
    setProactiveInterval(db, 7);
    setDnd(db, { minutes: null });
  } else {
    setProactiveMode(db, "active-assist");
    setProactiveInterval(db, 5);
    setDnd(db, { minutes: null });
  }
  return { ok: true, prompt: composed.prompt, voice: composed.voice, posture: composed.posture };
});

// --- Seeds (plugin system) ---
bus.on(RpcMethods.SEED_LIST, async () => ({
  seeds: seedList(db).map((s) => ({
    name: s.name,
    version: s.version,
    enabled: s.enabled,
    description: s.manifest.description,
    author: s.manifest.author ?? null,
    permissions: s.manifest.permissions,
    contributes: s.manifest.contributes,
    source: s.source,
    installedAt: s.installedAt,
  })),
}));
bus.on(RpcMethods.SEED_INSTALL_DESCRIPTOR, async (p: unknown) => {
  const desc = SeedDescriptorSchema.parse(p);
  return installFromDescriptor(db, desc);
});
bus.on(RpcMethods.SEED_INSTALL_LOCAL, async (p: unknown) => {
  const { path } = p as { path: string };
  const res = await installFromLocalPath(db, path);
  return res;
});
bus.on(RpcMethods.SEED_ENABLE, async (p: unknown) => {
  const { name } = p as { name: string };
  return seedStart(db, bus, name);
});
bus.on(RpcMethods.SEED_DISABLE, async (p: unknown) => {
  const { name } = p as { name: string };
  return seedStop(db, bus, name);
});
bus.on(RpcMethods.SEED_UNINSTALL, async (p: unknown) => {
  const { name } = p as { name: string };
  seedStop(db, bus, name);
  removeSeed(db, name);
  return { ok: true };
});
bus.on(RpcMethods.SEED_GET_SETTINGS, async (p: unknown) => {
  const { name } = p as { name: string };
  const row = getSeed(db, name);
  return { settings: row?.settings ?? {} };
});
bus.on(RpcMethods.SEED_SET_SETTINGS, async (p: unknown) => {
  const { name, settings } = p as { name: string; settings: Record<string, unknown> };
  seedSetSettings(db, name, settings);
  // Restart the seed so it picks up fresh settings.
  await restartSeed(db, bus, name);
  return { ok: true };
});
bus.on(RpcMethods.SEED_INVOKE_TOOL, async (p: unknown) => {
  const { seed, tool, args } = p as { seed: string; tool: string; args: unknown };
  return invokeToolOnSeed(seed, tool, args);
});
bus.on(RpcMethods.SEED_DEV_START, async (p: unknown) => startDev(db, bus, p as { path: string }));
bus.on(RpcMethods.SEED_DEV_STOP, async () => stopDev(db, bus));
bus.on(RpcMethods.SEED_LOGS, async (p: unknown) => {
  const { name } = p as { name: string };
  return { logs: seedLogs(name) };
});
bus.on(RpcMethods.SEED_PANEL_SRC, async (p: unknown) => {
  const { seed, panel } = p as { seed: string; panel: string };
  const row = getSeed(db, seed);
  if (!row) throw new Error("seed not found");
  const src = readPanelSrc(row.dir, panel);
  return { src };
});
bus.on(RpcMethods.SEED_HOTKEY_FIRE, async (p: unknown) => {
  const { name } = p as { name: string };
  // Built-in hotkey names have no colon. Seed-scoped names are `seed:<name>:<id>`.
  if (name.startsWith("seed:")) {
    const [, seedName, hkId] = name.split(":");
    if (seedName && hkId) {
      const { invokeHotkey } = await import("./seeds/runtime.js");
      invokeHotkey(seedName, hkId);
    }
  }
  seedDispatchEvent("hotkey", { name });
  return { ok: true };
});
bus.on(RpcMethods.SEED_HOTKEYS_LIST, async () => {
  const out: Array<{ seed: string; id: string; default: string; label?: string }> = [];
  for (const row of seedList(db)) {
    if (!row.enabled) continue;
    for (const h of row.manifest.contributes.hotkeys ?? []) {
      out.push({
        seed: row.name,
        id: h.id,
        default: h.default,
        ...(h.label !== undefined ? { label: h.label } : {}),
      });
    }
  }
  return { hotkeys: out };
});
bus.on(RpcMethods.SEED_MAIN_TABS, async () => {
  const out: Array<{ seed: string; id: string; title: string; icon?: string; panel: string }> = [];
  for (const row of seedList(db)) {
    if (!row.enabled) continue;
    for (const t of row.manifest.contributes.tabs ?? []) {
      if (!t.promoteToMainTab) continue;
      out.push({
        seed: row.name,
        id: t.id,
        title: t.title,
        panel: t.panel,
        ...(t.icon ? { icon: t.icon } : {}),
      });
    }
  }
  return { tabs: out };
});

// Seed updates / data portability / budget alerts
bus.on(RpcMethods.SEED_CHECK_UPDATES, async () => seedCheckUpdates(db));
bus.on(RpcMethods.ORCHARD_FETCH, async () => fetchOrchard(db));
bus.on(RpcMethods.ORCHARD_SET_URL, async (p: unknown) => {
  const { url } = p as { url: string };
  return setOrchardUrl(db, url);
});
bus.on(RpcMethods.DATA_EXPORT, async (p: unknown) =>
  exportData(db, p as Parameters<typeof exportData>[1]),
);
bus.on(RpcMethods.DATA_IMPORT, async (p: unknown) =>
  importData(db, p as Parameters<typeof importData>[1]),
);
bus.on(RpcMethods.COST_BUDGET_GET, async () => {
  const row = db.$raw
    .query("SELECT value FROM settings WHERE key = 'cost_budget'")
    .get() as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as { daily?: number; monthly?: number }) : {};
});
bus.on(RpcMethods.COST_BUDGET_SET, async (p: unknown) => {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('cost_budget', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(p ?? {}));
  return { ok: true };
});
bus.on(RpcMethods.COST_BUDGET_CHECK, async () => {
  const r = budgetCheck(db);
  if (r.alert) {
    bus.notify(RpcMethods.NOTIFY_BUBBLE_STATE, {
      state: "alert",
      message: `💰 ${r.alert}`,
      badge: 1,
    });
  }
  return r;
});

// Boot: auto-start all enabled seeds after other subsystems are ready.
setTimeout(() => startAllEnabled(db, bus), 100);
void readManifestFromDir; // keep import for tree-shake

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
// Parent closed our stdout — typical when Tauri core shuts down.
process.on("SIGPIPE", () => process.exit(0));
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
});

// === Boot ===
idle.start();
bus.notify(RpcMethods.NOTIFY_LOG, {
  level: "info",
  message: `passio sidecar v${SIDECAR_VERSION} ready (idle timeout ${DEFAULT_IDLE_MS}ms, hasVec=${db.$hasVec})`,
});
