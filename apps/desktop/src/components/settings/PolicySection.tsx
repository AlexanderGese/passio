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
    <div className="space-y-2 text-[14px]">
      <Section label="Countdown before autonomous action" hint="When Passio tries to click/type/navigate on an ask_first domain, this is how long you have to cancel with Esc.">
        <input
          type="range"
          min={1}
          max={10}
          value={countdown}
          onChange={(e) => changeCountdown(Number(e.target.value))}
          className="no-drag w-full accent-passio-pulp"
        />
        <p className="text-[14px] text-neutral-200">{countdown}s — Esc cancels</p>
        {status && <p className="text-[14px] text-emerald-300">{status}</p>}
      </Section>

      <Section label="Per-host policy" hint="How Passio should treat each domain. observe_only = never act; ask_first = countdown each time; full_auto = silent. Default for unlisted domains is full_auto.">
        {Object.keys(domains).length === 0 && (
          <p className="text-[14px] text-neutral-300">
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
                className="no-drag rounded-md border border-passio-border bg-[#241B30] p-1"
              >
                <option value="observe_only">observe_only</option>
                <option value="ask_first">ask_first</option>
                <option value="full_auto">full_auto</option>
              </select>
              <button
                type="button"
                onClick={() => removeHost(host)}
                className="text-neutral-300 hover:text-red-300"
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
            className="no-drag flex-1 rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          />
          <select
            value={newPolicy}
            onChange={(e) => setNewPolicy(e.target.value as Policy)}
            className="no-drag rounded-md border border-passio-border bg-[#241B30] p-1"
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

      <Section label="Dangerous-action blocklist" hint="Regex patterns that force a countdown even on full_auto domains. Covers form submits, checkout flows, and unsubscribe links by default.">
        {blocklist.length === 0 ? (
          <p className="text-[14px] text-neutral-300">(empty)</p>
        ) : (
          <ul className="space-y-1">
            {blocklist.map((b, i) => (
              <li key={`${b.kind}:${b.pattern}:${i}`} className="flex items-center gap-2">
                <span className="rounded bg-[#241B30] px-1 text-[14px] text-neutral-200">
                  {b.kind}
                </span>
                <code className="flex-1 truncate text-[14px]" title={b.pattern}>
                  {b.pattern}
                </code>
                <span className="text-[14px] text-neutral-300">{b.reason}</span>
                <button
                  type="button"
                  onClick={() => removeBlocklistEntry(i)}
                  className="text-neutral-300 hover:text-red-300"
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
