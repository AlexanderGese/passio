import { createOpenAI } from "@ai-sdk/openai";
import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { getPersona } from "../tools/persona.js";
import { conversations, messages } from "../db/schema.js";
import { retrieve } from "../context/retrieve.js";
import {
  memoryForget,
  memoryRemember,
  memorySearch,
  noteSave,
  noteSearch,
  setIntent,
  todoAdd,
  todoDone,
  todoList,
} from "../tools/memory.js";

type Emitter = (method: string, params: unknown) => void;

const BASE_SYSTEM_PROMPT = `You are {NAME}, a local desktop AI assistant.

Style: terse, warm, direct. You know the user well through retrieved memory.
Your output is shown in a small floating bubble, so keep replies short (1–4 sentences)
unless the user explicitly asks for detail.

Tool-use policy:
  • If the user shares a lasting fact/preference/identity/context, call memory_remember.
  • For "what do you remember about X?" / "what do I like?" — call memory_search.
  • For todo actions, use todo_add / todo_list / todo_done.
  • For ad-hoc notes, use note_save / note_search.
  • For daily focus, use set_intent.
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
  input: { prompt: string; conversationId?: number },
): Promise<{ conversationId: number; text: string }> {
  let convId = input.conversationId;
  if (!convId) {
    const [conv] = await db
      .insert(conversations)
      .values({ mode: "text" })
      .returning({ id: conversations.id });
    if (!conv) throw new Error("failed to start conversation");
    convId = conv.id;
  }

  // Load prior turns of this conversation BEFORE inserting the new user
  // message, so the history doesn't double-count it.
  const priorRows = db.$raw
    .query(
      "SELECT role, content FROM messages WHERE conversation_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT 40",
    )
    .all(convId) as Array<{ role: "user" | "assistant"; content: string }>;
  const history = priorRows.reverse();

  await db.insert(messages).values({
    conversationId: convId,
    role: "user",
    content: input.prompt,
  });

  const hits = await retrieve(db, input.prompt, 8);
  const contextBlock = hits.length
    ? "Retrieved context:\n" +
      hits.map((h) => `  - (${h.kind}#${h.id}) ${h.content}`).join("\n")
    : "Retrieved context: (none yet — this is a cold memory)";

  const persona = getPersona(db);
  const sysPrompt = BASE_SYSTEM_PROMPT.replaceAll("{NAME}", persona.name);
  const tools = buildTools(db);

  let full = "";
  try {
    const stream = streamText({
      model: openai()(modelName()),
      system: `${sysPrompt}\n\n${contextBlock}`,
      messages: [...history, { role: "user" as const, content: input.prompt }],
      tools,
      stopWhen: stepCountIs(6),
    });

    for await (const delta of stream.textStream) {
      full += delta;
      emit("passio.chat.chunk", { conversationId: convId, delta, done: false });
    }
    await stream.text;

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
        "Search user memory (facts + notes) via hybrid FTS + vector retrieval.",
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
  };
}
