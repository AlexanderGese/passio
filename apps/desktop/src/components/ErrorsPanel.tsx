import { usePassioStore } from "../store";
import clsx from "clsx";

export function ErrorsPanel() {
  const { errors, clearErrors } = usePassioStore();

  if (errors.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-[28px]">
          ✓
        </div>
        <p className="voice text-[18px] text-passio-cream">All clear</p>
        <p className="text-[13px] text-neutral-300">
          No recent warnings or errors from Passio's sidecar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-300">
          Recent issues · {errors.length}
        </span>
        <button
          type="button"
          onClick={clearErrors}
          className="no-drag rounded-md bg-[#241B30] px-2 py-1 text-[12px] text-neutral-200 hover:text-passio-pulp"
        >
          Clear
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {errors.map((e, i) => (
          <li
            key={`${e.ts}-${i}`}
            className={clsx(
              "rounded-xl border px-3 py-2 text-[13px] leading-snug allow-select",
              e.level === "error"
                ? "border-red-500/40 bg-red-950/40 text-red-100"
                : "border-amber-500/35 bg-amber-950/30 text-amber-100",
            )}
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider opacity-70">
              <span>{e.level}</span>
              <span>{new Date(e.ts).toLocaleTimeString()}</span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap">{e.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
