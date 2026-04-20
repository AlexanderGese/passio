import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { autoLoopApi, chat, onChatChunk, voiceApi } from "../ipc";
import { playWithLipsync } from "../avatar/lipsync";
import { usePassioStore } from "../store";

/**
 * Main chat panel. Text + voice input, streaming replies, voice-in →
 * voice-out loop with lipsync. W21 redesign: 15 px body, crisp chat
 * bubbles with shadow, visible action buttons.
 */
export function ChatPanel() {
  const {
    messages,
    isThinking,
    streamingText,
    conversationId,
    activeGoalId,
    activeGoalTitle,
    appendMessage,
    setIsThinking,
    appendStream,
    resetStream,
    setConversationId,
    setBubble,
    setMouthLevel,
    resetConversation,
  } = usePassioStore();

  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

    if (autoMode) {
      // Kick off an autonomous loop instead of a single chat turn.
      try {
        const r = await autoLoopApi.start({
          task: prompt,
          ...(activeGoalId !== null ? { goalId: activeGoalId } : {}),
        });
        appendMessage({
          role: "system",
          content: `∞ Auto-loop #${r.id} started. Watch progress in the Auto tab; I'll re-plan after each step until the task is done.`,
          ts: Date.now(),
        });
      } catch (err) {
        appendMessage({
          role: "system",
          content: `⚠ auto-loop failed: ${err instanceof Error ? err.message : String(err)}`,
          ts: Date.now(),
        });
      }
      return;
    }

    setIsThinking(true);
    resetStream();
    setBubble("thinking");
    try {
      const res = await chat(prompt, conversationId ?? undefined, activeGoalId ?? undefined);
      setConversationId(res.conversationId);
      appendMessage({ role: "assistant", content: res.text, ts: Date.now() });
      resetStream();
      setBubble("talking");
      setTimeout(() => setBubble("idle"), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendMessage({ role: "system", content: `⚠ ${message}`, ts: Date.now() });
      resetStream();
      setBubble("alert");
      setTimeout(() => setBubble("idle"), 1800);
    } finally {
      setIsThinking(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        for (const t of stream.getTracks()) t.stop();
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        if (blob.size < 1024) {
          setRecording(false);
          return;
        }
        setRecording(false);
        setTranscribing(true);
        try {
          const base64 = await blobToBase64(blob);
          const { text } = await voiceApi.transcribe({ audio_base64: base64, mime_type: mime });
          if (text) {
            setDraft(text);
            setTimeout(() => void sendWith(text), 0);
          }
        } catch (e) {
          appendMessage({
            role: "system",
            content: `⚠ transcription failed: ${(e as Error).message}`,
            ts: Date.now(),
          });
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setBubble("listening");
    } catch (e) {
      appendMessage({
        role: "system",
        content: `⚠ mic access blocked: ${(e as Error).message}`,
        ts: Date.now(),
      });
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  async function sendWith(prompt: string) {
    appendMessage({ role: "user", content: prompt, ts: Date.now() });
    setDraft("");
    setIsThinking(true);
    resetStream();
    setBubble("thinking");
    try {
      const res = await chat(prompt, conversationId ?? undefined, activeGoalId ?? undefined);
      setConversationId(res.conversationId);
      appendMessage({ role: "assistant", content: res.text, ts: Date.now() });
      resetStream();
      setBubble("talking");
      try {
        const tts = await voiceApi.synthesize({ text: res.text.slice(0, 2000) });
        await playWithLipsync({
          base64: tts.audio_base64,
          mimeType: tts.mime_type,
          onLevel: setMouthLevel,
          onDone: () => setMouthLevel(0),
        });
      } catch {
        /* text still shows */
      }
      setTimeout(() => setBubble("idle"), 500);
    } catch (err) {
      appendMessage({
        role: "system",
        content: `⚠ ${(err as Error).message}`,
        ts: Date.now(),
      });
      resetStream();
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
    <div className="flex h-full flex-col gap-3">
      {activeGoalId !== null && (
        <div className="flex items-center justify-between rounded-xl border border-passio-pulp/40 bg-[#241B30] px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-passio-pulpBright">
              Focused on goal
            </p>
            <p className="truncate text-[14px] text-passio-cream">{activeGoalTitle}</p>
          </div>
          <button
            type="button"
            onClick={resetConversation}
            className="ml-2 shrink-0 rounded-md bg-[#2E2340] px-2 py-1 text-[12px] text-neutral-200 hover:text-passio-pulp"
          >
            Unscope
          </button>
        </div>
      )}

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-passio-border bg-[#120E1A] p-3"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((m, i) => <Msg key={`${m.ts}-${i}`} role={m.role} text={m.content} />)
        )}
        {isThinking && streamingText.length > 0 && (
          <Msg role="assistant" text={streamingText} />
        )}
        {isThinking && streamingText.length === 0 && <Msg role="assistant" text="…" dim />}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            recording ? "Listening…" : transcribing ? "Transcribing…" : "Ask Passio — Enter to send, Shift+Enter for newline"
          }
          rows={2}
          className="no-drag flex-1 resize-none rounded-xl border border-passio-border bg-[#241B30] px-3 py-2.5 text-[15px] leading-snug text-passio-cream placeholder-neutral-500 focus:border-passio-pulp focus:outline-none"
          disabled={isThinking || recording || transcribing}
        />
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={isThinking || transcribing}
          className={clsx(
            "no-drag flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[18px] transition-colors",
            recording
              ? "bg-red-500 text-white animate-pulse"
              : "bg-passio-skin text-passio-cream hover:bg-passio-skinLight",
          )}
          aria-label={recording ? "Stop recording" : "Start voice input"}
          title={recording ? "Stop" : "Voice"}
        >
          {recording ? "■" : "🎙"}
        </button>
        <button
          type="button"
          onClick={() => setAutoMode(!autoMode)}
          className={clsx(
            "no-drag flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[16px] transition-colors",
            autoMode
              ? "bg-passio-pulpBright text-passio-seed animate-pulse-soft"
              : "bg-[#2E2340] text-neutral-300 hover:text-passio-pulpBright",
          )}
          aria-label={autoMode ? "Auto mode on" : "Auto mode off"}
          title={
            autoMode
              ? "Auto mode ON — next send starts a loop that keeps going until the task is done"
              : "Auto mode OFF — tap to enable run-until-done"
          }
        >
          ∞
        </button>
        <button
          type="button"
          onClick={send}
          disabled={isThinking || !draft.trim()}
          className={clsx(
            "no-drag h-11 shrink-0 rounded-full px-4 text-[14px] font-semibold transition-colors disabled:opacity-40",
            autoMode
              ? "bg-passio-pulpBright text-passio-seed hover:bg-passio-pulp"
              : "bg-passio-pulp text-passio-seed hover:bg-passio-pulpBright",
          )}
          aria-label={autoMode ? "Run until done" : "Send"}
        >
          {autoMode ? "Run loop" : "Send"}
        </button>
      </div>

      {messages.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={resetConversation}
            className="text-[12px] text-neutral-400 hover:text-passio-pulp"
          >
            New conversation →
          </button>
        </div>
      )}
    </div>
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function EmptyState() {
  const examples = [
    "remember I'm learning Japanese to N2",
    "what should I do this afternoon?",
    "add 'read ch.4 of the textbook' to my list",
    "what am I avoiding right now?",
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center animate-fade-in">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-passio-pulp to-passio-skin shadow-[0_10px_28px_-8px_rgba(168,85,247,0.6)]">
        <span className="text-2xl">🍇</span>
      </div>
      <p className="voice text-[22px] font-medium text-passio-cream">What's on your mind?</p>
      <p className="text-[13px] text-neutral-300">
        Thick skin, bright inside. Ask anything.
      </p>
      <ul className="mt-2 w-full max-w-[320px] space-y-1.5">
        {examples.map((ex) => (
          <li
            key={ex}
            className="rounded-xl border border-passio-border/60 bg-passio-panelAlt/60 px-3 py-2 text-left text-[13px] text-neutral-200"
          >
            "{ex}"
          </li>
        ))}
      </ul>
    </div>
  );
}

function Msg({
  role,
  text,
  dim = false,
}: {
  role: "user" | "assistant" | "system";
  text: string;
  dim?: boolean;
}) {
  const isUser = role === "user";
  const isSystem = role === "system";
  return (
    <div
      className={clsx(
        "max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-[1.55] shadow-sm allow-select animate-fade-in-up",
        isUser
          ? "ml-auto bg-gradient-to-br from-[#7D3AB8] to-[#5B2A86] text-passio-cream shadow-[0_6px_18px_-8px_rgba(125,58,184,0.55)]"
          : isSystem
            ? "bg-amber-950/70 text-amber-100 border border-amber-500/35"
            : "voice bg-gradient-to-b from-[#241B30] to-[#1E1629] text-passio-cream border border-passio-border/80",
        dim && "opacity-60 italic",
      )}
    >
      {text}
    </div>
  );
}
