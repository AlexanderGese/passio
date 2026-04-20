import { useState } from "react";
import clsx from "clsx";
import { TodosPanel } from "./TodosPanel";
import { GoalsPanel } from "./GoalsPanel";
import { AutoLoopPanel } from "./AutoLoopPanel";

type Sub = "todos" | "goals" | "auto";

export function DoPanel() {
  const [sub, setSub] = useState<Sub>("todos");
  return (
    <div className="flex h-full flex-col gap-2">
      <SubNav current={sub} onPick={setSub} />
      <div className="min-h-0 flex-1">
        {sub === "todos" && <TodosPanel />}
        {sub === "goals" && <GoalsPanel />}
        {sub === "auto" && <AutoLoopPanel />}
      </div>
    </div>
  );
}

function SubNav({ current, onPick }: { current: Sub; onPick: (s: Sub) => void }) {
  const items: Array<{ id: Sub; label: string; icon: string }> = [
    { id: "todos", label: "Todos", icon: "✓" },
    { id: "goals", label: "Goals", icon: "🎯" },
    { id: "auto", label: "Auto-loop", icon: "∞" },
  ];
  return (
    <nav className="flex gap-1 rounded-xl border border-passio-border bg-[#120E1A] p-1">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => onPick(i.id)}
          className={clsx(
            "no-drag flex-1 rounded-lg px-2 py-1 text-[12px] font-medium transition-colors",
            current === i.id
              ? "bg-passio-pulp text-passio-seed"
              : "text-neutral-300 hover:text-passio-pulpBright",
          )}
        >
          <span className="mr-1">{i.icon}</span>
          {i.label}
        </button>
      ))}
    </nav>
  );
}
