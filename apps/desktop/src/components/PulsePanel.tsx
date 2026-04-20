import { useState } from "react";
import clsx from "clsx";
import { ActivityPanel } from "./ActivityPanel";
import { FocusPanel } from "./FocusPanel";
import { CostPanel } from "./CostPanel";
import { ErrorsPanel } from "./ErrorsPanel";
import { usePassioStore } from "../store";

type Sub = "activity" | "focus" | "cost" | "errors";

export function PulsePanel() {
  const [sub, setSub] = useState<Sub>("activity");
  const errorCount = usePassioStore((s) => s.errors.filter((e) => Date.now() - e.ts < 10 * 60_000).length);
  return (
    <div className="flex h-full flex-col gap-2">
      <SubNav current={sub} onPick={setSub} errorCount={errorCount} />
      <div className="min-h-0 flex-1">
        {sub === "activity" && <ActivityPanel />}
        {sub === "focus" && <FocusPanel />}
        {sub === "cost" && <CostPanel />}
        {sub === "errors" && <ErrorsPanel />}
      </div>
    </div>
  );
}

function SubNav({
  current,
  onPick,
  errorCount,
}: {
  current: Sub;
  onPick: (s: Sub) => void;
  errorCount: number;
}) {
  const items: Array<{ id: Sub; label: string; icon: string; badge?: number }> = [
    { id: "activity", label: "Activity", icon: "📊" },
    { id: "focus", label: "Focus", icon: "⏱" },
    { id: "cost", label: "Cost", icon: "💰" },
    { id: "errors", label: "Errors", icon: "⚠", ...(errorCount > 0 ? { badge: errorCount } : {}) },
  ];
  return (
    <nav className="flex gap-1 rounded-xl border border-passio-border bg-[#120E1A] p-1">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => onPick(i.id)}
          className={clsx(
            "no-drag relative flex-1 rounded-lg px-2 py-1 text-[12px] font-medium transition-colors",
            current === i.id
              ? "bg-passio-pulp text-passio-seed"
              : "text-neutral-300 hover:text-passio-pulpBright",
          )}
        >
          <span className="mr-1">{i.icon}</span>
          {i.label}
          {i.badge !== undefined && (
            <span className="absolute right-0.5 top-0.5 rounded-full bg-red-500 px-1 text-[9px] text-white">
              {i.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
