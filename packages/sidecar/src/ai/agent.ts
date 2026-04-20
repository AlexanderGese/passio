import { createOpenAI } from "@ai-sdk/openai";
import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";
import type { BridgeServer } from "../bridge/server.js";
import type { RpcBus } from "../rpc.js";
import * as browser from "../tools/browser.js";
import { explainSelection, savePage, summarizePage } from "../tools/browser_compound.js";
import { getPersona } from "../tools/persona.js";
import { activityStats } from "../tools/system.js";
import { conversations, messages } from "../db/schema.js";
import { retrieve } from "../context/retrieve.js";
import {
  goalCreate,
  goalDecompose,
  goalList,
  goalReview,
  goalUpdate,
  milestoneAdd,
  milestoneDone,
  milestoneReschedule,
} from "../tools/goals.js";
import {
  memoryForget,
  memoryRemember,
  memorySearch,
  noteSave,
  noteSearch,
  todoAdd,
  todoDone,
  todoList,
  setIntent,
} from "../tools/memory.js";
import {
  dailyNoteAppendRecap,
  vaultListTags,
  vaultReadNote,
  vaultSearch,
  vaultWriteNote,
} from "../vault/tools.js";

/**
 * v1 agent loop. Single-shot `generateText` with a small tool set. Streaming
 * chat UI arrives in week 5/6 when the bubble has a proper chat panel.
 */

type Emitter = (method: string, params: unknown) => void;

const BASE_SYSTEM_PROMPT = `You are {NAME}, a local, passionfruit-shaped desktop AI assistant.

Style: terse, warm, direct. You know the user well through retrieved memory.
Your output is shown in a small floating bubble, so keep replies short (1–4 sentences)
unless the user explicitly asks for detail.

Tool-use policy:
  • If the user shares a lasting fact/preference/identity/context, call memory_remember.
  • For "what do you remember about X?", "what do I like?", "do I have notes on Y?" — call memory_search.
  • For todo actions, use todo_add / todo_list / todo_done.
  • For ad-hoc notes, use note_save / note_search.
  • For daily focus, use set_intent.
  • For ambitious goals with a deadline ("I want to get into MIT by 2027", "learn Japanese in 18 months"), call goal_create — it auto-breaks into milestones.
  • For "what am I working on?" / "how's my marathon plan?" — goal_list.
  • For weekly check-ins / reviews — goal_review.
  • If a vault is configured, prefer vault_search over memory_search for anything that looks like user-authored notes, and use vault_write when the user asks you to save something as a markdown note.
  • Never invent facts about the user — either recall via tools or admit you don't know.`;

function openai() {
  const key = process.env.PASSIO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return createOpenAI({ apiKey: key });
}

function modelName(): string {
  return process.env.PASSIO_MODEL_STANDARD || "gpt-4.1";
}

function tierFor(model: string): "economy" | "standard" | "power" | "reasoning" {
  if (/o3|o1/.test(model)) return "reasoning";
  if (/gpt-5|opus/.test(model)) return "power";
  if (/mini|haiku|nano/.test(model)) return "economy";
  return "standard";
}

export async function chat(
  db: Db,
  emit: Emitter,
  input: { prompt: string; conversationId?: number; goalId?: number },
  bridge?: BridgeServer,
  bus?: RpcBus,
): Promise<{ conversationId: number; text: string }> {
  // Ensure a conversation id
  let convId = input.conversationId;
  if (!convId) {
    const [conv] = await db
      .insert(conversations)
      .values({ mode: "text", goalId: input.goalId ?? null })
      .returning({ id: conversations.id });
    if (!conv) throw new Error("failed to start conversation");
    convId = conv.id;
  }

  await db.insert(messages).values({
    conversationId: convId,
    role: "user",
    content: input.prompt,
  });

  const hits = await retrieve(db, input.prompt, 8);
  const contextBlock = hits.length
    ? "Retrieved context:\n" +
      hits
        .map((h) => `  - (${h.kind}#${h.id}) ${h.content}`)
        .join("\n")
    : "Retrieved context: (none yet — this is a cold memory)";

  // If scoped to a goal, inject its milestones + open todos into the
  // system prompt so the agent is naturally focused on that goal.
  let goalBlock = "";
  if (input.goalId) {
    const g = db.$raw
      .query("SELECT title, category, target_date, progress, motivation FROM goals WHERE id = ?")
      .get(input.goalId) as
      | { title: string; category: string | null; target_date: string | null; progress: number; motivation: string | null }
      | undefined;
    if (g) {
      const ms = db.$raw
        .query(
          "SELECT title, due_date, status FROM milestones WHERE goal_id = ? ORDER BY sort_order, due_date",
        )
        .all(input.goalId) as { title: string; due_date: string | null; status: string }[];
      const openTodos = db.$raw
        .query(
          "SELECT text, due_at, priority FROM todos WHERE goal_id = ? AND done = 0 ORDER BY priority DESC, due_at ASC LIMIT 10",
        )
        .all(input.goalId) as { text: string; due_at: string | null; priority: number }[];
      goalBlock = [
        `\nThis conversation is scoped to ONE goal — stay focused on it:`,
        `Goal: ${g.title}${g.category ? ` [${g.category}]` : ""}${g.target_date ? ` · target ${g.target_date}` : ""} · ${Math.round((g.progress ?? 0) * 100)}% done`,
        g.motivation ? `Why: ${g.motivation}` : "",
        ms.length ? `Milestones:\n${ms.map((m) => `  ${m.status === "done" ? "✓" : "·"} ${m.title}${m.due_date ? ` (due ${m.due_date})` : ""}`).join("\n")}` : "",
        openTodos.length ? `Open todos for this goal:\n${openTodos.map((t) => `  [p${t.priority}] ${t.text}${t.due_at ? ` · ${t.due_at}` : ""}`).join("\n")}` : "",
      ]
        .filter((s) => s !== "")
        .join("\n");
    }
  }

  const tools = buildTools(db, bridge, bus);
  const persona = getPersona(db);

  // Ambient activity snapshot — lets Passio reference what the user is
  // doing right now without them having to say it.
  const act = activityStats(db);
  const activityBlock = act.currentApp
    ? `\n\nAmbient context (do not mention unless relevant):` +
      `\n  Active: ${act.currentApp}${act.currentTitle ? ` — ${act.currentTitle}` : ""}` +
      (act.streakDistractionMin > 10
        ? `\n  ⚠ On distracting app for ${act.streakDistractionMin}min.`
        : "")
    : "";

  // Pull any persona prompt extras — tree-picker's composed prompt AND the
  // user's free-form override. Both concatenate onto the base system prompt.
  let personaExtra = "";
  try {
    const treeRow = db.$raw
      .query("SELECT value FROM settings WHERE key = 'persona_prompt_extra'")
      .get() as { value: string } | undefined;
    if (treeRow) {
      const parsed = JSON.parse(treeRow.value) as { prompt?: string };
      if (parsed.prompt) personaExtra += `\n\nVoice / stance: ${parsed.prompt}`;
    }
    const customRow = db.$raw
      .query("SELECT value FROM settings WHERE key = 'persona_prompt_extra_custom'")
      .get() as { value: string } | undefined;
    if (customRow && customRow.value.trim()) {
      personaExtra += `\n\nUser-defined rules:\n${customRow.value.trim()}`;
    }
  } catch {
    /* best-effort */
  }

  const sysPrompt =
    BASE_SYSTEM_PROMPT.replaceAll("{NAME}", persona.name) + personaExtra + goalBlock + activityBlock;

  let full = "";
  try {
    // streamText lets us forward tokens as they arrive so the HUD can
    // render incrementally. We still collect the full text for DB insertion.
    const stream = streamText({
      model: openai()(modelName()),
      system: `${sysPrompt}\n\n${contextBlock}`,
      prompt: input.prompt,
      tools,
      stopWhen: stepCountIs(6),
    });

    for await (const delta of stream.textStream) {
      full += delta;
      emit("passio.chat.chunk", { conversationId: convId, delta, done: false });
    }

    // Make sure the stream promise resolved (surfaces errors stored on the
    // stream object that wouldn't throw during iteration).
    await stream.text;

    // Cost tracking — log total tokens once the stream settles.
    try {
      const usage = await stream.usage;
      const { logUsage } = await import("../tools/cost.js");
      logUsage(db, {
        tier: tierFor(modelName()),
        model: modelName(),
        inTokens: usage?.inputTokens ?? 0,
        outTokens: usage?.outputTokens ?? 0,
      });
    } catch {
      /* usage not critical */
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    full = full ? `${full}\n\n⚠ ${reason}` : `⚠ ${reason}`;
    emit("passio.chat.chunk", {
      conversationId: convId,
      delta: full.endsWith(reason) ? `\n\n⚠ ${reason}` : `⚠ ${reason}`,
      done: false,
    });
  }

  await db.insert(messages).values({
    conversationId: convId,
    role: "assistant",
    content: full,
  });

  emit("passio.chat.chunk", {
    conversationId: convId,
    delta: "",
    done: true,
  });

  return { conversationId: convId, text: full };
}

function buildTools(db: Db, bridge?: BridgeServer, bus?: RpcBus) {
  const browserTools = bridge ? buildBrowserTools(db, bridge, bus) : {};
  return {
    ...browserTools,
    memory_remember: tool({
      description:
        "Persist a lasting fact about the user (preference, identity, context, relationship, skill).",
      inputSchema: z.object({
        kind: z
          .enum(["preference", "identity", "context", "relationship", "skill"])
          .default("context"),
        subject: z.string().optional(),
        content: z.string().min(1),
      }),
      execute: async (args) => memoryRemember(db, { ...args, source: "user_told" }),
    }),
    memory_forget: tool({
      description: "Remove a fact by id (hard delete).",
      inputSchema: z.object({ id: z.number().int() }),
      execute: async (args) => memoryForget(db, args),
    }),
    memory_search: tool({
      description:
        "Search user memory (facts + notes + events) via hybrid FTS + vector retrieval.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async (args) => memorySearch(db, args),
    }),
    todo_add: tool({
      description: "Add a todo item. due_at is ISO-8601 or null.",
      inputSchema: z.object({
        text: z.string().min(1),
        due_at: z.string().nullable().optional(),
        priority: z.number().int().min(0).max(3).default(0),
        project: z.string().nullable().optional(),
      }),
      execute: async (args) =>
        todoAdd(db, {
          text: args.text,
          due_at: args.due_at ?? undefined,
          priority: args.priority,
          project: args.project ?? undefined,
        }),
    }),
    todo_list: tool({
      description: "List todos. filter: 'open' | 'done' | 'all'.",
      inputSchema: z.object({
        filter: z.enum(["open", "done", "all"]).default("open"),
      }),
      execute: async (args) => todoList(db, args),
    }),
    todo_done: tool({
      description: "Mark a todo done by id.",
      inputSchema: z.object({ id: z.number().int() }),
      execute: async (args) => todoDone(db, args),
    }),
    note_save: tool({
      description: "Save a note. Body is required; title/tags optional.",
      inputSchema: z.object({
        title: z.string().nullable().optional(),
        body: z.string().min(1),
        tags: z.string().nullable().optional(),
      }),
      execute: async (args) =>
        noteSave(db, {
          title: args.title ?? undefined,
          body: args.body,
          tags: args.tags ?? undefined,
        }),
    }),
    note_search: tool({
      description: "Search notes by query.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async (args) => noteSearch(db, args),
    }),
    set_intent: tool({
      description: "Set today's focus intent; pass null to clear.",
      inputSchema: z.object({ text: z.string().nullable() }),
      execute: async (args) => setIntent(db, args),
    }),

    // --- Goals ---
    goal_create: tool({
      description:
        "Create an ambitious long-horizon goal and auto-decompose it into milestones with reverse-engineered due dates.",
      inputSchema: z.object({
        title: z.string().min(3),
        description: z.string().optional(),
        category: z
          .enum([
            "education",
            "career",
            "health",
            "creative",
            "language",
            "financial",
            "entrepreneurship",
            "personal",
          ])
          .optional(),
        target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        motivation: z.string().optional(),
      }),
      execute: async (args) => goalCreate(db, args),
    }),
    goal_list: tool({
      description: "List the user's goals, with milestones inline.",
      inputSchema: z.object({
        status: z.enum(["active", "paused", "achieved", "abandoned", "all"]).default("active"),
      }),
      execute: async (args) => goalList(db, args),
    }),
    goal_update: tool({
      description:
        "Update a goal's fields (title, description, status, priority, target_date, etc).",
      inputSchema: z.object({
        id: z.number().int(),
        fields: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          category: z.string().optional(),
          targetDate: z.string().optional(),
          status: z.enum(["active", "paused", "achieved", "abandoned"]).optional(),
          priority: z.number().int().optional(),
          motivation: z.string().optional(),
        }),
      }),
      execute: async (args) => goalUpdate(db, args),
    }),
    goal_decompose: tool({
      description: "Re-decompose an existing goal into milestones via the power model.",
      inputSchema: z.object({
        id: z.number().int(),
        replace: z.boolean().default(false),
      }),
      execute: async (args) => goalDecompose(db, args),
    }),
    goal_review: tool({
      description: "Generate a weekly / monthly / ad-hoc review of a goal (writes to goal_reviews).",
      inputSchema: z.object({
        id: z.number().int(),
        kind: z.enum(["weekly", "monthly", "ad-hoc", "deadline-approaching"]).default("ad-hoc"),
      }),
      execute: async (args) => goalReview(db, args),
    }),
    milestone_add: tool({
      description: "Add a milestone to an existing goal.",
      inputSchema: z.object({
        goal_id: z.number().int(),
        title: z.string(),
        description: z.string().optional(),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      execute: async (args) => milestoneAdd(db, args),
    }),
    milestone_done: tool({
      description: "Mark a milestone done; auto-recomputes goal progress.",
      inputSchema: z.object({ id: z.number().int() }),
      execute: async (args) => milestoneDone(db, args),
    }),
    milestone_reschedule: tool({
      description: "Shift a milestone's due_date.",
      inputSchema: z.object({
        id: z.number().int(),
        new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      execute: async (args) => milestoneReschedule(db, args),
    }),

    // --- Obsidian vault ---
    vault_search: tool({
      description: "Full-text search across the user's Obsidian vault.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async (args) => vaultSearch(db, args),
    }),
    vault_read_note: tool({
      description: "Read a vault note by vault-relative path.",
      inputSchema: z.object({ path: z.string() }),
      execute: async (args) => vaultReadNote(db, args),
    }),
    vault_write_note: tool({
      description:
        "Write a markdown note into the vault. Defaults to the `passio/` subfolder; outside that requires explicit user consent via allow_outside_passio_subfolder.",
      inputSchema: z.object({
        path: z.string(),
        body: z.string(),
        frontmatter: z.record(z.unknown()).optional(),
        allow_outside_passio_subfolder: z.boolean().default(false),
      }),
      execute: async (args) => vaultWriteNote(db, args),
    }),
    vault_list_tags: tool({
      description: "List all tags across the user's vault with counts.",
      inputSchema: z.object({}),
      execute: async () => vaultListTags(db),
    }),
    daily_note_append_recap: tool({
      description:
        "Append or replace a `## Passio recap` section in today's daily note (or a given date's).",
      inputSchema: z.object({
        body: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      execute: async (args) => dailyNoteAppendRecap(db, args),
    }),
    ...buildSeedTools(),
  };
}

/**
 * Dynamically expose tools registered by running Seeds as agent tools.
 * Each seed's `tools.register({name})` becomes `seed_<seed>_<name>` in the
 * agent's tool list. Input/output are untyped — we trust the seed to
 * validate and return JSON-serializable results.
 */
function buildSeedTools(): Record<string, ReturnType<typeof tool>> {
  const out: Record<string, ReturnType<typeof tool>> = {};
  try {
    // Import lazily so we don't pull runtime state at module-load.
    const { registeredTools, invokeToolOnSeed } = require("../seeds/runtime.js") as typeof import("../seeds/runtime.js");
    for (const t of registeredTools()) {
      const toolName = `seed_${t.seed}_${t.name}`.replace(/-/g, "_");
      out[toolName] = tool({
        description: t.description
          ? `[Seed ${t.seed}] ${t.description}`
          : `Tool '${t.name}' from seed '${t.seed}'.`,
        // OpenAI's Responses API rejects tool schemas without a `properties`
        // field. `z.record` produces `{type:"object", additionalProperties}`
        // with no properties → 400. `z.object({}).passthrough()` emits
        // `{type:"object", properties:{}}` which is accepted.
        inputSchema: z.object({}).passthrough(),
        execute: async (args: unknown) => invokeToolOnSeed(t.seed, t.name, args),
      });
    }
  } catch {
    /* seeds runtime unavailable — no-op */
  }
  return out;
}

function buildBrowserTools(db: Db, bridge: BridgeServer, bus?: RpcBus) {
  const deps = { bridge, db, bus };
  return {
    get_current_tab: tool({
      description: "Read the user's currently focused browser tab (URL, title, tabId).",
      inputSchema: z.object({}),
      execute: async () => browser.getCurrentTab(deps),
    }),
    get_all_tabs: tool({
      description: "List every open browser tab with URL, title, active flag.",
      inputSchema: z.object({}),
      execute: async () => browser.getAllTabs(deps),
    }),
    navigate: tool({
      description: "Navigate a tab to a URL (active tab by default).",
      inputSchema: z.object({ url: z.string().url(), tabId: z.number().int().optional() }),
      execute: async (a) =>
        browser.navigate(deps, a.tabId !== undefined ? { url: a.url, tabId: a.tabId } : { url: a.url }),
    }),
    new_tab: tool({
      description: "Open a new tab, optionally pre-loaded with a URL.",
      inputSchema: z.object({ url: z.string().url().optional() }),
      execute: async (a) => browser.newTab(deps, a.url !== undefined ? { url: a.url } : {}),
    }),
    close_tab: tool({
      description: "Close a tab (active tab by default).",
      inputSchema: z.object({ tabId: z.number().int().optional() }),
      execute: async (a) =>
        browser.closeTab(deps, a.tabId !== undefined ? { tabId: a.tabId } : {}),
    }),
    click: tool({
      description:
        "Click a DOM element matching a CSS selector on the specified (or active) tab.",
      inputSchema: z.object({
        selector: z.string().min(1),
        tabId: z.number().int().optional(),
      }),
      execute: async (a) =>
        browser.click(
          deps,
          a.tabId !== undefined ? { selector: a.selector, tabId: a.tabId } : { selector: a.selector },
        ),
    }),
    type: tool({
      description: "Type text into a DOM input/textarea by selector.",
      inputSchema: z.object({
        selector: z.string().min(1),
        text: z.string(),
        tabId: z.number().int().optional(),
      }),
      execute: async (a) =>
        browser.typeText(
          deps,
          a.tabId !== undefined
            ? { selector: a.selector, text: a.text, tabId: a.tabId }
            : { selector: a.selector, text: a.text },
        ),
    }),
    scroll: tool({
      description: "Scroll the page (direction: up/down/top/bottom, amount in px).",
      inputSchema: z.object({
        direction: z.enum(["up", "down", "top", "bottom"]),
        amount: z.number().int().optional(),
        tabId: z.number().int().optional(),
      }),
      execute: async (a) =>
        browser.scroll(
          deps,
          a.tabId !== undefined
            ? { direction: a.direction, tabId: a.tabId, ...(a.amount !== undefined ? { amount: a.amount } : {}) }
            : { direction: a.direction, ...(a.amount !== undefined ? { amount: a.amount } : {}) },
        ),
    }),
    extract_page: tool({
      description: "Extract the current tab's readable article text (Readability).",
      inputSchema: z.object({ tabId: z.number().int().optional() }),
      execute: async (a) =>
        browser.extract(deps, a.tabId !== undefined ? { tabId: a.tabId } : {}),
    }),
    screenshot_page: tool({
      description: "Capture a PNG screenshot of the visible part of a tab.",
      inputSchema: z.object({ tabId: z.number().int().optional() }),
      execute: async (a) =>
        browser.screenshot(deps, a.tabId !== undefined ? { tabId: a.tabId } : {}),
    }),
    summarize_page: tool({
      description: "Extract + summarize the current tab. style=bullet|tldr|detailed.",
      inputSchema: z.object({
        style: z.enum(["bullet", "tldr", "detailed"]).default("bullet"),
      }),
      execute: async (a) => summarizePage({ db, bridge, style: a.style }),
    }),
    save_page: tool({
      description: "Archive the current tab's Readability extract as a note.",
      inputSchema: z.object({}),
      execute: async () => savePage({ db, bridge }),
    }),
    explain_selection: tool({
      description:
        "Explain a highlighted text snippet from a page. Pass the selected text verbatim.",
      inputSchema: z.object({
        text: z.string().min(1),
        url: z.string().url().optional(),
      }),
      execute: async (a) => explainSelection({ db, bridge, text: a.text, ...(a.url !== undefined ? { url: a.url } : {}) }),
    }),
  };
}
