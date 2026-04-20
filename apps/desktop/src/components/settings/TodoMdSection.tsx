import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Section } from "./_shared";

/**
 * Configure the plain-markdown Todo file Passio syncs with. Default points
 * at ~/.vault/Main/Todo.md. User edits outside the `<!-- passio:todos:* -->`
 * block get imported as new todos; Passio mirrors the DB back into the
 * block.
 */
export function TodoMdSection() {
  const [path, setPath] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await invoke<{ path: string }>("sidecar_passthrough", {
        method: "passio.todoMd.getPath",
        params: {},
      });
      setPath(r.path);
    })();
  }, []);

  async function save() {
    await invoke("sidecar_passthrough", {
      method: "passio.todoMd.setPath",
      params: { path },
    });
    setStatus("saved");
    setTimeout(() => setStatus(null), 1500);
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await invoke<{ imported: number; mirrored: number; path: string }>(
        "sidecar_passthrough",
        { method: "passio.todoMd.sync", params: {} },
      );
      setStatus(`Imported ${r.imported} · Mirrored ${r.mirrored}`);
      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      setStatus(`⚠ ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <Section
        label="Todo.md path"
        hint="Plain markdown file Passio mirrors todos into. Compatible with Obsidian, Notion, any editor. Works two-way: edit outside the Passio block to add todos."
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="~/.vault/Main/Todo.md"
            className="no-drag flex-1 rounded-lg border border-passio-border bg-passio-panel px-3 py-2 text-[14px] text-passio-cream placeholder-neutral-500 focus:border-passio-pulp focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={!path.trim()}
            className="rounded-lg bg-passio-pulp px-3 py-2 text-[14px] font-semibold text-passio-seed hover:bg-passio-pulpBright disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </Section>
      <Section
        label="Sync now"
        hint="Passio auto-syncs at launch, every 15 min, and at 09:00 daily. Use this to force an immediate pass."
      >
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className="w-full rounded-lg bg-passio-skin px-3 py-2 text-[14px] font-medium text-passio-cream hover:bg-passio-skinLight disabled:opacity-40"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        {status && <p className="mt-2 text-[13px] text-emerald-300">{status}</p>}
      </Section>
    </div>
  );
}
