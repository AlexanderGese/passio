import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { spotlightApi } from "../ipc";
import { usePassioStore } from "../store";

type Hit = {
  kind: "todo" | "fact" | "note" | "goal" | "conversation" | "file" | "vault";
  id: number;
  title: string;
  snippet: string;
  score: number;
};

export function Spotlight() {
  const { spotlightOpen, setSpotlightOpen, setTab, setExpanded } = usePassioStore();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (spotlightOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
      setQuery("");
      setHits([]);
      setSelected(0);
    }
  }, [spotlightOpen]);

  useEffect(() => {
    if (!spotlightOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSpotlightOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, hits.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter") {
        const h = hits[selected];
        if (h) open(h);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [spotlightOpen, hits, selected, setSpotlightOpen]);

  useEffect(() => {
    if (!spotlightOpen || !query.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await spotlightApi.search(query.trim());
        setHits(res.hits);
        setSelected(0);
      } catch {
        setHits([]);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [query, spotlightOpen]);

  function open(h: Hit) {
    setExpanded(true);
    if (h.kind === "todo" || h.kind === "goal") setTab("do");
    else if (h.kind === "conversation") setTab("chat");
    else setTab("know");
    setSpotlightOpen(false);
  }

  if (!spotlightOpen) return null;
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-20"
      onClick={() => setSpotlightOpen(false)}
    >
      <div
        className="no-drag w-[440px] overflow-hidden rounded-2xl border border-passio-pulp/40 bg-[#1A1422] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9),0_0_0_1px_rgba(168,85,247,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search todos, goals, memories, notes…"
          className="w-full bg-transparent px-4 py-3 text-[15px] text-passio-cream placeholder-neutral-500 focus:outline-none"
        />
        {hits.length > 0 && (
          <ul className="max-h-[360px] overflow-y-auto border-t border-passio-border">
            {hits.map((h, i) => (
              <li key={`${h.kind}-${h.id}`}>
                <button
                  type="button"
                  onClick={() => open(h)}
                  className={clsx(
                    "flex w-full items-start gap-3 px-4 py-2 text-left",
                    i === selected
                      ? "bg-passio-pulp/15"
                      : "hover:bg-passio-pulp/10",
                  )}
                >
                  <span className="mt-0.5 text-[14px]">{iconFor(h.kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-passio-cream">{h.title}</span>
                    <span className="block truncate text-[12px] text-neutral-400">
                      {h.snippet}
                    </span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                    {h.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function iconFor(k: Hit["kind"]): string {
  return k === "todo"
    ? "✓"
    : k === "fact"
      ? "📝"
      : k === "note"
        ? "🗒"
        : k === "goal"
          ? "🎯"
          : k === "conversation"
            ? "💬"
            : k === "file"
              ? "📁"
              : "📚";
}
