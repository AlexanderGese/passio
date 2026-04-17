import { useEffect } from "react";
import { onBubbleState, onHotkey, onSidecarLog, pingSidecar } from "../ipc";
import { PassioAvatar } from "../avatar/PassioAvatar";
import { usePassioStore } from "../store";

/**
 * The floating passionfruit HUD bubble. Click to expand; drag the body
 * to reposition (handled by CSS drag region). Subscribes to Rust events
 * for bubble state changes and hotkey signals.
 */
export function Bubble() {
  const { bubble, expanded, setBubble, setExpanded, setSidecarReady, setLastPing } = usePassioStore();

  useEffect(() => {
    const unsubs: Promise<() => void>[] = [
      onBubbleState((s) => setBubble(s.state)),
      onSidecarLog((log) => {
        if (log.message.includes("ready")) setSidecarReady(true);
        console.log(`[sidecar:${log.level}]`, log.message);
      }),
      onHotkey(async (name) => {
        if (name === "quick-chat") setExpanded(true);
        if (name === "toggle-bubble") setExpanded((prev) => !prev as unknown as boolean);
      }),
    ];
    return () => {
      for (const p of unsubs) p.then((fn) => fn()).catch(() => {});
    };
  }, [setBubble, setExpanded, setSidecarReady]);

  async function handleClick() {
    setExpanded(!expanded);
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
    <div className="fixed inset-0 flex items-end justify-end p-3 pointer-events-none">
      <button
        type="button"
        onClick={handleClick}
        className="pointer-events-auto drag-region rounded-full border-0 bg-transparent p-0 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-passio-pulp focus:ring-offset-2"
        aria-label="Passio bubble — click to expand"
      >
        <PassioAvatar state={bubble} sizePx={60} />
      </button>

      {expanded && (
        <div className="pointer-events-auto no-drag absolute bottom-20 right-3 w-80 rounded-2xl bg-neutral-900/95 p-4 text-sm text-neutral-100 shadow-2xl backdrop-blur border border-passio-skinLight/30">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-passio-pulp">Passio</span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-neutral-500 hover:text-neutral-200"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <ExpandedBody />
        </div>
      )}
    </div>
  );
}

function ExpandedBody() {
  const { sidecarReady, lastPing } = usePassioStore();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${sidecarReady ? "bg-emerald-400" : "bg-neutral-600"}`}
          aria-hidden
        />
        <span className="text-xs text-neutral-400">
          sidecar {sidecarReady ? "ready" : "cold"} {lastPing !== null && `· ${lastPing}ms`}
        </span>
      </div>
      <p className="text-neutral-400 text-xs">
        Chat UI ships with the Context Engine plan (week 2). For now, click to ping the sidecar.
      </p>
    </div>
  );
}
