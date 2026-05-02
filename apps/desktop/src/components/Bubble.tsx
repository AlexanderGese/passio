import clsx from "clsx";
import { useEffect } from "react";
import { onHotkey, onSidecarLog, pingSidecar } from "../ipc";
import { PassioAvatar } from "../avatar/PassioAvatar";
import { usePassioStore } from "../store";
import { SettingsPanel } from "./SettingsPanel";
import { Spotlight } from "./Spotlight";
import { Splash } from "./Splash";
import { ChatPanel } from "./ChatPanel";
import { DoPanel } from "./DoPanel";

const TABS = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "do", label: "Do", icon: "✓" },
  { id: "settings", label: "Settings", icon: "⚙" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Bubble() {
  const {
    bubble,
    expanded,
    tab,
    sidecarReady,
    hasBooted,
    spotlightOpen,
    setBubble,
    setExpanded,
    toggleExpanded,
    setTab,
    setSidecarReady,
    setHasBooted,
    setLastPing,
    setActivity,
    setSpotlightOpen,
  } = usePassioStore();

  // Boot probe: ping until the sidecar answers, then mark ready.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await pingSidecar();
        if (!alive) return;
        setLastPing(Date.now());
        setSidecarReady(true);
        setHasBooted(true);
        if (r) setActivity("ready");
      } catch {
        if (!alive) return;
        setSidecarReady(false);
        setTimeout(tick, 800);
      }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [setSidecarReady, setHasBooted, setActivity, setLastPing]);

  // Sidecar log + hotkey listeners.
  useEffect(() => {
    const unsubs = [
      onSidecarLog((log) => {
        if (log.message.includes("ready")) {
          setSidecarReady(true);
          setHasBooted(true);
          setActivity("ready");
        }
        if (log.message.includes("shutdown")) {
          setSidecarReady(false);
          setActivity("sleeping");
        }
        console.log(`[sidecar:${log.level}]`, log.message);
      }),
      onHotkey((name) => {
        if (name === "quick-chat") {
          setTab("chat");
          setExpanded(true);
        }
        if (name === "toggle-bubble") toggleExpanded();
        if (name === "spotlight") setSpotlightOpen(true);
      }),
    ];
    return () => {
      for (const p of unsubs) p.then((fn) => fn()).catch(() => {});
    };
  }, [
    setBubble,
    setExpanded,
    toggleExpanded,
    setTab,
    setSidecarReady,
    setHasBooted,
    setActivity,
    setSpotlightOpen,
  ]);

  if (!hasBooted) return <Splash />;

  // Spotlight owns the whole window when open.
  if (spotlightOpen) return <Spotlight />;

  return (
    <div className="fixed inset-0 flex flex-col items-end justify-end p-4 pointer-events-none">
      {expanded && (
        <div
          className="no-drag pointer-events-auto animate-panel-pop mb-3 flex h-[680px] w-[468px] flex-col overflow-hidden rounded-2xl bg-[#1A1422] text-passio-cream shadow-[0_30px_60px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(168,85,247,0.4),0_0_60px_-8px_rgba(168,85,247,0.55)]"
          style={{
            backgroundImage:
              "radial-gradient(1000px 200px at 100% 0%, rgba(168,85,247,0.12), transparent 60%), radial-gradient(900px 300px at 0% 100%, rgba(255,184,77,0.08), transparent 60%)",
          }}
        >
          <Tabs current={tab as TabId} onPick={setTab} />
          <div key={tab} className="min-h-0 flex-1 animate-tab-in overflow-hidden px-4 py-3">
            {tab === "chat" && <ChatPanel />}
            {tab === "do" && <DoPanel />}
            {tab === "settings" && <SettingsPanel />}
          </div>
        </div>
      )}

      <button
        type="button"
        className="no-drag pointer-events-auto"
        onClick={() => toggleExpanded()}
        title="Toggle Passio"
      >
        <PassioAvatar sizePx={96} state={bubble} />
      </button>

      {!sidecarReady && (
        <span className="pointer-events-auto mt-1 rounded-md border border-amber-400/40 bg-amber-950/85 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-200">
          waking…
        </span>
      )}
    </div>
  );
}

function Tabs({ current, onPick }: { current: TabId; onPick: (t: TabId) => void }) {
  return (
    <nav className="flex border-b border-passio-border bg-[#1F1628]">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
          className={clsx(
            "flex-1 border-b-2 px-2.5 py-2 text-[12px] font-medium transition-colors",
            current === t.id
              ? "border-passio-pulp text-passio-pulpBright"
              : "border-transparent text-neutral-400 hover:text-neutral-100",
          )}
        >
          <span className="mr-1">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
