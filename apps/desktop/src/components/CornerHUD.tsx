import { useEffect, useState } from "react";
import { focusApi } from "../ipc";
import { usePassioStore } from "../store";

/**
 * Ironman-style corner HUD that materializes during a focus session.
 * Shows time remaining, current app, CPU ring. Small, top-left, draggable
 * feel, with a pulse ring — so it feels like a HUD, not a notification.
 */
export function CornerHUD() {
  const { expanded } = usePassioStore();
  const [active, setActive] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [app, setApp] = useState<string | null>(null);
  const [cpu, setCpu] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await focusApi.state();
        setActive(s.active);
        setRemaining(s.remainingSeconds);
      } catch {
        setActive(false);
      }
    };
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!active || expanded) return;
    const h = setInterval(async () => {
      try {
        const { sidecarCall } = await import("../ipc-helpers");
        const snap = (await sidecarCall("passio.system.snapshot", {})) as {
          activeApp: string | null;
          topProcesses: Array<{ name: string; cpu: number }>;
        };
        setApp(snap.activeApp);
        const c = snap.topProcesses?.[0]?.cpu ?? 0;
        setCpu(Math.min(100, Math.round(c)));
      } catch {
        /* silent */
      }
    }, 10_000);
    return () => clearInterval(h);
  }, [active, expanded]);

  if (!active || expanded) return null;

  const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");

  return (
    <div className="pointer-events-none fixed left-4 top-4 z-30">
      <div className="no-drag flex items-center gap-3 rounded-2xl border border-passio-pulp/40 bg-[#1A1422]/90 px-3 py-2 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(168,85,247,0.35)]">
        <div className="relative h-10 w-10">
          <svg viewBox="0 0 36 36" className="absolute inset-0">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2E2340" strokeWidth="2.5" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#ff6b9d"
              strokeWidth="2.5"
              strokeDasharray={`${cpu} 100`}
              pathLength={100}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-passio-cream">
            {cpu}%
          </span>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[14px] text-passio-pulpBright">{mm}:{ss}</div>
          <div className="max-w-[120px] truncate text-[10px] text-neutral-300">
            {app ?? "focused"}
          </div>
        </div>
      </div>
    </div>
  );
}
