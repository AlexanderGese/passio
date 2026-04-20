import { useEffect, useState } from "react";
import { type Keybinds, keybindsApi } from "../../ipc";
import { Section } from "./_shared";

export function KeybindsSection() {
  const [binds, setBinds] = useState<Keybinds | null>(null);
  const [draft, setDraft] = useState<Keybinds>({});
  const [capturing, setCapturing] = useState<string | null>(null);

  useEffect(() => {
    keybindsApi.get().then((b) => {
      setBinds(b);
      setDraft(b);
    });
  }, []);

  function startCapture(action: string) {
    setCapturing(action);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const mods: string[] = [];
      if (e.metaKey) mods.push("Super");
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.shiftKey) mods.push("Shift");
      if (e.altKey) mods.push("Alt");
      const raw = e.key;
      if (["Meta", "Control", "Shift", "Alt"].includes(raw)) return;
      const key = raw.length === 1 ? raw.toUpperCase() : raw;
      const accel = [...mods, key === " " ? "Space" : key].join("+");
      setDraft((d) => ({ ...d, [action]: accel }));
      setCapturing(null);
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("keydown", handler, true);
  }

  async function save() {
    if (!binds) return;
    const patch: Keybinds = {};
    for (const [k, v] of Object.entries(draft)) {
      if (binds[k] !== v) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return;
    const next = await keybindsApi.set(patch);
    setBinds(next);
    setDraft(next);
  }

  if (!binds) return <p className="text-[14px] text-neutral-300">loading…</p>;
  const dirty = Object.keys(binds).some((k) => binds[k] !== draft[k]);

  return (
    <Section label="Keybinds" hint="Every Passio hotkey. Click a binding to capture new keys; restart Passio to apply.">
      <ul className="space-y-1">
        {Object.entries(draft).map(([action, accel]) => (
          <li key={action} className="flex items-center justify-between gap-2">
            <span className="text-neutral-300">{action}</span>
            <button
              type="button"
              onClick={() => startCapture(action)}
              className={`no-drag rounded-md border px-2 py-0.5 text-[14px] font-mono ${
                capturing === action
                  ? "border-passio-pulp bg-passio-pulp/20 text-passio-pulp"
                  : "border-passio-border bg-[#241B30] hover:border-passio-pulp/40"
              }`}
            >
              {capturing === action ? "press keys…" : accel}
            </button>
          </li>
        ))}
      </ul>
      {dirty && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[14px] text-amber-300">
            restart Passio to apply new bindings
          </span>
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-passio-pulp/80 px-2 py-0.5 text-black hover:bg-passio-pulp"
          >
            save
          </button>
        </div>
      )}
    </Section>
  );
}
