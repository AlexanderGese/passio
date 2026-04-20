import { useEffect, useState } from "react";
import clsx from "clsx";
import { seedsApi, type SeedListRow } from "../ipc";

/**
 * Auto-rendered settings form from a seed's manifest
 * `contributes.settings` descriptor. Values persist to the seeds.settings_json
 * blob and the seed is restarted on save so it picks up the new config.
 */
export function SeedSettingsForm({ seed }: { seed: SeedListRow }) {
  type Setting = {
    id: string;
    label: string;
    description?: string;
    type: "string" | "number" | "boolean" | "select" | "secret";
    default?: unknown;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
  };
  const schema = ((seed.contributes as unknown as { settings?: Setting[] }).settings ?? []) as Setting[];
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    seedsApi
      .getSettings(seed.name)
      .then((r) => {
        const merged: Record<string, unknown> = {};
        for (const s of schema) merged[s.id] = r.settings[s.id] ?? s.default ?? defaultFor(s.type);
        setValues(merged);
      })
      .catch(() => undefined);
  }, [seed.name]);

  if (schema.length === 0) {
    return (
      <p className="text-[12px] text-neutral-500">
        This seed doesn't expose any settings.
      </p>
    );
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await seedsApi.setSettings(seed.name, values);
      setSaved(true);
      setTimeout(() => setSaved(false), 2_000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-2 text-[12px]"
    >
      {schema.map((s) => (
        <SettingRow
          key={s.id}
          spec={s}
          value={values[s.id]}
          onChange={(v) => setValues((prev) => ({ ...prev, [s.id]: v }))}
        />
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="no-drag rounded-md bg-passio-pulp px-3 py-1 font-semibold text-passio-seed disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-[11px] text-emerald-300">✓ saved — seed restarted</span>}
        {err && <span className="text-[11px] text-red-300">⚠ {err}</span>}
      </div>
    </form>
  );
}

function SettingRow({
  spec,
  value,
  onChange,
}: {
  spec: {
    id: string;
    label: string;
    description?: string;
    type: "string" | "number" | "boolean" | "select" | "secret";
    default?: unknown;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
  };
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-[#241B30] p-2">
      <div className="min-w-[120px]">
        <p className="text-passio-cream">{spec.label}</p>
        {spec.description && (
          <p className="mt-0.5 text-[10px] text-neutral-400">{spec.description}</p>
        )}
      </div>
      <div className="flex-1">
        {spec.type === "string" && (
          <input
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className="no-drag w-full rounded bg-[#1A1422] px-2 py-1 text-passio-cream"
          />
        )}
        {spec.type === "secret" && (
          <input
            type="password"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="••••••"
            className="no-drag w-full rounded bg-[#1A1422] px-2 py-1 font-mono text-passio-cream"
          />
        )}
        {spec.type === "number" && (
          <input
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(Number(e.target.value))}
            min={spec.min}
            max={spec.max}
            step={spec.step ?? 1}
            className="no-drag w-full rounded bg-[#1A1422] px-2 py-1 text-passio-cream"
          />
        )}
        {spec.type === "boolean" && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              className="no-drag"
            />
            <span className={clsx("text-[11px]", value ? "text-emerald-300" : "text-neutral-400")}>
              {value ? "on" : "off"}
            </span>
          </label>
        )}
        {spec.type === "select" && (
          <select
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className="no-drag w-full rounded bg-[#1A1422] px-2 py-1 text-passio-cream"
          >
            {(spec.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function defaultFor(t: string): unknown {
  if (t === "boolean") return false;
  if (t === "number") return 0;
  return "";
}
