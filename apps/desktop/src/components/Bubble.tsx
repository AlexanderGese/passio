import clsx from "clsx";
import { useEffect } from "react";
import { onBubbleState, onHotkey, onScanResult, onSelectionResult, onSidecarLog, pingSidecar } from "../ipc";
import { PassioAvatar } from "../avatar/PassioAvatar";
import { usePassioStore } from "../store";
import { BrowserPanel } from "./BrowserPanel";
import { ChatPanel } from "./ChatPanel";
import { FirstRunWizard } from "./FirstRunWizard";
import { FocusPanel } from "./FocusPanel";
import { GoalsPanel } from "./GoalsPanel";
import { HistoryPanel } from "./HistoryPanel";
import { SettingsPanel } from "./SettingsPanel";
import { keychainApi, personaApi } from "../ipc";
import { useState } from "react";
import { SpeechBubble } from "./SpeechBubble";

/**
 * Floating passionfruit bubble. Clicking toggles the expanded panel.
 * The expanded panel has tabs: Chat (default) and Goals.
 */
export function Bubble() {
  const {
    bubble,
    expanded,
    tab,
    nudge,
    speech,
    assistantName,
    setBubble,
    setExpanded,
    toggleExpanded,
    setTab,
    setSidecarReady,
    setLastPing,
    setNudge,
    setSpeech,
    setAssistantName,
  } = usePassioStore();
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    // First-run detection: if no OpenAI key stored, show the wizard.
    keychainApi.has("openai").then((has) => {
      if (!has) setShowWizard(true);
    }).catch(() => undefined);
    // Load persona
    personaApi.get().then((p) => setAssistantName(p.name)).catch(() => undefined);
  }, [setAssistantName]);

  useEffect(() => {
    const unsubs: Promise<() => void>[] = [
      onBubbleState((s) => setBubble(s.state)),
      onSidecarLog((log) => {
        if (log.message.includes("ready")) setSidecarReady(true);
        if (log.message.includes("shutdown")) setSidecarReady(false);
        console.log(`[sidecar:${log.level}]`, log.message);
      }),
      onHotkey((name) => {
        if (name === "quick-chat") {
          setTab("chat");
          setExpanded(true);
        }
        if (name === "toggle-bubble") toggleExpanded();
      }),
      onSelectionResult((r) => {
        const msg = r.ok
          ? r.kind === "translate"
            ? `translated → ${r.text!.slice(0, 140)}`
            : `rewrite copied to clipboard · ${r.text!.slice(0, 120)}…`
          : `⚠ ${r.kind}: ${r.error ?? "failed"}`;
        setNudge({ message: msg, ts: Date.now() });
        setBubble(r.ok ? "talking" : "alert");
        setTimeout(() => setBubble("idle"), 1800);
      }),
      onScanResult((r) => {
        if (r.decision !== "quiet" && r.message) {
          setSpeech({ message: r.message, ts: Date.now(), ttlMs: 8_000 });
          setBubble("talking");
          setTimeout(() => setBubble("idle"), 2_200);
        }
      }),
    ];
    return () => {
      for (const p of unsubs) p.then((fn) => fn()).catch(() => {});
    };
  }, [setBubble, setExpanded, toggleExpanded, setTab, setSidecarReady, setNudge]);

  async function handleClick() {
    toggleExpanded();
    try {
      const t0 = performance.now();
      const res = await pingSidecar();
      setLastPing(Math.round(performance.now() - t0));
      setSidecarReady(res.pong === true);
    } catch (err) {
      console.error("ping failed", err);
    }
  }

  if (showWizard) {
    return (
      <div className="fixed inset-0 flex items-end justify-end p-3 pointer-events-none">
        <FirstRunWizard onDone={() => setShowWizard(false)} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-end justify-end p-3 pointer-events-none">
      <SpeechBubble
        message={speech?.message ?? null}
        ttlMs={speech?.ttlMs ?? 6000}
        name={assistantName}
        onDone={() => setSpeech(null)}
      />
      {nudge && (
        <div
          className="pointer-events-auto no-drag mb-2 max-w-[320px] rounded-2xl border border-amber-500/30 bg-amber-900/70 px-3 py-2 text-[12px] text-amber-100 shadow-2xl backdrop-blur"
          onClick={() => setNudge(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Escape" && setNudge(null)}
        >
          🍇 {nudge.message}
          <span className="ml-2 text-[10px] text-amber-300">(click to dismiss)</span>
        </div>
      )}
      {expanded && (
        <div className="no-drag pointer-events-auto mb-2 flex h-[460px] w-[320px] flex-col rounded-2xl border border-passio-skinLight/30 bg-neutral-900/95 p-3 text-neutral-100 shadow-2xl backdrop-blur">
          <Tabs />
          <div className="mt-2 min-h-0 flex-1">
            {tab === "chat" && <ChatPanel />}
            {tab === "history" && <HistoryPanel />}
            {tab === "goals" && <GoalsPanel />}
            {tab === "browser" && <BrowserPanel />}
            {tab === "focus" && <FocusPanel />}
            {tab === "settings" && <SettingsPanel onRunWizard={() => setShowWizard(true)} />}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleClick}
        className="pointer-events-auto drag-region rounded-full border-0 bg-transparent p-0 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-passio-pulp focus:ring-offset-2"
        aria-label="Passio bubble — click to expand"
      >
        <AvatarWithLevel state={bubble} />
      </button>
    </div>
  );
}

function AvatarWithLevel({ state }: { state: ReturnType<typeof usePassioStore.getState>["bubble"] }) {
  const mouthLevel = usePassioStore((s) => s.mouthLevel);
  return <PassioAvatar state={state} sizePx={60} mouthLevel={mouthLevel} />;
}

function Tabs() {
  const { tab, setTab } = usePassioStore();
  return (
    <div className="flex gap-1 border-b border-white/5 pb-1 text-xs">
      {(["chat", "history", "goals", "browser", "focus", "settings"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={clsx(
            "rounded-md px-2 py-1 transition-colors",
            tab === t ? "bg-passio-skinLight/30 text-passio-pulp" : "text-neutral-500 hover:text-neutral-200",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
