import clsx from "clsx";
import { useEffect, useState } from "react";
import {
  chatHistoryApi,
  type ChatSearchHit,
  type ConversationDetail,
  type ConversationSummary,
} from "../ipc";

/**
 * Chat history panel. Two views:
 *   - Recent conversations list (default)
 *   - Search results when a query is entered
 *
 * Clicking any row opens the conversation detail.
 */
export function HistoryPanel() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null);
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const [open, setOpen] = useState<ConversationDetail | null>(null);

  useEffect(() => {
    chatHistoryApi.list(30).then((r) => setRecent(r.conversations));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      chatHistoryApi.search(q, 30).then((r) => setHits(r.hits)).catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  if (open) {
    return (
      <div className="flex h-full flex-col text-xs">
        <div className="mb-2 flex items-center justify-between">
          <span className="uppercase tracking-wide text-neutral-400">
            conversation #{open.id}
          </span>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="rounded-md bg-black/30 px-2 py-0.5 hover:bg-passio-skinLight/30"
          >
            back
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg bg-black/20 p-2">
          {open.messages.map((m) => (
            <div
              key={m.id}
              className={clsx(
                "max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-1.5 text-[11px] leading-snug",
                m.role === "user"
                  ? "ml-auto bg-passio-skinLight/25 text-neutral-100"
                  : "bg-neutral-800/80 text-neutral-100",
              )}
            >
              {m.content}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search your chats…"
        className="no-drag rounded-lg border border-white/10 bg-black/40 p-2 focus:border-passio-pulp focus:outline-none"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hits !== null ? (
          <SearchResults hits={hits} onOpen={(id) => chatHistoryApi.get(id).then(setOpen)} />
        ) : (
          <Recent conversations={recent} onOpen={(id) => chatHistoryApi.get(id).then(setOpen)} />
        )}
      </div>
    </div>
  );
}

function SearchResults({
  hits,
  onOpen,
}: {
  hits: ChatSearchHit[];
  onOpen: (id: number) => void;
}) {
  if (hits.length === 0) {
    return <p className="mt-2 text-[11px] text-neutral-500">no matches</p>;
  }
  return (
    <ul className="space-y-1">
      {hits.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            onClick={() => h.conversationId && onOpen(h.conversationId)}
            disabled={h.conversationId === null}
            className="w-full rounded-md bg-black/30 px-2 py-1.5 text-left hover:bg-passio-skinLight/20 disabled:opacity-40"
          >
            <div className="flex items-center justify-between text-[10px] text-neutral-500">
              <span>{h.role}</span>
              <span>{new Date(h.ts).toLocaleString()}</span>
            </div>
            <div
              className="mt-0.5 text-[11px] leading-snug"
              dangerouslySetInnerHTML={{ __html: h.snippet }}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Recent({
  conversations,
  onOpen,
}: {
  conversations: ConversationSummary[];
  onOpen: (id: number) => void;
}) {
  if (conversations.length === 0) {
    return <p className="mt-2 text-[11px] text-neutral-500">no past conversations yet</p>;
  }
  return (
    <ul className="space-y-1">
      {conversations.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            className="w-full rounded-md bg-black/30 px-2 py-1.5 text-left hover:bg-passio-skinLight/20"
          >
            <div className="flex items-center justify-between text-[10px] text-neutral-500">
              <span>
                {c.mode ?? "text"} · {c.messages} msg
              </span>
              <span>{new Date(c.startedAt).toLocaleString()}</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-neutral-300">
              {c.firstMessage ?? "(empty)"}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
