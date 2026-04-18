import { useEffect, useState } from "react";
import { automationPrefsApi } from "../../ipc";
import { Section } from "./_shared";

export function AutomationSection() {
  const [alwaysGate, setAlwaysGate] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    automationPrefsApi.get().then((p) => setAlwaysGate(p.scannerAlwaysGate));
  }, []);

  async function toggle() {
    const next = !(alwaysGate ?? true);
    const res = await automationPrefsApi.set({ scannerAlwaysGate: next });
    setAlwaysGate(res.scannerAlwaysGate);
    setStatus(res.scannerAlwaysGate ? "scanner will always gate" : "scanner now follows per-host policy");
    setTimeout(() => setStatus(null), 2500);
  }

  return (
    <div className="space-y-2 text-xs">
      <Section label="Scanner autonomous actions">
        <p className="mb-2 text-[11px] text-neutral-400">
          When the scanner's proactive loop decides to{" "}
          <span className="text-passio-pulp">act</span>, should Passio always show the countdown
          toast, or obey your per-host policy?
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={alwaysGate ?? true}
            onChange={toggle}
            className="no-drag accent-passio-pulp"
          />
          <span>Always require countdown confirmation (recommended)</span>
        </label>
        {status && <p className="mt-2 text-[11px] text-emerald-300">{status}</p>}
      </Section>
    </div>
  );
}
