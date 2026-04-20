import { useEffect, useState } from "react";
import clsx from "clsx";
import { usePassioStore } from "../store";
import { calendarApi, mailApi, weatherApi } from "../ipc";

export function ClipboardChip({ onAsk }: { onAsk: (text: string) => void }) {
  const { clipboardChip, setClipboardChip } = usePassioStore();
  useEffect(() => {
    if (!clipboardChip) return;
    const t = setTimeout(() => setClipboardChip(null), 8_000);
    return () => clearTimeout(t);
  }, [clipboardChip, setClipboardChip]);
  if (!clipboardChip) return null;
  return (
    <div className="pointer-events-auto no-drag fixed right-4 top-4 z-40 max-w-[360px] animate-fade-in-up rounded-2xl border border-passio-pulp/50 bg-[#1A1422] px-3 py-2 text-[13px] shadow-[0_12px_28px_-8px_rgba(0,0,0,0.7)]">
      <div className="flex items-center gap-2">
        <span className="text-[16px]">📋</span>
        <span className="truncate text-passio-cream">{clipboardChip.text.slice(0, 50)}</span>
        <button
          type="button"
          onClick={() => {
            onAsk(clipboardChip.text);
            setClipboardChip(null);
          }}
          className="ml-auto rounded-md bg-passio-pulp px-2 py-0.5 text-[11px] font-semibold text-passio-seed"
        >
          Ask
        </button>
        <button
          type="button"
          onClick={() => setClipboardChip(null)}
          className="text-neutral-500 hover:text-neutral-200"
          aria-label="dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function PomodoroRing() {
  const { pomodoro, setPomodoro } = usePassioStore();
  const [remaining, setRemaining] = useState(pomodoro.durationMin * 60);
  useEffect(() => {
    if (!pomodoro.active || !pomodoro.startedAt) return;
    const tick = () => {
      const elapsed = (Date.now() - (pomodoro.startedAt ?? 0)) / 1000;
      const r = Math.max(0, pomodoro.durationMin * 60 - elapsed);
      setRemaining(r);
      if (r <= 0) {
        setPomodoro({ ...pomodoro, active: false });
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pomodoro, setPomodoro]);

  const pct = pomodoro.active
    ? (1 - remaining / (pomodoro.durationMin * 60)) * 100
    : 0;
  const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss = Math.floor(remaining % 60).toString().padStart(2, "0");

  return (
    <button
      type="button"
      onClick={() =>
        pomodoro.active
          ? setPomodoro({ ...pomodoro, active: false })
          : setPomodoro({ active: true, startedAt: Date.now(), durationMin: 25 })
      }
      className="no-drag relative flex h-9 w-9 items-center justify-center rounded-full"
      title={pomodoro.active ? `${mm}:${ss} · click to stop` : "Start 25m pomodoro"}
    >
      <svg className="absolute inset-0" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2E2340" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke="#ff6b9d"
          strokeWidth="2.5"
          strokeDasharray={`${pct} 100`}
          pathLength={100}
          strokeLinecap="round"
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="relative text-[11px] font-semibold text-passio-cream">
        {pomodoro.active ? mm : "25"}
      </span>
    </button>
  );
}

export function WeatherRing() {
  const [info, setInfo] = useState<{ temp: number; desc: string } | null>(null);
  useEffect(() => {
    const load = () => {
      weatherApi
        .get()
        .then((w) =>
          setInfo(w ? { temp: Math.round(w.temp_c), desc: w.description } : null),
        )
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 15 * 60_000);
    return () => clearInterval(t);
  }, []);
  if (!info) return null;
  return (
    <span
      className="flex items-center gap-1 rounded-md bg-[#1A1422] px-2 py-0.5 text-[11px] text-passio-cream"
      title={info.desc}
    >
      <span>{iconForDesc(info.desc)}</span>
      <span>{info.temp}°</span>
    </span>
  );
}

function iconForDesc(d: string): string {
  const lc = d.toLowerCase();
  if (lc.includes("rain") || lc.includes("drizzle")) return "🌧";
  if (lc.includes("snow")) return "🌨";
  if (lc.includes("storm") || lc.includes("thunder")) return "⛈";
  if (lc.includes("cloud")) return "☁";
  if (lc.includes("sun") || lc.includes("clear")) return "☀";
  if (lc.includes("fog") || lc.includes("mist")) return "🌫";
  return "🌤";
}

export function CalendarTicker() {
  const [next, setNext] = useState<{ summary: string; startsIn: number } | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await calendarApi.upcoming(3, 1);
        const now = Date.now();
        const soon = res.events.find((e) => {
          const start = new Date(e.start).getTime();
          return start - now <= 60 * 60_000 && start > now - 2 * 60_000;
        });
        if (soon) {
          const mins = Math.round((new Date(soon.start).getTime() - now) / 60_000);
          setNext({ summary: soon.summary, startsIn: mins });
        } else {
          setNext(null);
        }
      } catch {
        /* silent */
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!next) return null;
  const label = next.startsIn <= 0 ? "now" : `${next.startsIn}m`;
  return (
    <span
      className={clsx(
        "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]",
        next.startsIn <= 5
          ? "bg-amber-500/20 text-amber-200"
          : "bg-[#1A1422] text-passio-cream",
      )}
      title={next.summary}
    >
      <span>📅</span>
      <span className="truncate max-w-[110px]">{next.summary}</span>
      <span className="text-neutral-400">· {label}</span>
    </span>
  );
}

export function MailPill() {
  const [data, setData] = useState<{ count: number; preview: string | null } | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await mailApi.unread(3);
        const list = res?.emails ?? [];
        if (list.length === 0) {
          setData(null);
          return;
        }
        const first = list[0];
        setData({
          count: list.length,
          preview: first ? `${first.from.split("<")[0]!.trim()}: ${first.subject}` : null,
        });
      } catch {
        setData(null);
      }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  if (!data) return null;
  return (
    <span
      className="flex items-center gap-1 rounded-md bg-[#1A1422] px-2 py-0.5 text-[11px] text-passio-cream"
      title={data.preview ?? undefined}
    >
      <span>✉</span>
      <span>{data.count}</span>
    </span>
  );
}
