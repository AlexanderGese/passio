import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";
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

const SYSTEM_PROMPT = `You are Passio, a local, passionfruit-shaped desktop AI assistant.

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

export async function chat(
  db: Db,
  emit: Emitter,
  input: { prompt: string; conversationId?: number },
): Promise<{ conversationId: number; text: string }> {
  // Ensure a conversation id
  let convId = input.conversationId;
  if (!convId) {
    const [conv] = await db
      .insert(conversations)
      .values({ mode: "text" })
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

  const tools = buildTools(db);
  const result = await generateText({
    model: openai()(modelName()),
    system: `${SYSTEM_PROMPT}\n\n${contextBlock}`,
    prompt: input.prompt,
    tools,
    stopWhen: stepCountIs(6),
  });

  await db.insert(messages).values({
    conversationId: convId,
    role: "assistant",
    content: result.text,
  });

  emit("passio.chat.chunk", {
    conversationId: convId,
    delta: result.text,
    done: true,
  });

  return { conversationId: convId, text: result.text };
}

function buildTools(db: Db) {
  return {
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
  };
}
