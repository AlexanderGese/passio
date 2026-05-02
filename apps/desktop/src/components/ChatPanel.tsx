import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { chat, onChatChunk } from "../ipc";
import { usePassioStore } from "../store";

/**
 * Lean chat panel — text in, streaming text out, conversation memory
 * per `conversationId`. No voice / lipsync / autopilot toggles. The
 * store keeps the message list + the live streaming buffer.
 */
export function ChatPanel() {
  const {
    messages,
    isThinking,
    streamingText,
    conversationId,
    appendMessage,
    setIsThinking,
    appendStream,
    resetStream,
    setConversationId,
    setBubble,
    resetConversation,
  } = usePassioStore();

  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Spotlight's "Ask Passio" rows fire passio-chat-prefill — we drop the
  // text into the input box and focus.
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text === "string" && text.trim()) {
        setDraft((d) => (d ? `${d}\n\n${text}` : text));
        inputRef.current?.focus();
      }
    };
    window.addEventListener("passio-chat-prefill", handler);
    return () => window.removeEventListener("passio-chat-prefill", handler);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, streamingText]);

  // Subscribe to streaming chunks once.
  useEffect(() => {
    const p = onChatChunk((c) => {
      if (c.done) return;
      appendStream(c.delta);
    });
    return () => {
      p.then((fn) => fn()).catch(() => {});
    };
  }, [appendStream]);

  async function send() {
    const prompt = draft.trim();
    if (!prompt || isThinking) return;
    setDraft("");
    appendMessage({ role: "user", content: prompt, ts: Date.now() });
    setIsThinking(true);
    resetStream();
    setBubble("thinking");
    try {
      const res = await chat(prompt, conversationId ?? undefined);
      setConversationId(res.conversationId);
      appendMessage({ role: "assistant", content: res.text, ts: Date.now() });
      setBubble("idle");
    } catch (err) {
      appendMessage({
        role: "system",
        content: `⚠ ${err instanceof Error ? err.message : String(err)}`,
        ts: Date.now(),
      });
      setBubble("alert");
    } finally {
      setIsThinking(false);
      resetStream();
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-neutral-500">
        <span>{conversationId ? `convo #${conversationId}` : "new conversation"}</span>
        <button
          type="button"
          onClick={() => resetConversation()}
          className="no-drag rounded px-2 py-0.5 text-neutral-400 hover:text-passio-pulpBright"
        >
          new
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <Message key={i} role={m.role} content={m.content} />
        ))}
        {streamingText && <Message role="assistant" content={streamingText} streaming />}
        {isThinking && !streamingText && (
          <p className="text-[12px] italic text-passio-pulpBright">Passio is thinking…</p>
        )}
      </div>

      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        rows={2}
        placeholder="Talk to Passio…"
        className="no-drag w-full resize-none rounded-lg border border-passio-border bg-[#1A1422] px-3 py-2 text-[15px] text-passio-cream placeholder-neutral-500 focus:border-passio-pulp focus:outline-none"
      />
    </div>
  );
}

function Message({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
}) {
  const cls =
    role === "user"
      ? "ml-8 self-end bg-passio-pulp/20 text-passio-cream"
      : role === "system"
        ? "self-start bg-amber-950/60 text-amber-200"
        : "self-start bg-[#241B30] text-passio-cream";
  return (
    <div className={clsx("rounded-xl px-3 py-2 text-[14px] whitespace-pre-wrap", cls)}>
      {content}
      {streaming && <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-passio-pulpBright" />}
    </div>
  );
}
