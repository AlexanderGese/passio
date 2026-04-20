import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { todoApi } from "../ipc";

type Todo = {
  id: number;
  text: string;
  done: boolean;
  priority: number;
  dueAt: string | null;
  project: string | null;
  goalId: number | null;
};

export function TodosPanel() {
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState("");
  const [priority, setPriority] = useState(0);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await todoApi.list(filter);
      setTodos(res.todos as Todo[]);
    } catch {
      /* silent */
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await todoApi.add({ text, priority, due_at: due || undefined });
      setDraft("");
      setDue("");
      setPriority(0);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function complete(id: number) {
    await todoApi.done(id);
    void refresh();
  }

  async function del(id: number) {
    await todoApi.delete(id);
    void refresh();
  }

  const sorted = [...todos].sort(
    (a, b) => b.priority - a.priority || Number(a.done) - Number(b.done),
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-1 rounded-xl border border-passio-border bg-[#120E1A] p-1">
        {(["open", "done", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={clsx(
              "flex-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors no-drag",
              filter === f
                ? "bg-passio-pulp text-passio-seed"
                : "text-neutral-300 hover:text-passio-pulpBright",
            )}
          >
            {f[0]!.toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-xl border border-passio-border bg-[#120E1A] p-2">
        {sorted.length === 0 ? (
          <li className="py-10 text-center text-[13px] text-neutral-400">
            Nothing here · add one below
          </li>
        ) : (
          sorted.map((t) => (
            <li
              key={t.id}
              className={clsx(
                "flex items-start gap-2 rounded-lg border border-passio-border/50 bg-[#1F1628] px-3 py-2 text-[14px]",
                t.done && "opacity-60",
              )}
            >
              <button
                type="button"
                onClick={() => (t.done ? undefined : complete(t.id))}
                className={clsx(
                  "mt-0.5 h-4 w-4 shrink-0 rounded-md border-2 no-drag",
                  t.done
                    ? "border-passio-pulpBright bg-passio-pulpBright text-passio-seed"
                    : "border-passio-border hover:border-passio-pulp",
                )}
                aria-label={t.done ? "done" : "mark done"}
                title="toggle"
              >
                {t.done ? "✓" : ""}
              </button>
              <div className="min-w-0 flex-1">
                <p className={clsx("allow-select", t.done && "line-through")}>{t.text}</p>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-neutral-400">
                  {t.priority > 0 && (
                    <span className="rounded bg-passio-pulp/20 px-1.5 py-0.5 text-passio-pulpBright">
                      P{t.priority}
                    </span>
                  )}
                  {t.dueAt && <span>📅 {t.dueAt.slice(0, 10)}</span>}
                  {t.project && <span>#{t.project}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => del(t.id)}
                className="no-drag text-[12px] text-neutral-500 hover:text-red-400"
                aria-label="delete"
                title="delete"
              >
                ✕
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="space-y-2 rounded-xl border border-passio-border bg-[#241B30] p-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void add();
          }}
          placeholder="Add a todo…"
          className="no-drag w-full rounded-lg bg-[#1A1422] px-3 py-2 text-[14px] text-passio-cream placeholder-neutral-500 focus:outline-none"
        />
        <div className="flex items-center gap-2 text-[12px]">
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="no-drag rounded-md bg-[#1A1422] px-2 py-1 text-passio-cream"
          >
            <option value={0}>P0</option>
            <option value={1}>P1</option>
            <option value={2}>P2</option>
            <option value={3}>P3</option>
          </select>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="no-drag flex-1 rounded-md bg-[#1A1422] px-2 py-1 text-passio-cream"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || !draft.trim()}
            className="no-drag rounded-md bg-passio-pulp px-3 py-1 font-semibold text-passio-seed disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
