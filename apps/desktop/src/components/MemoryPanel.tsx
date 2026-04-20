import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { memoryApi } from "../ipc";

type MemoryRow = {
  kind: "fact" | "note" | "entity";
  id: number;
  ts: string;
  title: string | null;
  content: string;
  source: string | null;
  subject: string | null;
  confidence: number | null;
};

export function MemoryPanel() {
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "fact" | "note" | "entity">("all");
  const [editing, setEditing] = useState<{ id: number; kind: string; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await memoryApi.browse({ query: query || undefined, kind, limit: 200 });
      setRows(res.rows);
    } catch {
      /* silent */
    }
  }, [query, kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function del(row: MemoryRow) {
    if (!confirm(`Delete this ${row.kind}?\n\n${row.content.slice(0, 80)}…`)) return;
    await memoryApi.delete({ kind: row.kind, id: row.id });
    void refresh();
  }

  async function save() {
    if (!editing) return;
    await memoryApi.update({ kind: editing.kind, id: editing.id, content: editing.text });
    setEditing(null);
    void refresh();
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search…"
          className="no-drag flex-1 rounded-lg bg-[#241B30] px-3 py-1.5 text-[14px] text-passio-cream placeholder-neutral-500 focus:outline-none"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="no-drag rounded-lg bg-[#241B30] px-2 py-1.5 text-[13px] text-passio-cream"
        >
          <option value="all">all</option>
          <option value="fact">facts</option>
          <option value="note">notes</option>
          <option value="entity">entities</option>
        </select>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-xl border border-passio-border bg-[#120E1A] p-2">
        {rows.length === 0 ? (
          <li className="py-10 text-center text-[13px] text-neutral-400">
            No memories match — remember something in chat?
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={`${r.kind}-${r.id}`}
              className="rounded-lg border border-passio-border/50 bg-[#1F1628] px-3 py-2 text-[13px]"
            >
              <div className="flex items-start gap-2">
                <span
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    r.kind === "fact"
                      ? "bg-passio-pulp/20 text-passio-pulpBright"
                      : r.kind === "note"
                        ? "bg-passio-skin/20 text-passio-skinLight"
                        : "bg-emerald-500/20 text-emerald-300",
                  )}
                >
                  {r.kind}
                </span>
                <div className="min-w-0 flex-1">
                  {editing?.id === r.id && editing.kind === r.kind ? (
                    <textarea
                      value={editing.text}
                      onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                      rows={3}
                      className="no-drag w-full rounded bg-[#1A1422] p-2 text-passio-cream focus:outline-none"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-passio-cream allow-select">
                      {r.content}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-neutral-400">
                    {r.subject && <span>{r.subject}</span>}
                    {r.source && <span>· {r.source}</span>}
                    {r.confidence !== null && <span>· {Math.round(r.confidence * 100)}%</span>}
                    <span>· {r.ts.slice(0, 10)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {editing?.id === r.id && editing.kind === r.kind ? (
                    <>
                      <button
                        type="button"
                        onClick={save}
                        className="no-drag rounded-md bg-passio-pulp px-2 py-0.5 text-[11px] text-passio-seed"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="no-drag rounded-md bg-[#2E2340] px-2 py-0.5 text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ id: r.id, kind: r.kind, text: r.content })
                        }
                        className="no-drag text-[11px] text-neutral-400 hover:text-passio-pulpBright"
                      >
                        edit
                      </button>
                      <button
                        type="button"
                        onClick={() => del(r)}
                        className="no-drag text-[11px] text-neutral-500 hover:text-red-400"
                      >
                        delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="text-[11px] text-neutral-400">
        {rows.length} row{rows.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
