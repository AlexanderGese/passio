import { useEffect, useState } from "react";
import { todoApi } from "../ipc";
import { usePassioStore } from "../store";

/**
 * Always-on-top mini pill shown above the avatar when the bubble is
 * collapsed. Shows the clock + highest-priority open todo.
 */
export function MiniWidget() {
  const { expanded, pomodoro } = usePassioStore();
  const [now, setNow] = useState(new Date());
  const [topTodo, setTopTodo] = useState<string | null>(null);

  useEffect(() => {
    if (expanded) return;
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, [expanded]);

  useEffect(() => {
    if (expanded) return;
    const load = async () => {
      try {
        const res = await todoApi.list("open");
        const sorted = [...res.todos].sort((a, b) => b.priority - a.priority);
        setTopTodo(sorted[0]?.text ?? null);
      } catch {
        /* silent */
      }
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [expanded]);

  if (expanded) return null;
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");

  return (
    <div className="pointer-events-none no-drag mb-2 max-w-[320px] rounded-full border border-passio-pulp/30 bg-[#1A1422]/90 px-3 py-1.5 text-[12px] text-passio-cream shadow-[0_8px_20px_-6px_rgba(0,0,0,0.6),0_0_0_1px_rgba(168,85,247,0.2)]">
      <span className="font-mono text-passio-pulpBright">{hh}:{mm}</span>
      {pomodoro.active && <span className="ml-1 text-[11px]">· 🍅</span>}
      {topTodo && (
        <>
          <span className="mx-1.5 text-neutral-500">|</span>
          <span className="truncate">{topTodo.slice(0, 48)}</span>
        </>
      )}
    </div>
  );
}
