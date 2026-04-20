import { useEffect, useState } from "react";
import { vaultApi } from "../../ipc";
import { Section } from "./_shared";

export function VaultSection() {
  const [path, setPath] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [indexed, setIndexed] = useState<{ indexed: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof vaultApi.status>> | null>(null);
  const [dailyTpl, setDailyTpl] = useState<string>("daily/YYYY-MM-DD.md");
  const [dailySaved, setDailySaved] = useState(false);

  const refreshStatus = async () => {
    try {
      const s = await vaultApi.status();
      setStatus(s);
      setDailyTpl(s.dailyNoteTemplate);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    vaultApi
      .getRoot()
      .then((r) => {
        setSaved(r.path);
        if (r.path) setPath(r.path);
      })
      .catch(() => undefined);
    void refreshStatus();
    const t = setInterval(() => void refreshStatus(), 5_000);
    return () => clearInterval(t);
  }, []);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const trimmed = path.trim();
      await vaultApi.setRoot(trimmed ? trimmed : null);
      setSaved(trimmed ? trimmed : null);
      if (trimmed) {
        const r = await vaultApi.index();
        setIndexed({ indexed: r.indexed, total: r.total_md });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    setBusy(true);
    try {
      const r = await vaultApi.index();
      setIndexed({ indexed: r.indexed, total: r.total_md });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      label="Obsidian vault"
      hint="Full two-way integration: chat reads + writes vault notes, daily recaps append, memory/spotlight searches include vault, and new notes default to the passio/ subfolder."
    >
      <div className="space-y-2">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/home/you/Documents/ObsidianVault"
          className="no-drag w-full rounded-md border border-passio-border bg-[#241B30] p-2 text-[14px] focus:border-passio-pulp focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save + index"}
          </button>
          {saved && (
            <button
              type="button"
              onClick={reindex}
              disabled={busy}
              className="no-drag rounded-md bg-[#2E2340] px-3 py-1 text-[12px] text-neutral-200 disabled:opacity-40"
            >
              Re-index now
            </button>
          )}
          {saved && (
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  await vaultApi.setRoot(null);
                  setPath("");
                  setSaved(null);
                  setIndexed(null);
                } finally {
                  setBusy(false);
                }
              }}
              className="no-drag ml-auto rounded-md bg-red-500/20 px-3 py-1 text-[12px] text-red-200"
            >
              Unlink
            </button>
          )}
        </div>
        {saved && (
          <p className="text-[12px] text-emerald-300">Connected · {saved}</p>
        )}
        {indexed && (
          <p className="text-[11px] text-neutral-400">
            Indexed {indexed.indexed}/{indexed.total} markdown files.
          </p>
        )}
        {err && <p className="text-[12px] text-red-300">{err}</p>}

        {status && saved && (
          <div className="mt-3 space-y-1 rounded-md border border-passio-border bg-[#120E1A] p-2 text-[11px]">
            <p className="font-semibold uppercase tracking-wider text-neutral-400">
              Sync status
            </p>
            <p className="text-neutral-200">
              watcher{" "}
              <span
                className={
                  status.watcherActive ? "text-emerald-300" : "text-red-300"
                }
              >
                {status.watcherActive ? "● active" : "● inactive"}
              </span>
              {" · "}
              {status.notesIndexed} notes indexed
            </p>
            <p className="text-neutral-400">todo.md → <code>{status.todoMdPath}</code></p>
            <p className="text-neutral-400">daily note → <code>{status.dailyNoteTemplate}</code></p>
          </div>
        )}

        {saved && (
          <div className="mt-2 space-y-1">
            <label className="block text-[11px] text-neutral-300">
              Daily-note template (supports YYYY / MM / DD / YYYY-MM-DD tokens)
              <input
                value={dailyTpl}
                onChange={(e) => {
                  setDailyTpl(e.target.value);
                  setDailySaved(false);
                }}
                placeholder="daily/YYYY-MM-DD.md"
                className="no-drag mt-1 w-full rounded-md bg-[#241B30] p-1.5 font-mono text-[12px] text-passio-cream"
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                await vaultApi.setDailyTemplate(dailyTpl.trim() || "daily/YYYY-MM-DD.md");
                setDailySaved(true);
                setTimeout(() => setDailySaved(false), 1800);
                void refreshStatus();
              }}
              className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed"
            >
              {dailySaved ? "✓ saved" : "Save template"}
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}
