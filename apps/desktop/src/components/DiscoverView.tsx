import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { openUrl } from "@tauri-apps/plugin-opener";
import { orchardApi, seedsApi, type OrchardEntry, type SeedListRow } from "../ipc";

/**
 * Browse the Orchard — Passio's curated seed registry. Free seeds install
 * with one click. Paid seeds open an external checkout (user's browser) —
 * after purchase the license is pasted into the seed's settings.
 */
export function DiscoverView({ installed }: { installed: SeedListRow[] }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [entries, setEntries] = useState<OrchardEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "free" | "paid">("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const installedByName = new Map(installed.map((s) => [s.name, s] as const));

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await orchardApi.fetch();
      setEntries(r.index.seeds);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function install(e: OrchardEntry) {
    setBusy(e.name);
    try {
      await seedsApi.installDescriptor({
        $schema: "passio-seed@1",
        name: e.name,
        version: e.version,
        description: e.description,
        author: e.author,
        source: e.source,
        ...(e.sha256 !== undefined ? { sha256: e.sha256 } : {}),
      });
    } catch (err) {
      alert(`Install failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function buy(e: OrchardEntry) {
    if (!e.checkoutUrl) return;
    try {
      await openUrl(e.checkoutUrl);
    } catch {
      /* If opener is missing, user can copy the URL from the button tooltip. */
    }
  }

  const filtered = entries.filter((e) => {
    if (filter === "free" && e.priceCents > 0) return false;
    if (filter === "paid" && e.priceCents === 0) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const featured = filtered.filter((e) => e.featured);
  const rest = filtered.filter((e) => !e.featured);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-passio-border bg-[#120E1A] p-3">
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search seeds…"
          className="no-drag flex-1 rounded-md bg-[#241B30] px-2 py-1 text-[13px] text-passio-cream focus:outline-none"
        />
        <div className="flex gap-1">
          {(["all", "free", "paid"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={clsx(
                "no-drag rounded-md px-2 py-1 text-[11px]",
                filter === f
                  ? "bg-passio-pulp text-passio-seed"
                  : "bg-[#241B30] text-neutral-300",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={load}
          className="no-drag rounded-md bg-[#241B30] px-2 py-1 text-[11px] text-neutral-200"
          title="refresh"
        >
          ↻
        </button>
      </div>

      {loading && <p className="text-[12px] text-neutral-400">fetching index…</p>}
      {err && <p className="text-[12px] text-red-300">⚠ {err}</p>}

      {featured.length > 0 && (
        <section>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-passio-pulpBright">
            Featured
          </p>
          <div className="space-y-1.5">
            {featured.map((e) => (
              <EntryCard
                key={e.name}
                e={e}
                installed={installedByName.get(e.name)}
                busy={busy === e.name}
                onInstall={install}
                onBuy={buy}
              />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            All seeds · {rest.length}
          </p>
          <div className="space-y-1.5">
            {rest.map((e) => (
              <EntryCard
                key={e.name}
                e={e}
                installed={installedByName.get(e.name)}
                busy={busy === e.name}
                onInstall={install}
                onBuy={buy}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && !err && filtered.length === 0 && (
        <p className="py-8 text-center text-[13px] text-neutral-500">
          no seeds match
        </p>
      )}

      <p className="mt-2 text-[10px] text-neutral-500">
        The Orchard is a curated, open registry. Propose a seed via PR to
        <code className="mx-1 text-passio-pulp">orchard/index.json</code>.
      </p>
    </div>
  );
}

function EntryCard({
  e,
  installed,
  busy,
  onInstall,
  onBuy,
}: {
  e: OrchardEntry;
  installed: SeedListRow | undefined;
  busy: boolean;
  onInstall: (e: OrchardEntry) => void;
  onBuy: (e: OrchardEntry) => void;
}) {
  const priceLabel =
    e.priceCents > 0
      ? `$${(e.priceCents / 100).toFixed(2)}`
      : "Free";
  return (
    <div className="flex items-start gap-2 rounded-lg border border-passio-border bg-[#1F1628] px-3 py-2 text-[13px]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-passio-pulp/20 text-[16px]">
        {iconFor(e.category)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold text-passio-cream">{e.name}</span>
          <span className="text-[10px] text-neutral-400">v{e.version}</span>
          <span
            className={clsx(
              "ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold",
              e.priceCents > 0
                ? "bg-amber-500/25 text-amber-200"
                : "bg-emerald-500/20 text-emerald-300",
            )}
          >
            {priceLabel}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-neutral-300">{e.description}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {e.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-[#2E2340] px-1.5 py-0.5 text-[10px] text-neutral-300"
            >
              #{t}
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[10px] text-neutral-500">by {e.author}</span>
          {installed ? (
            <span className="ml-auto rounded-md bg-[#2E2340] px-2 py-0.5 text-[11px] text-neutral-400">
              installed · v{installed.version}
            </span>
          ) : e.priceCents > 0 && e.checkoutUrl ? (
            <>
              <button
                type="button"
                onClick={() => onBuy(e)}
                className="ml-auto rounded-md bg-passio-pulp px-3 py-1 text-[11px] font-semibold text-passio-seed"
                title={e.checkoutUrl}
              >
                Buy {priceLabel}
              </button>
              <button
                type="button"
                onClick={() => onInstall(e)}
                disabled={busy}
                className="rounded-md bg-[#2E2340] px-2 py-1 text-[11px] text-neutral-200 disabled:opacity-40"
                title="Install the files now — you can paste the license after purchase."
              >
                {busy ? "…" : "Install shell"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onInstall(e)}
              disabled={busy}
              className="ml-auto rounded-md bg-passio-pulp px-3 py-1 text-[11px] font-semibold text-passio-seed disabled:opacity-40"
            >
              {busy ? "…" : "Install"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function iconFor(category: string): string {
  return (
    {
      productivity: "✓",
      mail: "✉",
      news: "🗞",
      developer: "⚙",
      research: "🔬",
      fun: "🎈",
      widget: "📊",
      other: "🌱",
    }[category] ?? "🌱"
  );
}
