import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { reflectionApi } from "../ipc";

type Proposal = {
  id: number;
  ts: string;
  kind: "add_fact" | "update_fact" | "forget_fact";
  subject: string | null;
  content: string;
  reasoning: string;
  status: "pending" | "approved" | "rejected";
  targetFactId: number | null;
};

export function ReflectionPanel() {
  const [items, setItems] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await reflectionApi.pending();
    setItems(res.proposals);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(id: number, approve: boolean) {
    await reflectionApi.resolve({ id, approve });
    void refresh();
  }

  async function runNow() {
    setBusy(true);
    try {
      await reflectionApi.runNow();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] uppercase tracking-[0.12em] text-neutral-300">
          Proposed updates · {items.length}
        </span>
        <button
          type="button"
          onClick={runNow}
          disabled={busy}
          className="no-drag rounded-md bg-passio-pulp px-2 py-1 text-[12px] font-semibold text-passio-seed disabled:opacity-40"
        >
          {busy ? "Reflecting…" : "Reflect now"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <div className="text-[28px]">🌙</div>
          <p className="voice text-[16px] text-passio-cream">No proposals</p>
          <p className="text-[12px] text-neutral-400">
            Runs nightly at 22:00. Passio reviews today's events and proposes
            facts to add, update, or forget.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {items.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-passio-border bg-[#1F1628] p-3"
            >
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider">
                <span
                  className={clsx(
                    "rounded px-1.5 py-0.5",
                    p.kind === "add_fact"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : p.kind === "update_fact"
                        ? "bg-passio-pulp/20 text-passio-pulpBright"
                        : "bg-red-500/20 text-red-300",
                  )}
                >
                  {p.kind.replace("_", " ")}
                </span>
                <span className="text-neutral-400">{p.ts.slice(0, 16).replace("T", " ")}</span>
              </div>
              {p.subject && (
                <p className="mt-1 text-[12px] font-semibold text-passio-cream">{p.subject}</p>
              )}
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-passio-cream">{p.content}</p>
              <p className="mt-1 text-[11px] italic text-neutral-400">{p.reasoning}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => act(p.id, true)}
                  className="no-drag flex-1 rounded-md bg-passio-pulp py-1 text-[12px] font-semibold text-passio-seed hover:bg-passio-pulpBright"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => act(p.id, false)}
                  className="no-drag flex-1 rounded-md bg-[#2E2340] py-1 text-[12px] text-neutral-200"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
