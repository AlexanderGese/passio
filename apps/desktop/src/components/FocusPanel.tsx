import clsx from "clsx";
import { useEffect, useState } from "react";
import {
  briefingApi,
  dndApi,
  focusApi,
  packApi,
  proactiveApi,
  type FocusState,
  type Pack,
  type ProactiveMode,
} from "../ipc";

/**
 * Focus panel: active context pack, DND, proactive mode + interval,
 * pomodoro timer, and buttons for on-demand briefing / recap.
 */
export function FocusPanel() {
  const [pack, setPack] = useState<Pack>("work");
  const [mode, setMode] = useState<ProactiveMode>("check-in");
  const [interval, setIntervalMin] = useState<number>(10);
  const [dndUntil, setDndUntil] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusState>({
    active: false,
    remainingSeconds: 0,
    durationMin: 25,
    startedAt: null,
  });
  const [briefing, setBriefing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [p, pr, d, f] = await Promise.all([
      packApi.get(),
      proactiveApi.get(),
      dndApi.get(),
      focusApi.state(),
    ]);
    setPack(p.pack);
    setMode(pr.mode);
    setIntervalMin(pr.interval_min);
    setDndUntil(d.until);
    setFocus(f);
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 5_000);
    return () => clearInterval(t);
  }, []);

  const dndActive = dndUntil !== null && new Date(dndUntil).getTime() > Date.now();

  async function runBriefing() {
    setBusy(true);
    try {
      const r = await briefingApi.morning();
      setBriefing(r.briefing);
    } catch (e) {
      setBriefing(`⚠ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function runRecap() {
    setBusy(true);
    try {
      const r = await briefingApi.recap();
      setBriefing(r.recap);
    } catch (e) {
      setBriefing(`⚠ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto text-xs">
      <Section label="Context pack">
        <div className="flex gap-1">
          {(["work", "study", "chill", "custom"] as Pack[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={async () => {
                await packApi.set(p);
                setPack(p);
              }}
              className={clsx(
                "flex-1 rounded-md px-2 py-1",
                pack === p
                  ? "bg-passio-pulp/80 text-black"
                  : "bg-black/30 text-neutral-400 hover:text-neutral-100",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Proactive scan">
        <div className="space-y-1.5">
          <div className="flex gap-1">
            {(["check-in", "active-assist", "summary-decide"] as ProactiveMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={async () => {
                  await proactiveApi.set({ mode: m });
                  setMode(m);
                }}
                className={clsx(
                  "flex-1 rounded-md px-2 py-1 text-[10px]",
                  mode === m
                    ? "bg-passio-skinLight/40 text-passio-pulp"
                    : "bg-black/30 text-neutral-400 hover:text-neutral-100",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">every</span>
            <input
              type="number"
              min={5}
              max={60}
              value={interval}
              onChange={async (e) => {
                const v = Number(e.target.value || 10);
                await proactiveApi.set({ interval_min: v });
                setIntervalMin(v);
              }}
              className="no-drag w-16 rounded-md border border-white/10 bg-black/40 p-1"
            />
            <span className="text-neutral-500">min</span>
          </div>
        </div>
      </Section>

      <Section label="DND">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const r = await dndApi.toggle();
              setDndUntil(r.until);
            }}
            className={clsx(
              "flex-1 rounded-md px-2 py-1",
              dndActive ? "bg-red-500/30 text-red-200" : "bg-black/30 text-neutral-400 hover:text-neutral-100",
            )}
          >
            {dndActive ? "DND on — silence until " + new Date(dndUntil!).toLocaleTimeString() : "DND off"}
          </button>
        </div>
      </Section>

      <Section label="Pomodoro">
        {focus.active ? (
          <div className="flex items-center justify-between">
            <span className="font-mono text-passio-pulp">
              {formatSeconds(focus.remainingSeconds)}
            </span>
            <button
              type="button"
              onClick={async () => setFocus(await focusApi.stop())}
              className="rounded-md bg-black/40 px-2 py-1 text-neutral-300 hover:text-white"
            >
              stop
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {[15, 25, 50].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={async () => setFocus(await focusApi.start(mins))}
                className="flex-1 rounded-md bg-black/30 px-2 py-1 hover:bg-passio-skinLight/30"
              >
                {mins}m
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section label="Briefing">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={runBriefing}
            disabled={busy}
            className="flex-1 rounded-md bg-black/30 px-2 py-1 hover:bg-passio-skinLight/30 disabled:opacity-40"
          >
            morning
          </button>
          <button
            type="button"
            onClick={runRecap}
            disabled={busy}
            className="flex-1 rounded-md bg-black/30 px-2 py-1 hover:bg-passio-skinLight/30 disabled:opacity-40"
          >
            recap
          </button>
        </div>
        {briefing && (
          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-black/40 p-2 text-[11px] font-sans text-neutral-200">
            {briefing}
          </pre>
        )}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-black/20 p-2">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      {children}
    </div>
  );
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
