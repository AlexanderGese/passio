import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { costApi, dataApi } from "../../ipc";
import { Section } from "./_shared";

export function AboutSection() {
  const [version, setVersion] = useState<string>("…");
  const [status, setStatus] = useState<string>("");
  const [downloading, setDownloading] = useState<{ done: number; total?: number } | null>(null);
  const [ready, setReady] = useState<{ version: string; notes?: string } | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  async function checkNow() {
    setStatus("checking…");
    try {
      const update = await check();
      if (!update) {
        setStatus("up to date");
        return;
      }
      setStatus(`update available · v${update.version}`);
      setReady({ version: update.version, ...(update.body ? { notes: update.body } : {}) });
    } catch (err) {
      setStatus(`⚠ ${(err as Error).message}`);
    }
  }

  async function installNow() {
    setStatus("downloading…");
    setDownloading({ done: 0 });
    try {
      const update = await check();
      if (!update) {
        setStatus("no update");
        return;
      }
      let total: number | undefined;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? undefined;
        if (event.event === "Progress")
          setDownloading((d) => ({
            done: (d?.done ?? 0) + event.data.chunkLength,
            ...(total !== undefined ? { total } : {}),
          }));
        if (event.event === "Finished") setDownloading(null);
      });
      setStatus("installed · relaunching");
      await relaunch();
    } catch (err) {
      setStatus(`⚠ ${(err as Error).message}`);
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-2 text-[14px]">
      <Section label="About" hint="What's installed and how to check for updates.">
        <p className="text-neutral-200">
          Passio <code className="text-passio-pulp">v{version}</code>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={checkNow}
            className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed"
          >
            Check for updates
          </button>
          {ready && (
            <button
              type="button"
              onClick={installNow}
              disabled={!!downloading}
              className="no-drag rounded-md bg-passio-pulpBright px-3 py-1 text-[12px] font-semibold text-passio-seed disabled:opacity-40"
            >
              {downloading
                ? `downloading ${downloading.total ? Math.round((downloading.done / downloading.total) * 100) + "%" : ""}`
                : `Install v${ready.version} + relaunch`}
            </button>
          )}
          {status && <span className="text-[11px] text-neutral-300">{status}</span>}
        </div>
        {ready?.notes && (
          <details className="mt-2 text-[12px] text-neutral-300">
            <summary className="cursor-pointer text-passio-pulpBright">release notes</summary>
            <pre className="whitespace-pre-wrap">{ready.notes}</pre>
          </details>
        )}
      </Section>
      <BudgetBlock />
      <DataPortabilityBlock />
    </div>
  );
}

function BudgetBlock() {
  const [daily, setDaily] = useState<string>("");
  const [monthly, setMonthly] = useState<string>("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    costApi
      .getBudget()
      .then((b) => {
        setDaily(b.daily ? String(b.daily) : "");
        setMonthly(b.monthly ? String(b.monthly) : "");
      })
      .catch(() => undefined);
  }, []);
  async function save() {
    const body: { daily?: number; monthly?: number } = {};
    if (daily.trim()) body.daily = Number(daily);
    if (monthly.trim()) body.monthly = Number(monthly);
    await costApi.setBudget(body);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  return (
    <Section
      label="Budget alerts"
      hint="Spend thresholds (USD). When passed, a bubble fires. Left blank = no alert. Checked every hour."
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col text-[12px] text-neutral-300">
          daily
          <input
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
            type="number"
            step="0.1"
            min="0"
            placeholder="e.g. 0.50"
            className="no-drag mt-1 rounded-md border border-passio-border bg-passio-panel px-2 py-1 text-passio-cream"
          />
        </label>
        <label className="flex flex-col text-[12px] text-neutral-300">
          monthly
          <input
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            type="number"
            step="1"
            min="0"
            placeholder="e.g. 10"
            className="no-drag mt-1 rounded-md border border-passio-border bg-passio-panel px-2 py-1 text-passio-cream"
          />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed"
        >
          Save budgets
        </button>
        {saved && <span className="text-[11px] text-emerald-300">✓ saved</span>}
      </div>
    </Section>
  );
}

function DataPortabilityBlock() {
  const [dest, setDest] = useState(`${homeGuess()}/passio-export.tar.gz`);
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState<null | "exp" | "imp">(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function doExport() {
    setBusy("exp");
    setMsg(null);
    try {
      const r = await dataApi.export(dest.trim());
      setMsg(`✓ Exported ${(r.bytes / 1024).toFixed(0)} KB → ${r.path}`);
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  async function doImport() {
    if (!confirm("This will overwrite your current Passio state. Existing files are backed up as *.bak. Continue?")) return;
    setBusy("imp");
    setMsg(null);
    try {
      const r = await dataApi.import(src.trim(), true);
      setMsg(`✓ Restored ${r.restored.length} items. ${r.warning ?? ""}`);
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Section
      label="Export / import"
      hint="Bundles your DB, seeds, secrets file and pairing token into one tarball. Vault content is not included — rsync that separately."
    >
      <div className="space-y-2">
        <label className="flex flex-col text-[12px] text-neutral-300">
          export destination
          <input
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            className="no-drag mt-1 rounded-md border border-passio-border bg-passio-panel px-2 py-1 font-mono text-[12px] text-passio-cream"
          />
        </label>
        <button
          type="button"
          onClick={doExport}
          disabled={busy !== null}
          className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed disabled:opacity-40"
        >
          {busy === "exp" ? "exporting…" : "Export now"}
        </button>
        <hr className="border-passio-border" />
        <label className="flex flex-col text-[12px] text-neutral-300">
          import source
          <input
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            placeholder="/path/to/passio-export.tar.gz"
            className="no-drag mt-1 rounded-md border border-passio-border bg-passio-panel px-2 py-1 font-mono text-[12px] text-passio-cream"
          />
        </label>
        <button
          type="button"
          onClick={doImport}
          disabled={busy !== null || !src.trim()}
          className="no-drag rounded-md bg-red-500/20 px-3 py-1 text-[12px] text-red-200 disabled:opacity-40"
        >
          {busy === "imp" ? "importing…" : "Import + overwrite"}
        </button>
        {msg && <p className="text-[12px] text-neutral-200">{msg}</p>}
      </div>
    </Section>
  );
}

function homeGuess(): string {
  // The input is freely editable, so a sensible default is enough.
  return "~";
}
