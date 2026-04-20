import { useCallback, useEffect, useState } from "react";
import { seedsApi, onSeedEvent, type SeedListRow } from "../ipc";
import { SeedPanelHost } from "./SeedPanelHost";

/**
 * Renders every seed-declared widget whose `slot` matches. Used in the
 * header strip (slim, 28px-ish) and in the corner (compact block).
 */
export function SeedWidgets({ slot }: { slot: "header" | "corner" }) {
  const [seeds, setSeeds] = useState<SeedListRow[]>([]);
  const refresh = useCallback(async () => {
    try {
      const r = await seedsApi.list();
      setSeeds(r.seeds.filter((s) => s.enabled));
    } catch {
      /* silent */
    }
  }, []);
  useEffect(() => {
    void refresh();
    const p = onSeedEvent((ev) => {
      if (ev.kind === "started" || ev.kind === "stopped" || ev.kind === "dev_reloaded") {
        void refresh();
      }
    });
    return () => {
      p.then((fn) => fn()).catch(() => {});
    };
  }, [refresh]);

  const widgets: Array<{ seed: string; id: string; panel: string }> = [];
  for (const s of seeds) {
    for (const w of s.contributes.widgets ?? []) {
      if (w.slot === slot) widgets.push({ seed: s.name, id: w.id, panel: w.panel });
    }
  }
  if (widgets.length === 0) return null;

  if (slot === "header") {
    return (
      <div className="flex items-center gap-1">
        {widgets.map((w) => (
          <div
            key={`${w.seed}:${w.id}`}
            className="max-h-[26px] overflow-hidden"
            style={{ minWidth: 24 }}
          >
            <SeedPanelHost
              seedName={w.seed}
              panel={w.panel}
              elementId={w.id}
              compact="header"
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="fixed right-4 top-4 z-20 flex flex-col gap-2 pointer-events-none">
      {widgets.map((w) => (
        <div key={`${w.seed}:${w.id}`} className="pointer-events-auto">
          <SeedPanelHost seedName={w.seed} panel={w.panel} elementId={w.id} compact="corner" />
        </div>
      ))}
    </div>
  );
}
