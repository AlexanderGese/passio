import { useEffect, useState } from "react";
import { costApi } from "../ipc";

type TierRow = { tier: string; calls: number; inTokens: number; outTokens: number; dollars: number };
type CostSummary = {
  today: { total: number; rows: TierRow[] };
  week: { total: number; rows: TierRow[] };
  month: { total: number; rows: TierRow[] };
};

const TIER_COLOR: Record<string, string> = {
  economy: "#7ee787",
  standard: "#a855f7",
  power: "#ff6b9d",
  reasoning: "#ffb84d",
  tts: "#60a5fa",
  whisper: "#34d399",
  embedding: "#c084fc",
};

export function CostPanel() {
  const [s, setS] = useState<CostSummary | null>(null);

  useEffect(() => {
    costApi
      .summary()
      .then(setS)
      .catch(() => undefined);
    const t = setInterval(() => {
      costApi
        .summary()
        .then(setS)
        .catch(() => undefined);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  if (!s)
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-neutral-400">
        Crunching usage…
      </div>
    );

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <TierSection label="Today" total={s.today.total} rows={s.today.rows} />
      <TierSection label="This week" total={s.week.total} rows={s.week.rows} />
      <TierSection label="This month" total={s.month.total} rows={s.month.rows} />
      <p className="text-[11px] text-neutral-500">
        Estimated — based on published OpenAI rates. Token counts come from the SDK response.
      </p>
    </div>
  );
}

function TierSection({ label, total, rows }: { label: string; total: number; rows: TierRow[] }) {
  return (
    <section className="rounded-xl border border-passio-border bg-[#1F1628] p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-300">
          {label}
        </h3>
        <span className="voice text-[20px] font-semibold text-passio-cream">
          ${total.toFixed(3)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-neutral-500">no usage</p>
      ) : (
        <>
          <StackedBar rows={rows} total={total} />
          <ul className="mt-2 space-y-1">
            {rows.map((r) => (
              <li key={r.tier} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: TIER_COLOR[r.tier] ?? "#888" }}
                  />
                  <span className="capitalize text-neutral-200">{r.tier}</span>
                  <span className="text-neutral-500">
                    {r.calls}× · {fmt(r.inTokens)}/{fmt(r.outTokens)}
                  </span>
                </span>
                <span className="font-mono text-neutral-200">${r.dollars.toFixed(4)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function StackedBar({ rows, total }: { rows: TierRow[]; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#120E1A]">
      {rows.map((r) => (
        <div
          key={r.tier}
          style={{
            width: `${(r.dollars / total) * 100}%`,
            background: TIER_COLOR[r.tier] ?? "#888",
          }}
        />
      ))}
    </div>
  );
}

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
