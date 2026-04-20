import clsx from "clsx";
import { useEffect, useState } from "react";
import {
  type HeaderEntry,
  parseId,
  reconcileLayout,
  seedWidgetId,
} from "../header-layout";
import { sidecarCall } from "../ipc-helpers";
import { seedsApi, onSeedEvent, type SeedListRow } from "../ipc";
import { CalendarTicker, MailPill, PomodoroRing, WeatherRing } from "./Widgets";
import { SeedPanelHost } from "./SeedPanelHost";

/**
 * Renders the bubble-header chip row according to the user's saved layout.
 * Built-in chips are in one switch; seed chips mount their sandbox panel.
 */
export function HeaderStrip({
  autoSpeak,
  postureGlyph,
  postureLabel,
  onToggleAutoSpeak,
  onCyclePosture,
  onWhatNext,
  onOpenSpotlight,
}: {
  autoSpeak: boolean;
  posture: "quiet" | "active" | "proactive";
  postureGlyph: string;
  postureLabel: string;
  onToggleAutoSpeak: () => void;
  onCyclePosture: () => void;
  onWhatNext: () => void;
  onOpenSpotlight: () => void;
}) {
  const [layout, setLayout] = useState<HeaderEntry[]>([]);
  const [seeds, setSeeds] = useState<SeedListRow[]>([]);

  // Load seeds + layout; reconcile + persist back if layout changed.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const seedRes = await seedsApi.list();
        if (cancelled) return;
        const enabled = seedRes.seeds.filter((s) => s.enabled);
        setSeeds(enabled);
        const availableSeedIds = enabled.flatMap((s) =>
          (s.contributes.widgets ?? [])
            .filter((w) => w.slot === "header")
            .map((w) => seedWidgetId(s.name, w.id)),
        );
        const persisted = await loadLayout();
        const reconciled = reconcileLayout(persisted, [
          "builtin:weather",
          "builtin:calendar",
          "builtin:mail",
          "builtin:pomodoro",
          "builtin:what-next",
          "builtin:spotlight",
          "builtin:auto-speak",
          "builtin:posture",
          ...availableSeedIds,
        ]);
        setLayout(reconciled);
        if (JSON.stringify(reconciled) !== JSON.stringify(persisted)) {
          void saveLayout(reconciled);
        }
      } catch {
        /* silent */
      }
    };
    void load();
    const p = onSeedEvent(() => void load());
    const h = () => void load();
    window.addEventListener("passio-header-layout-changed", h);
    return () => {
      cancelled = true;
      p.then((fn) => fn()).catch(() => {});
      window.removeEventListener("passio-header-layout-changed", h);
    };
  }, []);

  return (
    <div className="flex items-center gap-1">
      {layout
        .filter((e) => e.visible)
        .map((entry) => {
          const parsed = parseId(entry.id);
          if (parsed.kind === "builtin") {
            return (
              <Builtin
                key={entry.id}
                name={parsed.name}
                autoSpeak={autoSpeak}
                postureGlyph={postureGlyph}
                postureLabel={postureLabel}
                onToggleAutoSpeak={onToggleAutoSpeak}
                onCyclePosture={onCyclePosture}
                onWhatNext={onWhatNext}
                onOpenSpotlight={onOpenSpotlight}
              />
            );
          }
          const seed = seeds.find((s) => s.name === parsed.seed);
          const widget = seed?.contributes.widgets?.find((w) => w.id === parsed.widget);
          if (!seed || !widget) return null;
          return (
            <div key={entry.id} className="max-h-[26px] overflow-hidden">
              <SeedPanelHost
                seedName={seed.name}
                panel={widget.panel}
                elementId={widget.id}
                compact="header"
              />
            </div>
          );
        })}
    </div>
  );
}

function Builtin({
  name,
  autoSpeak,
  postureGlyph,
  postureLabel,
  onToggleAutoSpeak,
  onCyclePosture,
  onWhatNext,
  onOpenSpotlight,
}: {
  name: string;
  autoSpeak: boolean;
  postureGlyph: string;
  postureLabel: string;
  onToggleAutoSpeak: () => void;
  onCyclePosture: () => void;
  onWhatNext: () => void;
  onOpenSpotlight: () => void;
}) {
  if (name === "weather") return <WeatherRing />;
  if (name === "calendar") return <CalendarTicker />;
  if (name === "mail") return <MailPill />;
  if (name === "pomodoro") return <PomodoroRing />;
  if (name === "what-next")
    return (
      <button
        type="button"
        onClick={onWhatNext}
        className="rounded-md bg-[#1A1422] px-2 py-0.5 text-[11px] hover:text-passio-pulpBright"
        title="What should I do next?"
      >
        ⟲
      </button>
    );
  if (name === "spotlight")
    return (
      <button
        type="button"
        onClick={onOpenSpotlight}
        className="rounded-md bg-[#1A1422] px-2 py-0.5 text-[11px] hover:text-passio-pulpBright"
        title="Spotlight (Super+/)"
      >
        🔍
      </button>
    );
  if (name === "auto-speak")
    return (
      <button
        type="button"
        onClick={onToggleAutoSpeak}
        className={clsx(
          "rounded-md px-2 py-0.5 text-[11px] transition-colors",
          autoSpeak
            ? "bg-passio-pulp/20 text-passio-pulpBright hover:bg-passio-pulp/30"
            : "bg-[#1A1422] text-neutral-400 hover:text-neutral-200",
        )}
        title={autoSpeak ? "Passio speaks notifications" : "Speaking muted"}
      >
        {autoSpeak ? "🔊" : "🔇"}
      </button>
    );
  if (name === "posture")
    return (
      <button
        type="button"
        onClick={onCyclePosture}
        className="flex items-center gap-1 rounded-md bg-[#1A1422] px-2 py-0.5 text-[11px] text-passio-cream hover:bg-[#2E2340]"
        title="Cycle autonomy"
      >
        <span>{postureGlyph}</span>
        <span>{postureLabel}</span>
      </button>
    );
  return null;
}

async function loadLayout(): Promise<HeaderEntry[] | null> {
  try {
    const row = await sidecarCall<{ value?: string } | null>("passio.settings.get", {
      key: "header_layout",
    });
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as HeaderEntry[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveLayout(layout: HeaderEntry[]): Promise<void> {
  await sidecarCall<{ ok: true }>("passio.settings.set", {
    key: "header_layout",
    value: JSON.stringify(layout),
  });
}

/** Exposed so the settings panel can emit updates. */
export async function persistHeaderLayout(layout: HeaderEntry[]): Promise<void> {
  await saveLayout(layout);
  window.dispatchEvent(new Event("passio-header-layout-changed"));
}

export async function fetchHeaderLayout(): Promise<HeaderEntry[] | null> {
  return loadLayout();
}
