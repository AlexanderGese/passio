import clsx from "clsx";
import type { ReactNode } from "react";

export function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-passio-border bg-[#241B30] p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-passio-pulpBright">
        {label}
      </p>
      {hint && (
        <p className="mb-2.5 mt-1 text-[12px] leading-snug text-neutral-300">{hint}</p>
      )}
      {!hint && <div className="mb-2.5" />}
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
      <span className="mb-1 block text-[12px] font-medium text-neutral-200">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="no-drag w-full rounded-lg border border-passio-border bg-passio-panel px-3 py-2 text-[14px] text-passio-cream placeholder-neutral-500 focus:border-passio-pulp focus:outline-none"
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
        "rounded-lg bg-passio-pulp px-3 py-2 text-[14px] font-semibold text-passio-seed transition-colors hover:bg-passio-pulpBright disabled:opacity-40",
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
      className="rounded-lg bg-red-900/40 px-3 py-2 text-[14px] font-medium text-red-200 transition-colors hover:bg-red-900/70 disabled:opacity-40"
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
  if (items.length === 0)
    return <p className="text-[13px] text-neutral-400">(none yet)</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((v) => (
        <li
          key={v}
          className="flex items-center justify-between gap-2 rounded-lg border border-passio-border bg-passio-panel px-3 py-2 text-[13px]"
        >
          <span className="truncate text-passio-cream" title={v}>
            {v}
          </span>
          <button
            type="button"
            onClick={() => onRemove(v)}
            className="text-neutral-400 transition-colors hover:text-red-300"
            aria-label={`remove ${v}`}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
