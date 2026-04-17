import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { chat } from "../ipc";
import { usePassioStore } from "../store";

/**
 * The expanded chat panel. Click-to-send text chat against the sidecar
 * agent. v1 uses non-streaming `generateText`; streaming UI lands with
 * week 6 (voice) when the protocol grows stream chunks end-to-end.
 */
export function ChatPanel() {
  const {
    messages,
    isThinking,
    conversationId,
    appendMessage,
    setIsThinking,
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
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const prompt = draft.trim();
    if (!prompt || isThinking) return;
    setDraft("");
    appendMessage({ role: "user", content: prompt, ts: Date.now() });
    setIsThinking(true);
    setBubble("thinking");
    try {
      const res = await chat(prompt, conversationId ?? undefined);
      setConversationId(res.conversationId);
      appendMessage({ role: "assistant", content: res.text, ts: Date.now() });
      setBubble("talking");
      setTimeout(() => setBubble("idle"), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendMessage({
        role: "system",
        content: `⚠ ${message}`,
        ts: Date.now(),
      });
      setBubble("alert");
      setTimeout(() => setBubble("idle"), 1800);
    } finally {
      setIsThinking(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-full flex-col text-sm">
      <header className="mb-2 flex items-center justify-between">
        <span className="font-medium text-passio-pulp">Passio</span>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetConversation}
              className="rounded px-1 hover:text-neutral-200"
            >
              new
            </button>
          )}
          <StatusDot />
        </div>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg bg-black/20 p-2 scrollbar-none"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((m, i) => <Bubble key={`${m.ts}-${i}`} role={m.role} text={m.content} />)
        )}
        {isThinking && <Bubble role="assistant" text="…" dim />}
      </div>

      <div className="mt-2">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="ask passio — enter to send, shift+enter for newline"
          rows={2}
          className="no-drag w-full resize-none rounded-lg border border-white/10 bg-black/40 p-2 text-neutral-100 placeholder-neutral-500 focus:border-passio-pulp focus:outline-none"
          disabled={isThinking}
        />
      </div>
    </div>
  );
}

function StatusDot() {
  const { sidecarReady, lastPing } = usePassioStore();
  return (
    <span className="flex items-center gap-1">
      <span
        className={clsx(
          "inline-block h-2 w-2 rounded-full",
          sidecarReady ? "bg-emerald-400" : "bg-neutral-600",
        )}
        aria-hidden
      />
      {lastPing !== null && <span>{lastPing}ms</span>}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="py-6 text-center text-xs text-neutral-500">
      <p>hey 👋 try one of:</p>
      <ul className="mt-2 space-y-1 text-neutral-400">
        <li>“remember I'm learning Japanese”</li>
        <li>“add ship week 2 to my todo list”</li>
        <li>“what do you know about me?”</li>
      </ul>
    </div>
  );
}

function Bubble({
  role,
  text,
  dim = false,
}: {
  role: "user" | "assistant" | "system";
  text: string;
  dim?: boolean;
}) {
  const align = role === "user" ? "ml-auto" : "";
  const bg =
    role === "user"
      ? "bg-passio-skinLight/25 text-neutral-100"
      : role === "system"
        ? "bg-amber-900/40 text-amber-200"
        : "bg-neutral-800/80 text-neutral-100";
  return (
    <div
      className={clsx(
        "max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-1.5 text-[13px] leading-snug shadow-sm",
        align,
        bg,
        dim && "opacity-60",
      )}
    >
      {text}
    </div>
  );
}
