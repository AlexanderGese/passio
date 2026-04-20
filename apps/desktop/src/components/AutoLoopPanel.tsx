import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { autoLoopApi, onAutoLoopUpdate, type AutoLoopEvent, type AutoLoopRow } from "../ipc";

export function AutoLoopPanel() {
  const [loops, setLoops] = useState<AutoLoopRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [events, setEvents] = useState<AutoLoopEvent[]>([]);
  const [task, setTask] = useState("");
  const [maxSteps, setMaxSteps] = useState(20);
  const [maxCost, setMaxCost] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await autoLoopApi.list({ limit: 30 });
      setLoops(r.loops);
      if (selected === null && r.loops[0]) setSelected(r.loops[0].id);
    } catch {
      /* silent */
    }
  }, [selected]);

  const refreshEvents = useCallback(async () => {
    if (selected === null) return;
    try {
      const r = await autoLoopApi.events(selected);
      setEvents(r.events);
    } catch {
      /* silent */
    }
  }, [selected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents, selected]);

  useEffect(() => {
    // Live updates via notification event
    const p = onAutoLoopUpdate(() => {
      void refresh();
      void refreshEvents();
    });
    // Light polling fallback while any loop is running.
    pollRef.current = setInterval(() => {
      if (loops.some((l) => l.status === "running")) {
        void refresh();
        void refreshEvents();
      }
    }, 2500);
    return () => {
      p.then((fn) => fn()).catch(() => {});
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loops, refresh, refreshEvents]);

  async function start() {
    if (!task.trim() || busy) return;
    setBusy(true);
    try {
      const r = await autoLoopApi.start({
        task: task.trim(),
        maxSteps,
        maxCostUsd: maxCost,
      });
      setTask("");
      setSelected(r.id);
      await refresh();
    } catch (e) {
      alert(`Auto-loop failed to start: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: number) {
    await autoLoopApi.cancel(id);
    void refresh();
  }

  const current = loops.find((l) => l.id === selected) ?? null;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="space-y-2 rounded-xl border border-passio-border bg-[#241B30] p-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-passio-pulpBright">
          New auto-loop
        </p>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={2}
          placeholder="e.g. plan + execute a 3-day Berlin trip and save an itinerary to my vault"
          className="no-drag w-full resize-none rounded-lg bg-[#1A1422] px-3 py-2 text-[14px] text-passio-cream placeholder-neutral-500 focus:outline-none"
        />
        <div className="flex items-center gap-3 text-[12px] text-neutral-300">
          <label className="flex items-center gap-1">
            max steps
            <input
              type="number"
              min={3}
              max={80}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value))}
              className="no-drag w-14 rounded bg-[#1A1422] px-1 py-0.5 text-passio-cream"
            />
          </label>
          <label className="flex items-center gap-1">
            max $
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={maxCost}
              onChange={(e) => setMaxCost(Number(e.target.value))}
              className="no-drag w-14 rounded bg-[#1A1422] px-1 py-0.5 text-passio-cream"
            />
          </label>
          <button
            type="button"
            onClick={start}
            disabled={busy || !task.trim()}
            className="no-drag ml-auto rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed disabled:opacity-40"
          >
            {busy ? "Starting…" : "Run until done"}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[130px_1fr] gap-2">
        <ul className="space-y-1 overflow-y-auto rounded-xl border border-passio-border bg-[#120E1A] p-1.5">
          {loops.length === 0 ? (
            <li className="px-2 py-4 text-center text-[12px] text-neutral-500">no loops yet</li>
          ) : (
            loops.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setSelected(l.id)}
                  className={clsx(
                    "w-full rounded-md px-2 py-1.5 text-left",
                    selected === l.id
                      ? "bg-passio-pulp/20 text-passio-pulpBright"
                      : "hover:bg-passio-pulp/10 text-neutral-200",
                  )}
                >
                  <div className="flex items-center gap-1">
                    <StatusDot status={l.status} />
                    <span className="truncate text-[12px]">{l.task.slice(0, 26)}</span>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    {l.stepCount}/{l.maxCostUsd ? `$${l.costUsd.toFixed(2)}` : l.stepCount} · {l.status}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="min-w-0 overflow-y-auto rounded-xl border border-passio-border bg-[#120E1A] p-2">
          {current ? (
            <>
              <div className="mb-2 border-b border-passio-border/50 pb-2">
                <p className="voice text-[15px] text-passio-cream">{current.task}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
                  <span>step {current.stepCount}</span>
                  <span>· replans {current.replanCount}</span>
                  <span>· ${current.costUsd.toFixed(3)}</span>
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                      statusClass(current.status),
                    )}
                  >
                    {current.status}
                  </span>
                  {current.status === "running" && (
                    <button
                      type="button"
                      onClick={() => cancel(current.id)}
                      className="no-drag ml-auto rounded-md bg-red-500/20 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-500/30"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {current.lastMessage && (
                  <p className="mt-1 text-[12px] italic text-neutral-300">{current.lastMessage}</p>
                )}
              </div>
              <ul className="space-y-1.5">
                {events.map((e) => (
                  <li key={e.id} className="rounded-md bg-[#1F1628] px-2 py-1.5 text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className={clsx("text-[10px] uppercase", kindClass(e.kind))}>
                        {e.kind.replace("_", " ")}
                      </span>
                      <span className="truncate text-passio-cream">{e.title ?? ""}</span>
                      <span className="ml-auto text-[10px] text-neutral-500">
                        {e.ts.slice(11, 19)}
                      </span>
                    </div>
                    {e.content && e.kind.startsWith("step_") && (
                      <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-neutral-300">
                        {e.content.slice(0, 400)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-10 text-center text-[13px] text-neutral-400">
              Pick a loop to see its step-by-step log.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "running"
      ? "bg-passio-pulpBright animate-pulse"
      : status === "complete"
        ? "bg-emerald-400"
        : status === "cancelled" || status === "abandoned"
          ? "bg-neutral-500"
          : status === "failed"
            ? "bg-red-400"
            : "bg-amber-400";
  return <span className={clsx("inline-block h-2 w-2 rounded-full", cls)} />;
}

function statusClass(status: string): string {
  if (status === "running") return "bg-passio-pulp/20 text-passio-pulpBright";
  if (status === "complete") return "bg-emerald-500/20 text-emerald-300";
  if (status === "failed") return "bg-red-500/20 text-red-200";
  if (status === "cancelled" || status === "abandoned") return "bg-neutral-600/30 text-neutral-300";
  return "bg-amber-500/20 text-amber-200";
}

function kindClass(kind: string): string {
  if (kind === "plan" || kind === "replan") return "text-passio-pulpBright";
  if (kind === "step_start") return "text-passio-skinLight";
  if (kind === "step_done") return "text-emerald-300";
  if (kind === "step_fail" || kind === "error") return "text-red-300";
  if (kind === "assess") return "text-amber-300";
  return "text-neutral-400";
}
