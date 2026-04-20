import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { seedsApi, onSeedEvent, seedUpdatesApi, type SeedListRow } from "../ipc";
import { SeedPanelHost } from "./SeedPanelHost";
import { SeedSettingsForm } from "./SeedSettingsForm";
import { DiscoverView } from "./DiscoverView";

type View = "list" | "discover" | "install" | "dev";

export function GrovePanel() {
  const [seeds, setSeeds] = useState<SeedListRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");

  const refresh = useCallback(async () => {
    try {
      const r = await seedsApi.list();
      setSeeds(r.seeds);
      if (!selected && r.seeds[0]) setSelected(r.seeds[0].name);
    } catch {
      /* silent */
    }
  }, [selected]);

  useEffect(() => {
    void refresh();
    const p = onSeedEvent(() => void refresh());
    return () => {
      p.then((fn) => fn()).catch(() => {});
    };
  }, [refresh]);

  const current = seeds.find((s) => s.name === selected) ?? null;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-passio-pulpBright">
          Grove · {seeds.length}
        </span>
        <div className="ml-auto flex gap-1">
          <UpdatesChip />
          <ViewTab current={view} id="list" onPick={setView} label="Mine" />
          <ViewTab current={view} id="discover" onPick={setView} label="Discover" />
          <ViewTab current={view} id="install" onPick={setView} label="Install" />
          <ViewTab current={view} id="dev" onPick={setView} label="Dev" />
        </div>
      </div>

      {view === "list" && (
        <div className="grid min-h-0 flex-1 grid-cols-[150px_1fr] gap-2">
          <ul className="space-y-1 overflow-y-auto rounded-xl border border-passio-border bg-[#120E1A] p-1.5">
            {seeds.length === 0 ? (
              <li className="px-2 py-4 text-center text-[12px] text-neutral-500">
                no seeds yet · click Install
              </li>
            ) : (
              seeds.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.name)}
                    className={clsx(
                      "w-full rounded-md px-2 py-1.5 text-left",
                      selected === s.name
                        ? "bg-passio-pulp/20 text-passio-pulpBright"
                        : "hover:bg-passio-pulp/10 text-neutral-200",
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <span>🌱</span>
                      <span className="truncate text-[12px]">{s.name}</span>
                      {s.enabled ? (
                        <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" />
                      ) : (
                        <span className="ml-auto h-2 w-2 rounded-full bg-neutral-500" />
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-400">v{s.version}</div>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="min-w-0 overflow-y-auto rounded-xl border border-passio-border bg-[#120E1A] p-3 text-[13px]">
            {current ? <SeedDetail seed={current} onChanged={refresh} /> : (
              <p className="py-10 text-center text-[13px] text-neutral-400">
                Pick a seed or install one.
              </p>
            )}
          </div>
        </div>
      )}

      {view === "discover" && <DiscoverView installed={seeds} />}
      {view === "install" && <InstallView onDone={() => setView("list")} onChanged={refresh} />}
      {view === "dev" && <DevView />}
    </div>
  );
}

function UpdatesChip() {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const r = await seedUpdatesApi.check();
      setCount(r.updates.length);
      if (r.updates.length > 0) {
        const msg = r.updates
          .map((u) => `${u.name}: ${u.installed} → ${u.available}`)
          .join("\n");
        if (confirm(`Updates available:\n\n${msg}\n\nReinstall all now?`)) {
          for (const u of r.updates) {
            try {
              await seedsApi.installDescriptor({
                $schema: "passio-seed@1",
                name: u.name,
                version: u.available,
                source: u.source,
              });
            } catch (e) {
              console.warn(`update ${u.name} failed`, e);
            }
          }
          setCount(0);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={check}
      disabled={busy}
      className={clsx(
        "no-drag rounded-md px-2 py-0.5 text-[11px]",
        count && count > 0
          ? "bg-amber-500/25 text-amber-200"
          : "bg-[#1A1422] text-neutral-400 hover:text-passio-pulpBright",
      )}
      title="Check remote manifests for newer versions"
    >
      {busy ? "…" : count === null ? "Check updates" : count === 0 ? "✓ up to date" : `${count} updates`}
    </button>
  );
}

function ViewTab({
  current,
  id,
  onPick,
  label,
}: {
  current: View;
  id: View;
  onPick: (v: View) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className={clsx(
        "no-drag rounded-md px-2 py-0.5 text-[11px]",
        current === id
          ? "bg-passio-pulp/25 text-passio-pulpBright"
          : "text-neutral-400 hover:text-neutral-200",
      )}
    >
      {label}
    </button>
  );
}

function SeedDetail({
  seed,
  onChanged,
}: {
  seed: SeedListRow;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      if (seed.enabled) await seedsApi.disable(seed.name);
      else await seedsApi.enable(seed.name);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function uninstall() {
    if (!confirm(`Uninstall ${seed.name}? This removes its files and state.`)) return;
    setBusy(true);
    try {
      await seedsApi.uninstall(seed.name);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <header>
        <div className="flex items-center gap-2">
          <span className="text-[18px]">🌱</span>
          <h3 className="voice text-[17px] text-passio-cream">{seed.name}</h3>
          <span className="text-[11px] text-neutral-400">v{seed.version}</span>
          {seed.permissions.trusted && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-200">
              trusted · full access
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] text-neutral-300">{seed.description}</p>
        {seed.author && <p className="text-[11px] text-neutral-500">by {seed.author}</p>}
      </header>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          className={clsx(
            "no-drag rounded-md px-3 py-1 text-[12px] font-semibold disabled:opacity-40",
            seed.enabled
              ? "bg-[#2E2340] text-neutral-200"
              : "bg-passio-pulp text-passio-seed",
          )}
        >
          {seed.enabled ? "Disable" : "Enable"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={uninstall}
          className="no-drag rounded-md bg-red-500/20 px-3 py-1 text-[12px] text-red-200 disabled:opacity-40"
        >
          Uninstall
        </button>
      </div>

      <Section label="Permissions">
        <PermList perms={seed.permissions} />
      </Section>

      <Section label="Contributes">
        <ContribList c={seed.contributes} />
      </Section>

      <Section label="Settings">
        <SeedSettingsForm seed={seed} />
      </Section>

      {seed.enabled && seed.contributes.tabs?.[0] && (
        <Section label={`Panel · ${seed.contributes.tabs[0].title}`}>
          <SeedPanelHost
            seedName={seed.name}
            panel={seed.contributes.tabs[0].panel}
            elementId={seed.contributes.tabs[0].id}
          />
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </p>
      {children}
    </section>
  );
}

function PermList({ perms }: { perms: SeedListRow["permissions"] }) {
  const items: string[] = [];
  if (perms.network?.length) items.push(`network → ${perms.network.join(", ")}`);
  if (perms.secrets?.length) items.push(`secrets → ${perms.secrets.join(", ")}`);
  if (perms.trusted) items.push("trusted (unsandboxed)");
  if (perms.shell) items.push("shell");
  if (items.length === 0) return <p className="text-[12px] text-neutral-500">none requested</p>;
  return (
    <ul className="space-y-0.5 text-[12px] text-neutral-200">
      {items.map((i) => (
        <li key={i}>· {i}</li>
      ))}
    </ul>
  );
}

function ContribList({ c }: { c: SeedListRow["contributes"] }) {
  const rows: Array<[string, string]> = [];
  if (c.tools?.length) rows.push(["tools", c.tools.join(", ")]);
  if (c.tabs?.length) rows.push(["tabs", c.tabs.map((t) => t.title).join(", ")]);
  if (c.widgets?.length) rows.push(["widgets", c.widgets.map((w) => `${w.id}@${w.slot}`).join(", ")]);
  if (c.hotkeys?.length) rows.push(["hotkeys", c.hotkeys.map((h) => `${h.label ?? h.id} (${h.default})`).join(", ")]);
  if (c.scheduler?.length) rows.push(["scheduler", c.scheduler.map((s) => `${s.id} · ${s.every_seconds}s`).join(", ")]);
  if (c.events?.length) rows.push(["events", c.events.join(", ")]);
  if (rows.length === 0) return <p className="text-[12px] text-neutral-500">nothing declared</p>;
  return (
    <ul className="space-y-0.5 text-[12px] text-neutral-200">
      {rows.map(([k, v]) => (
        <li key={k}>
          <span className="text-neutral-500">{k}:</span> {v}
        </li>
      ))}
    </ul>
  );
}

function InstallView({
  onDone,
  onChanged,
}: {
  onDone: () => void;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"paste" | "github" | "file">("paste");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [descText, setDescText] = useState("");
  const [repo, setRepo] = useState("");
  const [ref, setRef] = useState("main");
  const [localPath, setLocalPath] = useState("");

  async function installDescriptor(json: unknown) {
    setBusy(true);
    setErr(null);
    try {
      await seedsApi.installDescriptor(json);
      await onChanged();
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function installPaste() {
    try {
      const parsed = JSON.parse(descText);
      await installDescriptor(parsed);
    } catch (e) {
      setErr(`Invalid .seed JSON: ${(e as Error).message}`);
    }
  }

  async function installGithub() {
    const [owner, name] = repo.trim().split("/");
    if (!owner || !name) {
      setErr("repo must be owner/name");
      return;
    }
    const desc = {
      $schema: "passio-seed@1",
      name: name,
      version: "0.0.0",
      source: { type: "github", repo: `${owner}/${name}`, ref },
    };
    await installDescriptor(desc);
  }

  async function installLocal() {
    setBusy(true);
    setErr(null);
    try {
      await seedsApi.installLocal(localPath.trim());
      await onChanged();
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto space-y-3 rounded-xl border border-passio-border bg-[#120E1A] p-3 text-[13px]">
      <div className="flex gap-1">
        {(
          [
            ["paste", ".seed file"],
            ["github", "GitHub"],
            ["file", "Local folder"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={clsx(
              "no-drag rounded-md px-2 py-1 text-[12px]",
              tab === k ? "bg-passio-pulp text-passio-seed" : "bg-[#241B30] text-neutral-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "paste" && (
        <div className="space-y-2">
          <p className="text-[12px] text-neutral-400">
            Paste a <code>.seed</code> descriptor (JSON). Passio clones the source,
            checks the manifest, then asks you to confirm permissions.
          </p>
          <textarea
            value={descText}
            onChange={(e) => setDescText(e.target.value)}
            rows={8}
            placeholder={`{
  "$schema": "passio-seed@1",
  "name": "hn-pulse",
  "version": "0.1.0",
  "source": { "type": "github", "repo": "you/passio-seed-hn", "ref": "v0.1.0" }
}`}
            className="no-drag w-full resize-none rounded-md bg-[#241B30] p-2 font-mono text-[11px]"
          />
          <button
            type="button"
            onClick={installPaste}
            disabled={busy || !descText.trim()}
            className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed disabled:opacity-40"
          >
            {busy ? "Installing…" : "Install"}
          </button>
        </div>
      )}

      {tab === "github" && (
        <div className="space-y-2">
          <input
            placeholder="owner/repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="no-drag w-full rounded-md bg-[#241B30] p-2"
          />
          <input
            placeholder="ref (branch, tag, or sha)"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className="no-drag w-full rounded-md bg-[#241B30] p-2"
          />
          <button
            type="button"
            onClick={installGithub}
            disabled={busy || !repo.trim()}
            className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed disabled:opacity-40"
          >
            {busy ? "Cloning…" : "Install"}
          </button>
        </div>
      )}

      {tab === "file" && (
        <div className="space-y-2">
          <p className="text-[12px] text-neutral-400">
            Absolute path to a local seed folder (must contain <code>seed.json</code>).
          </p>
          <input
            placeholder="/home/you/code/my-seed"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            className="no-drag w-full rounded-md bg-[#241B30] p-2 font-mono text-[12px]"
          />
          <button
            type="button"
            onClick={installLocal}
            disabled={busy || !localPath.trim()}
            className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed disabled:opacity-40"
          >
            {busy ? "Installing…" : "Install"}
          </button>
        </div>
      )}

      {err && <p className="text-[12px] text-red-300">⚠ {err}</p>}
    </div>
  );
}

function DevView() {
  const [path, setPath] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ ts: number; level: string; message: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      try {
        const r = await seedsApi.logs(running);
        setLogs(r.logs);
      } catch {
        /* silent */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [running]);

  async function start() {
    setBusy(true);
    try {
      const r = await seedsApi.devStart(path.trim());
      setRunning(r.name);
    } catch (e) {
      alert(`dev failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    await seedsApi.devStop();
    setRunning(null);
    setLogs([]);
  }

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-passio-border bg-[#120E1A] p-3 text-[13px]">
      <p className="text-[12px] text-neutral-400">
        Point dev mode at a local seed folder. Passio watches files, re-installs
        on change, and restarts the worker. Logs stream below.
      </p>
      <div className="flex gap-2">
        <input
          placeholder="/home/you/code/my-seed"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={!!running}
          className="no-drag flex-1 rounded-md bg-[#241B30] p-2 font-mono text-[12px]"
        />
        {running ? (
          <button
            type="button"
            onClick={stop}
            className="no-drag rounded-md bg-red-500/20 px-3 py-1 text-[12px] text-red-200"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={busy || !path.trim()}
            className="no-drag rounded-md bg-passio-pulp px-3 py-1 text-[12px] font-semibold text-passio-seed disabled:opacity-40"
          >
            {busy ? "Starting…" : "Start"}
          </button>
        )}
      </div>
      {running && (
        <div className="rounded-md bg-[#241B30] p-2">
          <p className="mb-1 text-[11px] text-passio-pulpBright">
            watching · {running}
          </p>
          <ul className="max-h-[240px] space-y-0.5 overflow-y-auto font-mono text-[11px]">
            {logs.map((l, i) => (
              <li
                key={`${l.ts}-${i}`}
                className={clsx(
                  l.level === "error"
                    ? "text-red-300"
                    : l.level === "warn"
                      ? "text-amber-300"
                      : "text-neutral-200",
                )}
              >
                [{new Date(l.ts).toLocaleTimeString()}] {l.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
