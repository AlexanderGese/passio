import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { noteApi, spotlightApi, todoApi } from "../ipc";
import { usePassioStore } from "../store";
import {
  EMOJIS,
  SPOTLIGHT_SCOPES,
  SYSTEM_ACTIONS,
  type SpotlightScope,
} from "./spotlight_sources";

type Hit = {
  kind:
    | "todo"
    | "fact"
    | "note"
    | "goal"
    | "conversation"
    | "file"
    | "vault"
    | "app"
    | "ask"
    | "emoji"
    | "clipboard"
    | "system"
    | "create-todo"
    | "create-note";
  id: number;
  title: string;
  snippet: string;
  score: number;
  exec?: string;
  path?: string;
  icon?: string;
  iconUrl?: string;
  emoji?: string;
  actionId?: string;
  clipText?: string;
  askText?: string;
};

type ParsedQuery =
  | { mode: "ask"; query: string; raw: string }
  | { mode: "emoji"; query: string; raw: string }
  | { mode: "clipboard"; query: string; raw: string }
  | { mode: "scope"; scope: SpotlightScope; query: string; raw: string }
  | { mode: "default"; query: string; raw: string };

function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (!trimmed) return { mode: "default", query: "", raw };
  if (trimmed.startsWith("?")) {
    return { mode: "ask", query: trimmed.slice(1).trim(), raw };
  }
  if (trimmed.startsWith(":")) {
    return { mode: "emoji", query: trimmed.slice(1).trim().toLowerCase(), raw };
  }
  if (trimmed.toLowerCase().startsWith("v:")) {
    return { mode: "clipboard", query: trimmed.slice(2).trim().toLowerCase(), raw };
  }
  const scopeMatch = trimmed.match(/^@(\w+)(?:\s+(.*))?$/);
  if (scopeMatch) {
    const s = scopeMatch[1]!.toLowerCase();
    if ((SPOTLIGHT_SCOPES as readonly string[]).includes(s)) {
      return {
        mode: "scope",
        scope: s as SpotlightScope,
        query: (scopeMatch[2] ?? "").trim(),
        raw,
      };
    }
  }
  return { mode: "default", query: trimmed, raw };
}

export function Spotlight() {
  const { spotlightOpen, setSpotlightOpen, setTab, setExpanded, expanded } =
    usePassioStore();
  const [query, setQuery] = useState("");
  const [backendHits, setBackendHits] = useState<Hit[]>([]);
  const [clipboardItems, setClipboardItems] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuery(query), [query]);

  // Window geometry is owned by Spotlight while it's open.
  const expandedRef = useRef(expanded);
  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);
  useEffect(() => {
    void invoke("set_spotlight_window", {
      open: spotlightOpen,
      bubbleExpanded: expandedRef.current,
    }).catch(() => undefined);
  }, [spotlightOpen]);

  useEffect(() => {
    if (spotlightOpen) {
      setTimeout(() => inputRef.current?.focus(), 20);
      setQuery("");
      setBackendHits([]);
      setSelected(0);
      // Refresh clipboard history once on open.
      invoke<string[]>("clipboard_history_list")
        .then((items) => setClipboardItems(items))
        .catch(() => setClipboardItems([]));
    }
  }, [spotlightOpen]);

  // Backend search — skip when we're in a prefix mode that doesn't need it.
  useEffect(() => {
    if (!spotlightOpen) return;
    if (parsed.mode === "ask" || parsed.mode === "emoji" || parsed.mode === "clipboard") {
      setBackendHits([]);
      return;
    }
    const q = parsed.query;
    if (!q) {
      setBackendHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await spotlightApi.search(q);
        setBackendHits(res.hits as Hit[]);
      } catch {
        setBackendHits([]);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [spotlightOpen, parsed.mode, parsed.query]);

  // Merge all sources into the final visible list.
  const hits: Hit[] = useMemo(() => {
    const q = parsed.query;
    const out: Hit[] = [];

    if (parsed.mode === "ask") {
      out.push({
        kind: "ask",
        id: -1,
        title: q ? `Ask Passio: ${q}` : "Ask Passio…",
        snippet: q ? "Hands the prompt to chat" : "Type a question",
        score: 1,
        askText: q,
      });
      return out;
    }

    if (parsed.mode === "emoji") {
      const matches = EMOJIS.filter((e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.keywords.some((k) => k.includes(q)),
      ).slice(0, 20);
      for (const e of matches) {
        out.push({
          kind: "emoji",
          id: e.emoji.codePointAt(0) ?? 0,
          title: `${e.emoji}  :${e.name}:`,
          snippet: e.keywords.join(", ") || "paste emoji",
          score: 1,
          emoji: e.emoji,
        });
      }
      return out;
    }

    if (parsed.mode === "clipboard") {
      const filtered = q
        ? clipboardItems.filter((t) => t.toLowerCase().includes(q))
        : clipboardItems;
      for (const [i, text] of filtered.slice(0, 20).entries()) {
        out.push({
          kind: "clipboard",
          id: i,
          title: text.slice(0, 80).replace(/\s+/g, " "),
          snippet: text.length > 80 ? `${text.length} chars` : "click / enter to paste",
          score: 1,
          clipText: text,
        });
      }
      return out;
    }

    // Default + scope modes share the backend-hit pipeline.
    let backend = backendHits;
    if (parsed.mode === "scope") {
      backend = backend.filter((h) => {
        const s = parsed.scope;
        if (s === "conv") return h.kind === "conversation";
        return h.kind === s;
      });
    }
    out.push(...backend);

    // System actions — always eligible, matched against the query.
    if (q) {
      const qLower = q.toLowerCase();
      for (const a of SYSTEM_ACTIONS) {
        const match =
          a.label.toLowerCase().includes(qLower) ||
          a.keywords.some((k) => k.includes(qLower));
        if (match) {
          out.push({
            kind: "system",
            id: hash32(a.id),
            title: a.label,
            snippet: a.id,
            score: 0.5,
            actionId: a.id,
            icon: a.icon,
          });
        }
      }
    }

    // Create-from-query — visible when there's a non-empty query. Always
    // shown after real hits so the user still sees their matches first.
    if (q && parsed.mode !== "scope") {
      out.push({
        kind: "create-todo",
        id: -100,
        title: `➕ Add todo: ${q}`,
        snippet: "Passio todos",
        score: 0,
        askText: q,
      });
      out.push({
        kind: "create-note",
        id: -101,
        title: `📝 Save note: ${q}`,
        snippet: "Passio notes",
        score: 0,
        askText: q,
      });
      out.push({
        kind: "ask",
        id: -102,
        title: `💬 Ask Passio: ${q}`,
        snippet: "Opens chat",
        score: 0,
        askText: q,
      });
    }

    return out;
  }, [parsed, backendHits, clipboardItems]);

  useEffect(() => {
    setSelected(0);
  }, [hits.length]);

  // Grow/shrink the window to the content height.
  useEffect(() => {
    if (!spotlightOpen) return;
    const INPUT_H = 76;
    const ROW_H = 52;
    const MAX_ROWS = 8;
    const visible = Math.min(hits.length, MAX_ROWS);
    let height = INPUT_H;
    if (visible > 0) height += visible * ROW_H + 8;
    else if (parsed.raw.trim()) height += 44;
    invoke("resize_spotlight", { height }).catch(() => undefined);
  }, [hits.length, parsed.raw, spotlightOpen]);

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
        const hit = hits[selected];
        if (hit) void openHit(hit);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [spotlightOpen, hits, selected, setSpotlightOpen]);

  async function openHit(h: Hit) {
    // --- synthetic kinds ---
    if (h.kind === "ask" && h.askText) {
      setSpotlightOpen(false);
      setExpanded(true);
      setTab("chat");
      // Defer the prefill until the chat panel has mounted.
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("passio-chat-prefill", { detail: h.askText }),
        );
      }, 120);
      return;
    }
    if (h.kind === "create-todo" && h.askText) {
      try {
        await todoApi.add({ text: h.askText });
      } catch (err) {
        console.error("todo add failed", err);
      }
      setSpotlightOpen(false);
      return;
    }
    if (h.kind === "create-note" && h.askText) {
      try {
        await noteApi.save({ body: h.askText });
      } catch (err) {
        console.error("note save failed", err);
      }
      setSpotlightOpen(false);
      return;
    }
    if (h.kind === "emoji" && h.emoji) {
      setSpotlightOpen(false);
      try {
        await invoke("clipboard_paste", { text: h.emoji });
      } catch (err) {
        console.error("emoji paste failed", err);
      }
      return;
    }
    if (h.kind === "clipboard" && h.clipText !== undefined) {
      setSpotlightOpen(false);
      try {
        await invoke("clipboard_paste", { text: h.clipText });
      } catch (err) {
        console.error("clipboard paste failed", err);
      }
      return;
    }
    if (h.kind === "system" && h.actionId) {
      setSpotlightOpen(false);
      try {
        await invoke("run_system_action", { id: h.actionId });
      } catch (err) {
        console.error("system action failed", err);
      }
      return;
    }

    // --- backend kinds ---
    if (h.kind === "app" && h.exec) {
      try {
        await invoke("launch_app_exec", { exec: h.exec });
      } catch (err) {
        console.error("launch_app_exec failed", err);
      }
      setSpotlightOpen(false);
      return;
    }
    if ((h.kind === "file" || h.kind === "vault") && h.path) {
      try {
        await openPath(h.path);
      } catch (err) {
        console.error("openPath failed", err);
      }
      setSpotlightOpen(false);
      return;
    }
    setExpanded(true);
    if (h.kind === "todo" || h.kind === "goal") setTab("do");
    else if (h.kind === "conversation") setTab("chat");
    else setTab("know");
    setSpotlightOpen(false);
  }

  if (!spotlightOpen) return null;

  const showResults = hits.length > 0 || parsed.raw.trim();

  return (
    <div className="no-drag fixed inset-0 flex flex-col overflow-hidden rounded-2xl border border-passio-pulp/40 bg-[#140F1C]/95 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.95),0_0_0_1px_rgba(168,85,247,0.35),0_0_120px_-10px_rgba(168,85,247,0.45)]">
      <div className="flex shrink-0 items-center gap-3 px-5 py-4">
        <span className="text-[22px]">🍇</span>
        {parsed.mode === "scope" && (
          <span className="rounded-full border border-passio-pulp/40 bg-passio-pulp/10 px-2 py-0.5 text-[11px] uppercase tracking-wider text-passio-pulpBright">
            @{parsed.scope}
          </span>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholderFor(parsed.mode)}
          className="w-full bg-transparent text-[22px] font-light text-passio-cream placeholder-neutral-500 focus:outline-none"
        />
        <kbd className="rounded border border-passio-border bg-[#241B30] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-400">
          esc
        </kbd>
      </div>
      {showResults && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-passio-border/50">
          {hits.length > 0 ? (
            <ul>
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.id}-${i}`}>
                  <button
                    type="button"
                    onClick={() => void openHit(h)}
                    onMouseEnter={() => setSelected(i)}
                    className={clsx(
                      "flex w-full items-start gap-3 px-5 py-2.5 text-left transition-colors",
                      i === selected ? "bg-passio-pulp/20" : "hover:bg-passio-pulp/10",
                    )}
                  >
                    {h.iconUrl ? (
                      <img
                        src={h.iconUrl}
                        alt=""
                        className="mt-0.5 h-6 w-6 shrink-0 rounded"
                      />
                    ) : (
                      <span className="mt-0.5 text-[16px]">{h.icon ?? iconFor(h.kind)}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-passio-cream">
                        {h.title}
                      </span>
                      <span className="block truncate text-[12px] text-neutral-400">
                        {h.snippet || hintFor(h)}
                      </span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                      {h.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-3 text-[13px] text-neutral-500">no matches</p>
          )}
        </div>
      )}
    </div>
  );
}

function placeholderFor(mode: ParsedQuery["mode"]): string {
  if (mode === "ask") return "Ask Passio anything…";
  if (mode === "emoji") return "emoji name (e.g. fire, rocket)…";
  if (mode === "clipboard") return "filter recent clipboard…";
  if (mode === "scope") return "search within scope…";
  return "apps, files, notes, ? ask, : emoji, v: clipboard, @scope…";
}

function iconFor(k: Hit["kind"]): string {
  switch (k) {
    case "ask":
      return "💬";
    case "emoji":
      return "😀";
    case "clipboard":
      return "📋";
    case "system":
      return "⚙";
    case "create-todo":
      return "➕";
    case "create-note":
      return "📝";
    case "app":
      return "🚀";
    case "todo":
      return "✓";
    case "fact":
      return "📝";
    case "note":
      return "🗒";
    case "goal":
      return "🎯";
    case "conversation":
      return "💬";
    case "file":
      return "📁";
    case "vault":
      return "📚";
    default:
      return "•";
  }
}

function hintFor(h: Hit): string {
  if (h.kind === "app") return h.path?.split("/").pop() ?? "";
  if (h.path) return h.path;
  return "";
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h & 0x7fffffff;
}
