import clsx from "clsx";
import type { ReactNode } from "react";

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-black/20 p-2">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      {children}
    </div>
  );
}

export function TextRow({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "number";
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-neutral-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="no-drag mt-0.5 w-full rounded-md border border-white/10 bg-black/40 p-1.5 focus:border-passio-pulp focus:outline-none"
      />
    </label>
  );
}

export function PrimaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-md bg-passio-pulp/80 px-2 py-1 text-black hover:bg-passio-pulp disabled:opacity-40",
      )}
    >
      {label}
    </button>
  );
}

export function DangerButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-red-900/40 px-2 py-1 text-red-200 hover:bg-red-900/60 disabled:opacity-40"
    >
      {label}
    </button>
  );
}

export function ChipList({
  items,
  onRemove,
}: {
  items: string[];
  onRemove: (v: string) => void;
}) {
  if (items.length === 0) return <p className="text-[11px] text-neutral-500">(none)</p>;
  return (
    <ul className="mt-1 space-y-1">
      {items.map((v) => (
        <li
          key={v}
          className="flex items-center justify-between gap-2 rounded-md bg-black/30 px-2 py-1 text-[11px]"
        >
          <span className="truncate" title={v}>
            {v}
          </span>
          <button
            type="button"
            onClick={() => onRemove(v)}
            className="text-neutral-500 hover:text-red-300"
            aria-label={`remove ${v}`}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
