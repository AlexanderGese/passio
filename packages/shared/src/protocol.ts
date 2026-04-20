import { z } from "zod";

/**
 * JSON-RPC 2.0 message types spoken between Rust core and Bun sidecar
 * (stdin/stdout) and between sidecar and browser extension (local WS).
 *
 * All messages are JSON lines (one object per line, newline-delimited).
 */

export const RpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.unknown().optional(),
});
export type RpcRequest = z.infer<typeof RpcRequestSchema>;

export const RpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});
export type RpcResponse = z.infer<typeof RpcResponseSchema>;

export const RpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.unknown().optional(),
});
export type RpcNotification = z.infer<typeof RpcNotificationSchema>;

export type RpcMessage = RpcRequest | RpcResponse | RpcNotification;

// === Core RPC methods (sidecar exposes; Rust core calls) ===

export const PingParams = z.object({}).optional();
export const PingResult = z.object({
  pong: z.literal(true),
  sidecarVersion: z.string(),
  uptimeMs: z.number(),
});
export type PingResult = z.infer<typeof PingResult>;

export const ChatParams = z.object({
  prompt: z.string(),
  conversationId: z.number().optional(),
  mode: z.enum(["text", "voice", "proactive"]).default("text"),
});
export type ChatParams = z.infer<typeof ChatParams>;

export const ChatChunk = z.object({
  conversationId: z.number(),
  delta: z.string(),
  done: z.boolean(),
});
export type ChatChunk = z.infer<typeof ChatChunk>;

export const ScanParams = z.object({
  reason: z.enum(["cron", "manual", "force"]),
});
export type ScanParams = z.infer<typeof ScanParams>;

export const VoicePttStartParams = z.object({});
export const VoicePttStopParams = z.object({});

export const ShutdownParams = z.object({
  reason: z.enum(["idle", "user", "crash"]).optional(),
});

/**
 * Registry of all known RPC method names. Use as the single source of truth
 * for both sides of the bus.
 */
export const RpcMethods = {
  PING: "passio.ping",
  CHAT: "passio.chat",
  SCAN: "passio.scan",
  VOICE_PTT_START: "passio.voice.pttStart",
  VOICE_PTT_STOP: "passio.voice.pttStop",
  SHUTDOWN: "passio.shutdown",

  // Memory / context
  MEMORY_REMEMBER: "passio.memory.remember",
  MEMORY_FORGET: "passio.memory.forget",
  MEMORY_SEARCH: "passio.memory.search",
  // Todos
  TODO_ADD: "passio.todo.add",
  TODO_LIST: "passio.todo.list",
  TODO_DONE: "passio.todo.done",
  // Notes
  NOTE_SAVE: "passio.note.save",
  NOTE_SEARCH: "passio.note.search",
  // Intent
  INTENT_SET: "passio.intent.set",
  INTENT_GET: "passio.intent.get",
  // Goals
  GOAL_CREATE: "passio.goal.create",
  GOAL_LIST: "passio.goal.list",
  GOAL_UPDATE: "passio.goal.update",
  GOAL_DECOMPOSE: "passio.goal.decompose",
  GOAL_REVIEW: "passio.goal.review",
  MILESTONE_ADD: "passio.milestone.add",
  MILESTONE_DONE: "passio.milestone.done",
  MILESTONE_RESCHEDULE: "passio.milestone.reschedule",
  MILESTONE_TO_TODOS: "passio.milestone.toTodos",
  GOAL_DELETE: "passio.goal.delete",
  GOAL_CONVERSATIONS: "passio.goal.conversations",
  RADAR_CHECK: "passio.radar.check",
  FIRST_RUN_GET: "passio.firstRun.get",
  FIRST_RUN_MARK: "passio.firstRun.mark",
  TODO_MD_SYNC: "passio.todoMd.sync",
  TODO_MD_PATH_GET: "passio.todoMd.getPath",
  TODO_MD_PATH_SET: "passio.todoMd.setPath",
  TODOS_TOP_TODAY: "passio.todos.topToday",
  SYSTEM_SNAPSHOT: "passio.system.snapshot",
  SYSTEM_STATS: "passio.system.stats",
  SYSTEM_DISTRACTION_CHECK: "passio.system.distractionCheck",
  INITIATIVE_PULSE: "passio.initiative.pulse",
  // Analytics
  HABIT_UPSERT: "passio.habit.upsert",
  HABIT_LOG: "passio.habit.log",
  HABIT_SUMMARY: "passio.habit.summary",
  JOURNAL_ADD: "passio.journal.add",
  JOURNAL_RECENT: "passio.journal.recent",
  TIMEBLOCK_CREATE: "passio.timeBlock.create",
  ACTIVITY_LOG: "passio.activity.log",
  // Knowledge graph
  GRAPH_ENTITY_UPSERT: "passio.graph.entityUpsert",
  GRAPH_EDGE_ADD: "passio.graph.edgeAdd",
  GRAPH_QUERY: "passio.graph.query",
  // File index
  FILE_INDEX: "passio.file.index",
  FILE_SEARCH: "passio.file.search",
  // Flashcards
  CARDS_FROM_NOTE: "passio.cards.fromNote",
  CARDS_DUE: "passio.cards.due",
  CARDS_GRADE: "passio.cards.grade",
  // Shell + git
  SHELL_RUN: "passio.shell.run",
  SHELL_ALLOWLIST: "passio.shell.allowlist",
  SHELL_ALLOW: "passio.shell.allow",
  GIT_COMMIT_MSG: "passio.git.commitMsg",
  GIT_PR_DESCRIPTION: "passio.git.prDescription",
  // Voice
  VOICE_TRANSCRIBE: "passio.voice.transcribe",
  VOICE_SYNTHESIZE: "passio.voice.synthesize",
  // Text transforms
  REWRITE: "passio.rewrite",
  TRANSLATE: "passio.translate",
  // Automation
  AUTOMATE: "passio.automate",
  AUTOMATION_GET: "passio.automation.get",
  AUTOMATION_SET: "passio.automation.set",
  // Secrets vault
  SECRET_SET: "passio.secret.set",
  SECRET_GET: "passio.secret.get",
  SECRET_LIST: "passio.secret.list",
  SECRET_DELETE: "passio.secret.delete",
  // Location
  LOCATION_REGISTER: "passio.location.register",
  LOCATION_APPLY: "passio.location.apply",
  // PDF
  PDF_INGEST: "passio.pdf.ingest",
  // Chat history
  CHAT_SEARCH: "passio.chat.search",
  CHAT_LIST_CONVERSATIONS: "passio.chat.listConversations",
  CHAT_GET_CONVERSATION: "passio.chat.getConversation",
  // Research / Sandbox
  RESEARCH: "passio.research",
  SANDBOX_RUN: "passio.sandbox.run",
  // Macros
  MACRO_SAVE: "passio.macro.save",
  MACRO_LIST: "passio.macro.list",
  MACRO_DELETE: "passio.macro.delete",
  MACRO_RUN: "passio.macro.run",
  // Calendar
  CAL_UPCOMING: "passio.calendar.upcoming",
  CAL_SET_SOURCES: "passio.calendar.setSources",
  CAL_LIST: "passio.calendar.list",
  // RSS
  RSS_LATEST: "passio.rss.latest",
  RSS_SET_FEEDS: "passio.rss.setFeeds",
  RSS_LIST: "passio.rss.list",
  // Weather
  WEATHER_NOW: "passio.weather.now",
  WEATHER_SET_LOCATION: "passio.weather.setLocation",
  // Mail
  MAIL_INBOX: "passio.mail.inbox",
  MAIL_UNREAD: "passio.mail.unread",
  MAIL_SEARCH: "passio.mail.search",
  MAIL_SEND: "passio.mail.send",
  // Personalisation
  PERSONA_GET: "passio.persona.get",
  PERSONA_SET: "passio.persona.set",
  KEYBINDS_GET: "passio.keybinds.get",
  KEYBINDS_SET: "passio.keybinds.set",
  // Safety rails — policy, blocklist, gate
  POLICY_GET: "passio.policy.get",
  POLICY_SET: "passio.policy.set",
  POLICY_DELETE: "passio.policy.delete",
  POLICY_SET_COUNTDOWN: "passio.policy.setCountdown",
  BLOCKLIST_SET: "passio.blocklist.set",
  GATE_RESOLVE: "passio.gate.resolve", // Rust → sidecar
  NOTIFY_GATE_REQUEST: "passio.gate.request", // sidecar → Rust
  // Focus / packs / DND / proactive
  FOCUS_GET_STATE: "passio.focus.getState",
  FOCUS_START: "passio.focus.start",
  FOCUS_STOP: "passio.focus.stop",
  PACK_GET: "passio.pack.get",
  PACK_SET: "passio.pack.set",
  PACK_CYCLE: "passio.pack.cycle",
  DND_GET: "passio.dnd.get",
  DND_SET: "passio.dnd.set",
  DND_TOGGLE: "passio.dnd.toggle",
  PROACTIVE_GET: "passio.proactive.get",
  PROACTIVE_SET: "passio.proactive.set",
  DISTRACTING_GET: "passio.distracting.get",
  DISTRACTING_SET: "passio.distracting.set",
  DAILY_RECAP: "passio.dailyRecap",
  MORNING_BRIEFING: "passio.morningBriefing",
  // Browser bridge
  BRIDGE_STATUS: "passio.bridge.status",
  BROWSER_GET_CURRENT_TAB: "passio.browser.getCurrentTab",
  BROWSER_SUMMARIZE_PAGE: "passio.browser.summarizePage",

  // Obsidian vault
  VAULT_SET_ROOT: "passio.vault.setRoot",
  VAULT_GET_ROOT: "passio.vault.getRoot",
  VAULT_INDEX: "passio.vault.index",
  VAULT_SEARCH: "passio.vault.search",
  VAULT_READ: "passio.vault.read",
  VAULT_WRITE: "passio.vault.write",
  VAULT_LIST_TAGS: "passio.vault.listTags",
  VAULT_DAILY_RECAP: "passio.vault.dailyRecap",
  VAULT_STATUS: "passio.vault.status",
  VAULT_DAILY_NOTE_PATH_GET: "passio.vault.dailyNotePathGet",
  VAULT_DAILY_NOTE_PATH_SET: "passio.vault.dailyNotePathSet",

  // Cost / usage
  COST_SUMMARY: "passio.cost.summary",

  // Nightly reflection
  REFLECTION_RUN: "passio.reflection.run",
  REFLECTION_PENDING: "passio.reflection.pending",
  REFLECTION_RESOLVE: "passio.reflection.resolve",

  // Unified memory browser
  MEMORY_BROWSE: "passio.memory.browse",
  MEMORY_UPDATE: "passio.memory.update",
  MEMORY_DELETE: "passio.memory.delete",

  // Spotlight + what-next
  SPOTLIGHT_SEARCH: "passio.spotlight.search",
  WHAT_NEXT: "passio.whatNext",

  // Undo for autonomous actions
  AUDIT_LIST: "passio.audit.list",
  AUDIT_UNDO: "passio.audit.undo",

  // Screenshot-and-ask
  VISION_ASK: "passio.vision.ask",

  // Todo delete + edit (hud-only shortcuts)
  TODO_DELETE: "passio.todo.delete",
  TODO_UPDATE: "passio.todo.update",

  // Sitting / unlock
  SYSTEM_SITTING: "passio.system.sittingNudge",
  SYSTEM_UNLOCK_CHECK: "passio.system.unlockCheck",

  // Auto-retrigger loop
  AUTO_LOOP_START: "passio.autoLoop.start",
  AUTO_LOOP_CANCEL: "passio.autoLoop.cancel",
  AUTO_LOOP_RESUME: "passio.autoLoop.resume",
  AUTO_LOOP_LIST: "passio.autoLoop.list",
  AUTO_LOOP_EVENTS: "passio.autoLoop.events",
  NOTIFY_AUTO_LOOP_UPDATE: "passio.autoLoop.update",

  // Personality picker
  PERSONA_TREE: "passio.persona.tree",
  PERSONA_APPLY_PATH: "passio.persona.applyPath",
  SETTINGS_GET: "passio.settings.get",
  SETTINGS_SET: "passio.settings.set",
  SETTINGS_DELETE: "passio.settings.delete",

  // Seeds (plugins)
  SEED_LIST: "passio.seed.list",
  SEED_INSTALL_DESCRIPTOR: "passio.seed.installDescriptor", // accepts .seed JSON
  SEED_INSTALL_LOCAL: "passio.seed.installLocal", // accepts an absolute folder path (dev/sideload)
  SEED_ENABLE: "passio.seed.enable",
  SEED_DISABLE: "passio.seed.disable",
  SEED_UNINSTALL: "passio.seed.uninstall",
  SEED_GET_SETTINGS: "passio.seed.getSettings",
  SEED_SET_SETTINGS: "passio.seed.setSettings",
  SEED_INVOKE_TOOL: "passio.seed.invokeTool", // host → seed, executes a registered tool
  SEED_DEV_START: "passio.seed.devStart", // watch a folder, reload on change
  SEED_DEV_STOP: "passio.seed.devStop",
  SEED_LOGS: "passio.seed.logs",
  SEED_PANEL_SRC: "passio.seed.panelSrc", // returns the JS bundle text for a contributed panel
  SEED_HOTKEY_FIRE: "passio.seed.hotkeyFire", // HUD → sidecar: fan out a hotkey press to subscribed seeds
  SEED_HOTKEYS_LIST: "passio.seed.hotkeysList", // Rust/HUD query: enabled seeds' declared hotkeys
  SEED_MAIN_TABS: "passio.seed.mainTabs", // HUD query: enabled seeds' promoteToMainTab panels
  SEED_CHECK_UPDATES: "passio.seed.checkUpdates", // poll remote manifests for newer versions
  ORCHARD_FETCH: "passio.orchard.fetch", // curated seed index
  ORCHARD_SET_URL: "passio.orchard.setUrl", // user can point at a different registry
  DATA_EXPORT: "passio.data.export",
  DATA_IMPORT: "passio.data.import",
  COST_BUDGET_GET: "passio.cost.budget.get",
  COST_BUDGET_SET: "passio.cost.budget.set",
  COST_BUDGET_CHECK: "passio.cost.budget.check",
  NOTIFY_SEED_EVENT: "passio.seed.event", // seed lifecycle updates for the HUD

  // Sidecar → Rust notifications
  NOTIFY_BUBBLE_STATE: "passio.bubbleState",
  NOTIFY_LOG: "passio.log",
  NOTIFY_CHAT_CHUNK: "passio.chat.chunk",
} as const;

export type RpcMethodName = (typeof RpcMethods)[keyof typeof RpcMethods];

// === Bubble state (sidecar → HUD via Rust relay) ===

export const BubbleState = z.object({
  state: z.enum(["idle", "listening", "thinking", "talking", "alert"]),
  message: z.string().optional(),
  badge: z.number().optional(),
});
export type BubbleState = z.infer<typeof BubbleState>;

// === RPC error codes (JSON-RPC reserves -32768 to -32000) ===

export const RpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Passio custom: -32000..-32099
  SIDECAR_NOT_READY: -32000,
  PROVIDER_UNAVAILABLE: -32001,
  TOOL_REJECTED_BY_POLICY: -32002,
  CONTEXT_BUDGET_EXCEEDED: -32003,
} as const;
