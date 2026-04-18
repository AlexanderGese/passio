import { useEffect, useState } from "react";
import { policyApi } from "../../ipc";
import { Section } from "./_shared";

type Policy = "observe_only" | "ask_first" | "full_auto";

export function PolicySection() {
  const [domains, setDomains] = useState<Record<string, Policy>>({});
  const [countdown, setCountdown] = useState<number>(3);
  const [blocklist, setBlocklist] = useState<
    Array<{ kind: "selector" | "url_contains"; pattern: string; reason: string }>
  >([]);
  const [newHost, setNewHost] = useState("");
  const [newPolicy, setNewPolicy] = useState<Policy>("ask_first");
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    const res = await policyApi.get();
    setDomains(res.domains);
    setCountdown(res.countdownSeconds);
    setBlocklist(res.blocklist);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function addHost() {
    const h = newHost.trim().toLowerCase();
    if (!h) return;
    await policyApi.setHost(h, newPolicy);
    setNewHost("");
    await refresh();
  }
  async function changeHost(host: string, policy: Policy) {
    await policyApi.setHost(host, policy);
    await refresh();
  }
  async function removeHost(host: string) {
    await policyApi.deleteHost(host);
    await refresh();
  }
  async function changeCountdown(n: number) {
    setCountdown(n);
    await policyApi.setCountdown(n);
    setStatus(`countdown ${n}s`);
    setTimeout(() => setStatus(null), 1500);
  }
  async function removeBlocklistEntry(idx: number) {
    const next = blocklist.filter((_, i) => i !== idx);
    await policyApi.setBlocklist(next);
    setBlocklist(next);
  }

  return (
    <div className="space-y-2 text-xs">
      <Section label="Countdown before autonomous action">
        <input
          type="range"
          min={1}
          max={10}
          value={countdown}
          onChange={(e) => changeCountdown(Number(e.target.value))}
          className="no-drag w-full accent-passio-pulp"
        />
        <p className="text-[11px] text-neutral-400">{countdown}s — Esc cancels</p>
        {status && <p className="text-[10px] text-emerald-300">{status}</p>}
      </Section>

      <Section label="Per-host policy">
        {Object.keys(domains).length === 0 && (
          <p className="text-[11px] text-neutral-500">
            (no overrides — every host defaults to full_auto)
          </p>
        )}
        <ul className="space-y-1">
          {Object.entries(domains).map(([host, policy]) => (
            <li key={host} className="flex items-center gap-1">
              <span className="flex-1 truncate text-neutral-300" title={host}>
                {host}
              </span>
              <select
                value={policy}
                onChange={(e) => changeHost(host, e.target.value as Policy)}
                className="no-drag rounded-md border border-white/10 bg-black/40 p-1"
              >
                <option value="observe_only">observe_only</option>
                <option value="ask_first">ask_first</option>
                <option value="full_auto">full_auto</option>
              </select>
              <button
                type="button"
                onClick={() => removeHost(host)}
                className="text-neutral-500 hover:text-red-300"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-1">
          <input
            value={newHost}
            onChange={(e) => setNewHost(e.target.value)}
            placeholder="github.com"
            className="no-drag flex-1 rounded-md border border-white/10 bg-black/40 p-1.5 focus:border-passio-pulp focus:outline-none"
          />
          <select
            value={newPolicy}
            onChange={(e) => setNewPolicy(e.target.value as Policy)}
            className="no-drag rounded-md border border-white/10 bg-black/40 p-1"
          >
            <option value="observe_only">observe_only</option>
            <option value="ask_first">ask_first</option>
            <option value="full_auto">full_auto</option>
          </select>
          <button
            type="button"
            onClick={addHost}
            disabled={!newHost.trim()}
            className="rounded-md bg-passio-pulp/80 px-2 text-black hover:bg-passio-pulp disabled:opacity-40"
          >
            add
          </button>
        </div>
      </Section>

      <Section label="Dangerous-action blocklist">
        {blocklist.length === 0 ? (
          <p className="text-[11px] text-neutral-500">(empty)</p>
        ) : (
          <ul className="space-y-1">
            {blocklist.map((b, i) => (
              <li key={`${b.kind}:${b.pattern}:${i}`} className="flex items-center gap-2">
                <span className="rounded bg-black/40 px-1 text-[10px] text-neutral-400">
                  {b.kind}
                </span>
                <code className="flex-1 truncate text-[11px]" title={b.pattern}>
                  {b.pattern}
                </code>
                <span className="text-[10px] text-neutral-500">{b.reason}</span>
                <button
                  type="button"
                  onClick={() => removeBlocklistEntry(i)}
                  className="text-neutral-500 hover:text-red-300"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
