import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BubbleState } from "@passio/shared";

/**
 * Thin typed wrapper around Tauri IPC. Keeps commands and events in one
 * place so the rest of the HUD never touches `invoke`/`listen` directly.
 */

export type Hit = {
  kind: "fact" | "note" | "event";
  id: number;
  content: string;
  score: number;
  source: "vec" | "fts" | "both";
};

export async function pingSidecar(): Promise<{
  pong: true;
  sidecarVersion: string;
  uptimeMs: number;
}> {
  return invoke("ping_sidecar");
}

export async function requestScan(reason: "cron" | "manual" | "force"): Promise<unknown> {
  return invoke("request_scan", { reason });
}

export async function shutdownSidecar(): Promise<void> {
  return invoke("shutdown_sidecar");
}

export async function chat(
  prompt: string,
  conversationId?: number,
  goalId?: number,
): Promise<{ conversationId: number; text: string }> {
  return invoke("chat", {
    prompt,
    conversationId: conversationId ?? null,
    goalId: goalId ?? null,
  });
}

export async function todoList(
  filter: "open" | "done" | "all" = "open",
): Promise<{ todos: Array<{ id: number; text: string; done: boolean }> }> {
  return invoke("todo_list", { filter });
}

export async function memorySearch(query: string, limit?: number): Promise<{ hits: Hit[] }> {
  return invoke("memory_search", { query, limit: limit ?? null });
}

export type Milestone = {
  id: number;
  goalId: number;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: "pending" | "in_progress" | "done" | "missed";
  sortOrder: number;
  completedAt: string | null;
};

export type Goal = {
  id: number;
  createdAt: string;
  title: string;
  description: string | null;
  category: string | null;
  targetDate: string | null;
  status: "active" | "paused" | "achieved" | "abandoned";
  priority: number;
  progress: number;
  motivation: string | null;
  lastReviewed: string | null;
  milestones: Milestone[];
};

export async function goalList(
  status: "active" | "paused" | "achieved" | "abandoned" | "all" = "active",
): Promise<{ goals: Goal[] }> {
  return invoke("goal_list", { status });
}

export async function goalCreate(input: {
  title: string;
  category?: string;
  target_date: string;
  motivation?: string;
  description?: string;
}): Promise<{ id: number }> {
  return invoke("goal_create", { payload: input });
}

export async function milestoneDone(id: number): Promise<{ ok: true; progress: number }> {
  return invoke("milestone_done", { id });
}

export const goalExtrasApi = {
  delete: (id: number) =>
    sidecarCall<{ ok: true }>("passio.goal.delete", { id }),
  conversations: (goalId: number) =>
    sidecarCall<{
      conversations: Array<{
        id: number;
        startedAt: string;
        firstMessage: string | null;
        messageCount: number;
      }>;
    }>("passio.goal.conversations", { goalId }),
  milestoneToTodos: (milestoneId: number) =>
    sidecarCall<{ added: number; todoIds: number[] }>("passio.milestone.toTodos", {
      milestone_id: milestoneId,
    }),
};

export type BridgeStatus = {
  port: number;
  token: string;
  pairingFile: string;
  connected: boolean;
  clients: number;
};

export async function bridgeStatus(): Promise<BridgeStatus> {
  return invoke("bridge_status");
}

export async function summarizePage(
  style: "bullet" | "tldr" | "detailed" = "bullet",
): Promise<{ url: string; title: string; summary: string }> {
  return invoke("summarize_page", { style });
}

export type Pack = "work" | "study" | "chill" | "custom";
export type ProactiveMode = "check-in" | "active-assist" | "summary-decide";
export type FocusState = {
  active: boolean;
  remainingSeconds: number;
  durationMin: number;
  startedAt: string | null;
};

export const focusApi = {
  state: () => invoke<FocusState>("focus_state"),
  start: (duration_min = 25) => invoke<FocusState>("focus_start", { durationMin: duration_min }),
  stop: () => invoke<FocusState>("focus_stop"),
};
export const packApi = {
  get: () => invoke<{ pack: Pack }>("pack_get"),
  set: (pack: Pack) => invoke<{ ok: true; pack: Pack }>("pack_set", { pack }),
  cycle: () => invoke<{ pack: Pack }>("pack_cycle"),
};
export const dndApi = {
  get: () => invoke<{ until: string | null }>("dnd_get"),
  toggle: () => invoke<{ until: string | null }>("dnd_toggle"),
  set: (minutes: number | null) => invoke<{ until: string | null }>("dnd_set", { minutes }),
};
export const proactiveApi = {
  get: () => invoke<{ mode: ProactiveMode; interval_min: number }>("proactive_get"),
  set: (input: { mode?: ProactiveMode; interval_min?: number }) =>
    invoke<{ ok: true; mode: ProactiveMode; interval_min: number }>("proactive_set", input),
};
export const briefingApi = {
  morning: () => invoke<{ briefing: string }>("morning_briefing"),
  recap: () => invoke<{ dateStr: string; recap: string }>("daily_recap"),
};

export type ScanResult = {
  decision: "quiet" | "nudge" | "act";
  reason: string;
  message?: string;
  proposed_tool?: string;
};
export function onScanResult(cb: (r: ScanResult) => void): Promise<UnlistenFn> {
  return listen<ScanResult>("passio://scan-result", (e) => cb(e.payload));
}

export type ChatChunk = {
  conversationId: number;
  delta: string;
  done: boolean;
};
export function onChatChunk(cb: (c: ChatChunk) => void): Promise<UnlistenFn> {
  return listen<ChatChunk>("passio://chat-chunk", (e) => cb(e.payload));
}

export type SelectionResult = { kind: "rewrite" | "translate"; ok: boolean; text?: string; error?: string };
export function onSelectionResult(cb: (r: SelectionResult) => void): Promise<UnlistenFn> {
  return listen<SelectionResult>("passio://selection-result", (e) => cb(e.payload));
}

export type Persona = {
  name: string;
  pronouns: string;
  voice: "alloy" | "echo" | "fable" | "nova" | "onyx" | "shimmer";
};
export const personaApi = {
  get: (): Promise<Persona> => invoke<Persona>("persona_get"),
  set: (patch: Partial<Persona>): Promise<Persona> => invoke<Persona>("persona_set", { patch }),
};

export type Keybinds = Record<string, string>;
export const keybindsApi = {
  get: (): Promise<Keybinds> => invoke<Keybinds>("keybinds_get"),
  set: (patch: Keybinds): Promise<Keybinds> => invoke<Keybinds>("keybinds_set", { patch }),
};

export const keychainApi = {
  set: (key: string, value: string) => invoke<void>("keychain_set", { key, value }),
  has: (key: string) => invoke<boolean>("keychain_has", { key }),
  delete: (key: string) => invoke<void>("keychain_delete", { key }),
};

export type PersonaNode = {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  prompt: string;
  voice?: string;
  posture?: "quiet" | "active" | "proactive";
  children?: PersonaNode[];
};

export const personaTreeApi = {
  get: () => sidecarCall<{ tree: PersonaNode[] }>("passio.persona.tree"),
  applyPath: (path: string[]) =>
    sidecarCall<{ ok: true; prompt: string; voice: string; posture: string }>(
      "passio.persona.applyPath",
      { path },
    ),
};

export const firstRunApi = {
  get: () => sidecarCall<{ done: boolean }>("passio.firstRun.get"),
  mark: () => sidecarCall<{ ok: true }>("passio.firstRun.mark"),
};

// --- v2 settings surfaces (sidecar-backed) ---

type SidecarCallArgs = { method: string; params?: unknown };
async function sidecarCall<T>(method: string, params?: unknown): Promise<T> {
  return invoke<T>("sidecar_passthrough", { method, params: params ?? {} } satisfies SidecarCallArgs);
}

export const calendarApi = {
  listSources: () => sidecarCall<{ sources: string[] }>("passio.calendar.list"),
  setSources: (sources: string[]) =>
    sidecarCall<{ ok: true }>("passio.calendar.setSources", { sources }),
  upcoming: (limit = 5, days = 7) =>
    sidecarCall<{ events: Array<{ summary: string; start: string; end?: string; location?: string; source: string }> }>(
      "passio.calendar.upcoming",
      { limit, days },
    ),
};

export const rssApi = {
  getFeeds: () => sidecarCall<{ feeds: string[] }>("passio.rss.list"),
  setFeeds: (feeds: string[]) => sidecarCall<{ ok: true }>("passio.rss.setFeeds", { feeds }),
  latest: (hours = 24, limit = 15) =>
    sidecarCall<{ items: Array<{ title: string; url: string; feed: string; published: string | null }> }>(
      "passio.rss.latest",
      { hours, limit },
    ),
};

export const weatherApi = {
  get: () =>
    sidecarCall<{
      location: string;
      temp_c: number;
      temp_high_c: number;
      temp_low_c: number;
      description: string;
    } | null>("passio.weather.now"),
  setLocation: (location: { lat: number; lon: number; name: string } | null) =>
    sidecarCall<{ ok: true }>("passio.weather.setLocation", { location }),
};

export const policyApi = {
  get: () =>
    sidecarCall<{
      domains: Record<string, "observe_only" | "ask_first" | "full_auto">;
      countdownSeconds: number;
      blocklist: Array<{ kind: "selector" | "url_contains"; pattern: string; reason: string }>;
    }>("passio.policy.get"),
  setHost: (host: string, policy: "observe_only" | "ask_first" | "full_auto") =>
    sidecarCall<{ ok: true }>("passio.policy.set", { host, policy }),
  deleteHost: (host: string) => sidecarCall<{ ok: true }>("passio.policy.delete", { host }),
  setCountdown: (seconds: number) =>
    sidecarCall<{ ok: true }>("passio.policy.setCountdown", { seconds }),
  setBlocklist: (entries: Array<{ kind: string; pattern: string; reason: string }>) =>
    sidecarCall<{ ok: true }>("passio.blocklist.set", { entries }),
};

export type ChatSearchHit = {
  id: number;
  conversationId: number | null;
  role: string;
  ts: string;
  snippet: string;
  score: number;
};
export type ConversationSummary = {
  id: number;
  startedAt: string;
  mode: string | null;
  messages: number;
  firstMessage: string | null;
};
export type ConversationDetail = {
  id: number;
  startedAt: string;
  messages: Array<{ id: number; ts: string; role: string; content: string }>;
};

export const chatHistoryApi = {
  search: (query: string, limit = 20) =>
    sidecarCall<{ hits: ChatSearchHit[] }>("passio.chat.search", { query, limit }),
  list: (limit = 20) =>
    sidecarCall<{ conversations: ConversationSummary[] }>("passio.chat.listConversations", {
      limit,
    }),
  get: (id: number) =>
    sidecarCall<ConversationDetail | null>("passio.chat.getConversation", { id }),
};

export const pdfApi = {
  ingest: (path: string, title?: string, tags?: string) =>
    sidecarCall<{ noteId: number; pages_guess: number; chars: number }>("passio.pdf.ingest", {
      path,
      title,
      tags,
    }),
};

export const automationPrefsApi = {
  get: () => sidecarCall<{ scannerAlwaysGate: boolean }>("passio.automation.get"),
  set: (patch: { scannerAlwaysGate?: boolean }) =>
    sidecarCall<{ scannerAlwaysGate: boolean }>("passio.automation.set", patch),
};

export const voiceApi = {
  transcribe: (input: { audio_base64: string; mime_type?: string; language?: string }) =>
    invoke<{ text: string }>("voice_transcribe", {
      audioBase64: input.audio_base64,
      mimeType: input.mime_type ?? null,
      language: input.language ?? null,
    }),
  synthesize: (input: { text: string; voice?: string }) =>
    invoke<{ mime_type: string; audio_base64: string }>("voice_synthesize", {
      text: input.text,
      voice: input.voice ?? null,
    }),
};

export function onBubbleState(cb: (state: BubbleState) => void): Promise<UnlistenFn> {
  return listen<BubbleState>("passio://bubble-state", (e) => cb(e.payload));
}

export function onSidecarLog(
  cb: (log: { level: string; message: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ level: string; message: string }>("passio://sidecar-log", (e) =>
    cb(e.payload),
  );
}

export function onHotkey(cb: (name: string) => void): Promise<UnlistenFn> {
  return listen<string>("passio://hotkey", (e) => cb(e.payload));
}

// --- v2.2 APIs: cost, reflection, memory browse, spotlight, undo, todo extras ---

export const costApi = {
  summary: () =>
    sidecarCall<{
      today: { total: number; rows: Array<{ tier: string; calls: number; inTokens: number; outTokens: number; dollars: number }> };
      week: { total: number; rows: Array<{ tier: string; calls: number; inTokens: number; outTokens: number; dollars: number }> };
      month: { total: number; rows: Array<{ tier: string; calls: number; inTokens: number; outTokens: number; dollars: number }> };
    }>("passio.cost.summary"),
  getBudget: () => sidecarCall<{ daily?: number; monthly?: number }>("passio.cost.budget.get"),
  setBudget: (input: { daily?: number; monthly?: number }) =>
    sidecarCall<{ ok: true }>("passio.cost.budget.set", input),
  checkBudget: () => sidecarCall<{ alert: string | null }>("passio.cost.budget.check"),
};

export const dataApi = {
  export: (destPath: string) =>
    sidecarCall<{ path: string; bytes: number }>("passio.data.export", { destPath }),
  import: (sourcePath: string, wipe = true) =>
    sidecarCall<{ restored: string[]; warning?: string }>("passio.data.import", { sourcePath, wipe }),
};

export const seedUpdatesApi = {
  check: () =>
    sidecarCall<{
      updates: Array<{ name: string; installed: string; available: string; source: unknown }>;
    }>("passio.seed.checkUpdates"),
};

export type OrchardEntry = {
  name: string;
  version: string;
  description: string;
  author: string;
  authorUrl?: string;
  homepage?: string;
  tags: string[];
  category: string;
  priceCents: number;
  currency: string;
  checkoutUrl?: string;
  licenseRequired: boolean;
  featured: boolean;
  source: unknown;
  sha256?: string;
};

export const orchardApi = {
  fetch: () =>
    sidecarCall<{
      index: { $schema: string; updated: string; seeds: OrchardEntry[] };
      url: string;
    }>("passio.orchard.fetch"),
  setUrl: (url: string) => sidecarCall<{ ok: true }>("passio.orchard.setUrl", { url }),
};

export const reflectionApi = {
  runNow: () => sidecarCall<{ proposed: number }>("passio.reflection.run"),
  pending: () =>
    sidecarCall<{
      proposals: Array<{
        id: number;
        ts: string;
        kind: "add_fact" | "update_fact" | "forget_fact";
        subject: string | null;
        content: string;
        reasoning: string;
        status: "pending" | "approved" | "rejected";
        targetFactId: number | null;
      }>;
    }>("passio.reflection.pending"),
  resolve: (input: { id: number; approve: boolean }) =>
    sidecarCall<{ ok: true }>("passio.reflection.resolve", input),
};

export const memoryApi = {
  browse: (input: { query?: string; kind?: "all" | "fact" | "note" | "entity"; limit?: number }) =>
    sidecarCall<{
      rows: Array<{
        kind: "fact" | "note" | "entity";
        id: number;
        ts: string;
        title: string | null;
        content: string;
        source: string | null;
        subject: string | null;
        confidence: number | null;
      }>;
    }>("passio.memory.browse", input),
  update: (input: { kind: string; id: number; content: string }) =>
    sidecarCall<{ ok: true }>("passio.memory.update", input),
  delete: (input: { kind: string; id: number }) =>
    sidecarCall<{ ok: true }>("passio.memory.delete", input),
};

export const spotlightApi = {
  search: (query: string) =>
    sidecarCall<{
      hits: Array<{
        kind: "todo" | "fact" | "note" | "goal" | "conversation" | "file" | "vault";
        id: number;
        title: string;
        snippet: string;
        score: number;
      }>;
    }>("passio.spotlight.search", { query }),
};

export const auditApi = {
  list: (limit = 30) =>
    sidecarCall<{
      actions: Array<{
        id: number;
        ts: string;
        tool: string;
        params: unknown;
        undo: { tool: string; params: unknown } | null;
        undone: boolean;
      }>;
    }>("passio.audit.list", { limit }),
  undo: (id: number) =>
    sidecarCall<{ ok: boolean; reason?: string }>("passio.audit.undo", { id }),
};

export const visionApi = {
  ask: (question?: string) =>
    sidecarCall<{ answer: string; path: string | null }>("passio.vision.ask", { question }),
};

export const whatNextApi = {
  pick: () =>
    sidecarCall<{ action: string; why: string; todoId: number | null }>("passio.whatNext"),
};

export const todoApi = {
  list: (filter: "open" | "done" | "all" = "open") =>
    sidecarCall<{
      todos: Array<{
        id: number;
        text: string;
        done: boolean;
        priority: number;
        dueAt: string | null;
        project: string | null;
        goalId: number | null;
      }>;
    }>("passio.todo.list", { filter }),
  add: (input: { text: string; priority?: number; due_at?: string; project?: string }) =>
    sidecarCall<{ id: number }>("passio.todo.add", input),
  done: (id: number) => sidecarCall<{ ok: true }>("passio.todo.done", { id }),
  delete: (id: number) => sidecarCall<{ ok: true }>("passio.todo.delete", { id }),
  update: (input: { id: number; text?: string; priority?: number; due_at?: string | null; project?: string | null }) =>
    sidecarCall<{ ok: true }>("passio.todo.update", input),
};

export const mailApi = {
  unread: (limit = 5) =>
    sidecarCall<{
      emails: Array<{ id?: string; from: string; subject: string; date?: string }>;
    }>("passio.mail.unread", { limit }),
};

// --- Auto retrigger loop ---

export type AutoLoopRow = {
  id: number;
  task: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  stepCount: number;
  replanCount: number;
  costUsd: number;
  maxCostUsd: number;
  lastMessage: string | null;
};

export type AutoLoopEvent = {
  id: number;
  ts: string;
  kind: string;
  title: string | null;
  content: string | null;
};

export const autoLoopApi = {
  start: (input: { task: string; maxSteps?: number; maxCostUsd?: number; goalId?: number }) =>
    sidecarCall<{ id: number }>("passio.autoLoop.start", input),
  cancel: (id: number) => sidecarCall<{ ok: boolean }>("passio.autoLoop.cancel", { id }),
  resume: (input: { id: number; maxSteps?: number; maxCostUsd?: number }) =>
    sidecarCall<{ id: number }>("passio.autoLoop.resume", input),
  list: (input: { limit?: number; status?: string } = {}) =>
    sidecarCall<{ loops: AutoLoopRow[] }>("passio.autoLoop.list", input),
  events: (id: number) => sidecarCall<{ events: AutoLoopEvent[] }>("passio.autoLoop.events", { id }),
};

export function onAutoLoopUpdate(
  cb: (update: { id: number; status: string; message: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ id: number; status: string; message: string }>(
    "passio://autoloop-update",
    (e) => cb(e.payload),
  );
}

// --- Vault (Obsidian) ---

// --- Seeds (plugin system) ---

export type SeedListRow = {
  name: string;
  version: string;
  enabled: boolean;
  description: string;
  author: string | null;
  permissions: {
    network?: string[];
    secrets?: string[];
    trusted?: boolean;
    shell?: boolean;
  };
  contributes: {
    tools?: string[];
    tabs?: Array<{ id: string; title: string; icon?: string; panel: string }>;
    widgets?: Array<{ id: string; slot: "header" | "corner"; panel: string }>;
    hotkeys?: Array<{ id: string; default: string; label?: string }>;
    scheduler?: Array<{ id: string; every_seconds: number }>;
    events?: Array<"chat" | "scan" | "activity" | "bubble_state" | "hotkey">;
  };
  source: unknown;
  installedAt: string;
};

export const seedsHotkeyBridge = {
  /** Returns enabled seeds' declared hotkeys from the sidecar. */
  list: () =>
    sidecarCall<{
      hotkeys: Array<{ seed: string; id: string; default: string; label?: string }>;
    }>("passio.seed.hotkeysList"),
  /** Instructs the sidecar to fan-out a hotkey press to subscribed seeds. */
  fire: (name: string) => sidecarCall<{ ok: true }>("passio.seed.hotkeyFire", { name }),
  /** Registers Rust global shortcuts for the current enabled-seed hotkey set. */
  reconcile: async () => {
    const r = await seedsHotkeyBridge.list();
    const list = r.hotkeys.map((h) => [`seed:${h.seed}:${h.id}`, h.default] as [string, string]);
    return invoke<void>("register_seed_hotkeys", { list });
  },
};

export const seedsApi = {
  list: () => sidecarCall<{ seeds: SeedListRow[] }>("passio.seed.list"),
  installDescriptor: (desc: unknown) =>
    sidecarCall<{ name: string; version: string }>("passio.seed.installDescriptor", desc),
  installLocal: (path: string) =>
    sidecarCall<{ name: string; version: string }>("passio.seed.installLocal", { path }),
  enable: (name: string) => sidecarCall<{ ok: boolean; reason?: string }>("passio.seed.enable", { name }),
  disable: (name: string) => sidecarCall<{ ok: boolean }>("passio.seed.disable", { name }),
  uninstall: (name: string) => sidecarCall<{ ok: true }>("passio.seed.uninstall", { name }),
  getSettings: (name: string) =>
    sidecarCall<{ settings: Record<string, unknown> }>("passio.seed.getSettings", { name }),
  setSettings: (name: string, settings: Record<string, unknown>) =>
    sidecarCall<{ ok: true }>("passio.seed.setSettings", { name, settings }),
  invokeTool: (seed: string, tool: string, args: unknown) =>
    sidecarCall<unknown>("passio.seed.invokeTool", { seed, tool, args }),
  devStart: (path: string) =>
    sidecarCall<{ ok: true; name: string }>("passio.seed.devStart", { path }),
  devStop: () => sidecarCall<{ ok: true }>("passio.seed.devStop"),
  logs: (name: string) =>
    sidecarCall<{ logs: Array<{ ts: number; level: string; message: string }> }>("passio.seed.logs", { name }),
  panelSrc: (seed: string, panel: string) =>
    sidecarCall<{ src: string }>("passio.seed.panelSrc", { seed, panel }),
};

export function onSeedEvent(
  cb: (e: { name: string; kind: string; [key: string]: unknown }) => void,
): Promise<UnlistenFn> {
  return listen<{ name: string; kind: string }>("passio://seed-event", (e) => cb(e.payload as { name: string; kind: string }));
}

export const vaultApi = {
  getRoot: () => sidecarCall<{ path: string | null }>("passio.vault.getRoot"),
  setRoot: (path: string | null) => sidecarCall<{ ok: true }>("passio.vault.setRoot", { path }),
  status: () =>
    sidecarCall<{
      root: string | null;
      watcherActive: boolean;
      notesIndexed: number;
      dailyNoteTemplate: string;
      todoMdPath: string;
    }>("passio.vault.status"),
  getDailyTemplate: () =>
    sidecarCall<{ template: string }>("passio.vault.dailyNotePathGet"),
  setDailyTemplate: (template: string) =>
    sidecarCall<{ ok: true }>("passio.vault.dailyNotePathSet", { template }),
  index: (limit?: number) =>
    sidecarCall<{ indexed: number; total_md: number }>("passio.vault.index", { limit }),
  search: (query: string, limit = 20) =>
    sidecarCall<{
      hits: Array<{ path: string; title: string | null; snippet: string; score: number }>;
    }>("passio.vault.search", { query, limit }),
  read: (path: string) =>
    sidecarCall<{ path: string; title: string | null; body: string } | null>(
      "passio.vault.read",
      { path },
    ),
  write: (input: {
    path: string;
    body: string;
    frontmatter?: Record<string, unknown>;
    allow_outside_passio_subfolder?: boolean;
  }) => sidecarCall<{ path: string }>("passio.vault.write", input),
  listTags: () => sidecarCall<{ tags: Array<{ tag: string; count: number }> }>("passio.vault.listTags"),
  dailyRecap: (body: string, date?: string) =>
    sidecarCall<{ path: string }>("passio.vault.dailyRecap", { body, date }),
};
