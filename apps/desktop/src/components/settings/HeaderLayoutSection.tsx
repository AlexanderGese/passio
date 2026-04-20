import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  type HeaderEntry,
  DEFAULT_HEADER_LAYOUT,
  parseId,
  reconcileLayout,
  seedWidgetId,
} from "../../header-layout";
import { seedsApi, type SeedListRow } from "../../ipc";
import {
  fetchHeaderLayout,
  persistHeaderLayout,
} from "../HeaderStrip";
import { Section } from "./_shared";

/**
 * Drag-to-reorder + show/hide every header chip (built-in + seed widgets).
 * Layout persists via the header_layout setting and HeaderStrip re-renders
 * on change.
 */
export function HeaderLayoutSection() {
  const [layout, setLayout] = useState<HeaderEntry[]>([]);
  const [seeds, setSeeds] = useState<SeedListRow[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const seedRes = await seedsApi.list().catch(() => ({ seeds: [] as SeedListRow[] }));
    const enabled = seedRes.seeds.filter((s) => s.enabled);
    setSeeds(enabled);
    const availableSeedIds = enabled.flatMap((s) =>
      (s.contributes.widgets ?? [])
        .filter((w) => w.slot === "header")
        .map((w) => seedWidgetId(s.name, w.id)),
    );
    const persisted = await fetchHeaderLayout();
    const reconciled = reconcileLayout(persisted, [
      ...DEFAULT_HEADER_LAYOUT.map((e) => e.id),
      ...availableSeedIds,
    ]);
    setLayout(reconciled);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function apply(next: HeaderEntry[]) {
    setLayout(next);
    await persistHeaderLayout(next);
  }

  function move(from: number, to: number) {
    if (from === to) return;
    const next = [...layout];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    void apply(next);
  }

  function toggle(id: string) {
    void apply(
      layout.map((e) => (e.id === id ? { ...e, visible: !e.visible } : e)),
    );
  }

  function reset() {
    void apply(reconcileLayout(DEFAULT_HEADER_LAYOUT, layout.map((e) => e.id)));
  }

  return (
    <Section
      label="Header layout"
      hint="Reorder the chips in the bubble header. Drag to rearrange, click the eye to hide. Seeds with header widgets get their own entries."
    >
      <ul className="space-y-1">
        {layout.map((entry, idx) => (
          <li
            key={entry.id}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null) move(dragIdx, idx);
              setDragIdx(null);
            }}
            className={clsx(
              "flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-[12px] transition-colors",
              entry.visible
                ? "border-passio-border bg-[#241B30] text-passio-cream"
                : "border-passio-border/40 bg-[#1A1422] text-neutral-500",
              dragIdx === idx && "opacity-60",
            )}
          >
            <span className="text-neutral-500">⋮⋮</span>
            <span className="truncate">{describeEntry(entry, seeds)}</span>
            <button
              type="button"
              onClick={() => toggle(entry.id)}
              className="no-drag ml-auto rounded-md bg-[#120E1A] px-2 py-0.5 text-[11px] hover:text-passio-pulpBright"
              title={entry.visible ? "hide" : "show"}
            >
              {entry.visible ? "👁" : "🙈"}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="no-drag rounded-md bg-[#2E2340] px-3 py-1 text-[12px] text-neutral-200"
        >
          Reset to default
        </button>
        <p className="text-[11px] text-neutral-500">
          Changes apply immediately.
        </p>
      </div>
    </Section>
  );
}

function describeEntry(entry: HeaderEntry, seeds: SeedListRow[]): string {
  const p = parseId(entry.id);
  if (p.kind === "builtin") {
    const labels: Record<string, string> = {
      weather: "☀ Weather",
      calendar: "📅 Calendar ticker",
      mail: "✉ Unread mail",
      pomodoro: "🍅 Pomodoro ring",
      "what-next": "⟲ What next?",
      spotlight: "🔍 Spotlight",
      "auto-speak": "🔊 Auto-speak toggle",
      posture: "☀ Posture chip",
    };
    return labels[p.name] ?? p.name;
  }
  const seed = seeds.find((s) => s.name === p.seed);
  const widget = seed?.contributes.widgets?.find((w) => w.id === p.widget);
  return `🌱 ${p.seed} · ${widget?.id ?? p.widget}`;
}
