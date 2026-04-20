import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { vaultApi } from "../ipc";

type Hit = { path: string; title: string | null; snippet: string; score: number };

export function VaultPanel() {
  const [root, setRoot] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [body, setBody] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newNote, setNewNote] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    vaultApi.getRoot().then((r) => setRoot(r.path)).catch(() => undefined);
    vaultApi.listTags().then((r) => setTags(r.tags.slice(0, 20))).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!root) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await vaultApi.search(q, 20);
        setHits(r.hits);
      } catch {
        setHits([]);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [query, root]);

  const load = useCallback(async (path: string) => {
    const r = await vaultApi.read(path);
    if (r) {
      setBody(r.body);
      setSelectedPath(path);
      setDirty(false);
    }
  }, []);

  async function save() {
    if (!selectedPath) return;
    setBusy(true);
    try {
      const allowOutside = !selectedPath.startsWith("passio/");
      await vaultApi.write({
        path: selectedPath,
        body,
        allow_outside_passio_subfolder: allowOutside,
      });
      setDirty(false);
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    setBusy(true);
    try {
      const r = await vaultApi.index();
      alert(`Indexed ${r.indexed}/${r.total_md} files.`);
    } finally {
      setBusy(false);
    }
  }

  async function createNote() {
    if (!newNote) return;
    const title = newNote.title.trim();
    if (!title) return;
    const rel = `passio/${title.replace(/[^a-z0-9-_ ]/gi, "-").trim()}.md`;
    await vaultApi.write({ path: rel, body: newNote.body, frontmatter: { created: new Date().toISOString() } });
    setNewNote(null);
    void load(rel);
  }

  if (!root) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="voice text-[18px] text-passio-cream">Vault not configured</p>
        <p className="max-w-[280px] text-[13px] text-neutral-300">
          Set your Obsidian vault path in Settings → Vault to enable search, read, write, and
          daily-note integration.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search vault…"
          className="no-drag flex-1 rounded-lg bg-[#241B30] px-3 py-1.5 text-[14px] text-passio-cream placeholder-neutral-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() =>
            setNewNote({
              title: `note-${new Date().toISOString().slice(0, 10)}`,
              body: "",
            })
          }
          className="no-drag rounded-md bg-passio-pulp px-2 py-1 text-[12px] font-semibold text-passio-seed"
        >
          + New
        </button>
        <button
          type="button"
          onClick={reindex}
          disabled={busy}
          className="no-drag rounded-md bg-[#2E2340] px-2 py-1 text-[12px] text-neutral-200 disabled:opacity-40"
          title="Re-index vault"
        >
          ↻
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[160px_1fr] gap-2">
        <aside className="min-h-0 space-y-2 overflow-y-auto">
          <ul className="rounded-xl border border-passio-border bg-[#120E1A] p-1.5 text-[12px]">
            {hits.length === 0 ? (
              <li className="px-2 py-2 text-neutral-500">
                {query ? "no matches" : "type to search"}
              </li>
            ) : (
              hits.map((h) => (
                <li key={h.path}>
                  <button
                    type="button"
                    onClick={() => load(h.path)}
                    className={clsx(
                      "w-full truncate rounded-md px-2 py-1 text-left",
                      selectedPath === h.path
                        ? "bg-passio-pulp/20 text-passio-pulpBright"
                        : "hover:bg-passio-pulp/10 text-neutral-200",
                    )}
                    title={h.path}
                  >
                    <span className="block truncate">{h.title || h.path}</span>
                    <span
                      className="block truncate text-[10px] text-neutral-400"
                      dangerouslySetInnerHTML={{ __html: h.snippet }}
                    />
                  </button>
                </li>
              ))
            )}
          </ul>
          {tags.length > 0 && (
            <div className="rounded-xl border border-passio-border bg-[#120E1A] p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Tags
              </p>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => setQuery(`#${t.tag}`)}
                    className="no-drag rounded bg-[#2E2340] px-1.5 py-0.5 text-[10px] text-passio-cream hover:bg-passio-pulp/30"
                  >
                    #{t.tag} <span className="text-neutral-400">· {t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-col rounded-xl border border-passio-border bg-[#120E1A] p-2">
          {newNote !== null ? (
            <>
              <input
                value={newNote.title}
                onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                className="no-drag mb-2 rounded-md bg-[#241B30] px-2 py-1 text-[13px]"
                placeholder="note title"
              />
              <textarea
                value={newNote.body}
                onChange={(e) => setNewNote({ ...newNote, body: e.target.value })}
                placeholder="start writing…"
                className="no-drag min-h-0 flex-1 resize-none rounded-md bg-[#241B30] p-2 text-[13px] text-passio-cream focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={createNote}
                  className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed"
                >
                  Save to passio/
                </button>
                <button
                  type="button"
                  onClick={() => setNewNote(null)}
                  className="no-drag rounded-md bg-[#2E2340] px-3 py-1 text-[12px] text-neutral-200"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : selectedPath ? (
            <>
              <div className="mb-1 flex items-center gap-2 text-[11px] text-neutral-400">
                <span className="truncate">{selectedPath}</span>
                {dirty && <span className="rounded bg-amber-500/20 px-1 text-amber-200">edited</span>}
                <button
                  type="button"
                  onClick={save}
                  disabled={busy || !dirty}
                  className="no-drag ml-auto rounded-md bg-passio-pulp px-2 py-0.5 text-[11px] font-semibold text-passio-seed disabled:opacity-40"
                >
                  Save
                </button>
              </div>
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setDirty(true);
                }}
                className="no-drag min-h-0 flex-1 resize-none rounded-md bg-[#241B30] p-2 font-mono text-[12px] text-passio-cream focus:outline-none"
              />
            </>
          ) : (
            <p className="py-10 text-center text-[13px] text-neutral-400">
              Search + pick a file, or click + New to create one in <code>passio/</code>.
            </p>
          )}
        </div>
      </div>

      <p className="text-[10px] text-neutral-500">Vault: {root}</p>
    </div>
  );
}
