import clsx from "clsx";
import { useEffect } from "react";
import { onBubbleState, onHotkey, onScanResult, onSidecarLog, pingSidecar } from "../ipc";
import { PassioAvatar } from "../avatar/PassioAvatar";
import { usePassioStore } from "../store";
import { BrowserPanel } from "./BrowserPanel";
import { ChatPanel } from "./ChatPanel";
import { FocusPanel } from "./FocusPanel";
import { GoalsPanel } from "./GoalsPanel";

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
    setBubble,
    setExpanded,
    toggleExpanded,
    setTab,
    setSidecarReady,
    setLastPing,
    setNudge,
  } = usePassioStore();

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
      onScanResult((r) => {
        if (r.decision !== "quiet" && r.message) {
          setNudge({ message: r.message, ts: Date.now() });
          setBubble("alert");
          setTimeout(() => setBubble("idle"), 2_000);
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

  return (
    <div className="fixed inset-0 flex flex-col items-end justify-end p-3 pointer-events-none">
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
            {tab === "goals" && <GoalsPanel />}
            {tab === "browser" && <BrowserPanel />}
            {tab === "focus" && <FocusPanel />}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleClick}
        className="pointer-events-auto drag-region rounded-full border-0 bg-transparent p-0 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-passio-pulp focus:ring-offset-2"
        aria-label="Passio bubble — click to expand"
      >
        <PassioAvatar state={bubble} sizePx={60} />
      </button>
    </div>
  );
}

function Tabs() {
  const { tab, setTab } = usePassioStore();
  return (
    <div className="flex gap-1 border-b border-white/5 pb-1 text-xs">
      {(["chat", "goals", "browser", "focus"] as const).map((t) => (
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
