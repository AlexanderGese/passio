import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";

type Stats = {
  today: Record<string, number>;
  lastHour: Record<string, number>;
  streakDistractionMin: number;
  currentApp: string | null;
  currentTitle: string | null;
};

type Snapshot = {
  activeApp: string | null;
  activeTitle: string | null;
  topProcesses: Array<{ name: string; cpu: number; mem: number }>;
  classification: "work" | "distraction" | "idle" | "unknown";
};

export function ActivityPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  async function refresh() {
    try {
      const s = await invoke<Stats>("sidecar_passthrough", {
        method: "passio.system.stats",
        params: {},
      });
      setStats(s);
      const sn = await invoke<Snapshot>("sidecar_passthrough", {
        method: "passio.system.snapshot",
        params: {},
      });
      setSnap(sn);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-0.5">
      <section className="rounded-xl border border-passio-border bg-[#241B30] p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-passio-pulpBright">
          Right now
        </p>
        <p className="mb-2 mt-1 text-[12px] leading-snug text-neutral-300">
          What Passio sees on your desktop. Updates every minute.
        </p>
        {snap ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                  badgeColor(snap.classification),
                )}
              >
                {snap.classification}
              </span>
              <span className="truncate text-[14px] text-passio-cream">
                {snap.activeApp ?? "(no window)"}
              </span>
            </div>
            {snap.activeTitle && (
              <p className="mt-1 truncate text-[13px] text-neutral-200" title={snap.activeTitle}>
                {snap.activeTitle}
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-neutral-400">loading…</p>
        )}
      </section>

      {stats && stats.streakDistractionMin > 15 && (
        <section className="rounded-xl border border-amber-500/50 bg-amber-950/40 p-3">
          <p className="text-[13px] font-medium text-amber-100">
            ⚠ {stats.streakDistractionMin}min straight on a distracting app.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-passio-border bg-[#241B30] p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-passio-pulpBright">
          Today
        </p>
        <p className="mb-2 mt-1 text-[12px] leading-snug text-neutral-300">
          Last 24 h classified. Hours are rough — based on foreground window samples.
        </p>
        {stats ? <Breakdown bucket={stats.today} /> : <p className="text-[13px] text-neutral-400">loading…</p>}
      </section>

      <section className="rounded-xl border border-passio-border bg-[#241B30] p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-passio-pulpBright">
          Last hour
        </p>
        <div className="mb-2 mt-1" />
        {stats ? <Breakdown bucket={stats.lastHour} /> : null}
      </section>

      <section className="rounded-xl border border-passio-border bg-[#241B30] p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-passio-pulpBright">
          Top processes
        </p>
        <p className="mb-2 mt-1 text-[12px] leading-snug text-neutral-300">
          htop-style CPU leaderboard at last sample.
        </p>
        {snap && snap.topProcesses.length > 0 ? (
          <ul className="space-y-1">
            {snap.topProcesses.map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between gap-2 rounded-lg bg-passio-panel px-3 py-1.5 text-[13px]"
              >
                <span className="truncate text-passio-cream">{p.name}</span>
                <span className="shrink-0 text-neutral-300">
                  {p.cpu.toFixed(1)}% cpu · {p.mem.toFixed(1)}% mem
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-neutral-400">no data yet</p>
        )}
      </section>
    </div>
  );
}

function Breakdown({ bucket }: { bucket: Record<string, number> }) {
  const entries = [
    { k: "work", label: "Work", color: "bg-emerald-500" },
    { k: "unknown", label: "Other", color: "bg-passio-skinLight" },
    { k: "distraction", label: "Distraction", color: "bg-red-500" },
    { k: "idle", label: "Idle", color: "bg-neutral-600" },
  ] as const;
  const total = entries.reduce((s, e) => s + (bucket[e.k] ?? 0), 0);
  if (total === 0) return <p className="text-[13px] text-neutral-400">no samples yet</p>;
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-passio-panel">
        {entries.map((e) => {
          const pct = total > 0 ? ((bucket[e.k] ?? 0) / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={e.k}
              className={e.color}
              style={{ width: `${pct}%` }}
              title={`${e.label} · ${formatMin((bucket[e.k] ?? 0) / 60)}`}
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-2 gap-1.5 text-[12px]">
        {entries.map((e) => (
          <li key={e.k} className="flex items-center gap-1.5">
            <span className={clsx("inline-block h-2 w-2 rounded-full", e.color)} />
            <span className="text-neutral-300">{e.label}</span>
            <span className="ml-auto font-mono text-neutral-100">
              {formatMin((bucket[e.k] ?? 0) / 60)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function badgeColor(cls: Snapshot["classification"]): string {
  switch (cls) {
    case "work":
      return "bg-emerald-500/20 text-emerald-300";
    case "distraction":
      return "bg-red-500/20 text-red-300";
    case "idle":
      return "bg-neutral-700 text-neutral-300";
    default:
      return "bg-passio-skinLight/25 text-passio-cream";
  }
}

function formatMin(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  return `${(min / 60).toFixed(1)}h`;
}
