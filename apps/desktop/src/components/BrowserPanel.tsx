import clsx from "clsx";
import { useEffect, useState } from "react";
import { type BridgeStatus, bridgeStatus, summarizePage } from "../ipc";

/**
 * Browser panel: shows extension pairing state + quick tools.
 *
 * Tasks it's responsible for:
 *   • Surface the pairing (port + token) so the user can paste it into
 *     the Chrome extension's options page.
 *   • Live-update when the extension connects.
 *   • Provide a one-click "Summarize current tab" as a smoke test.
 */
export function BrowserPanel() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ title: string; url: string; summary: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setStatus(await bridgeStatus());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 3_000);
    return () => clearInterval(t);
  }, []);

  async function runSummary() {
    setBusy(true);
    setSummary(null);
    setErr(null);
    try {
      setSummary(await summarizePage("bullet"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 text-[14px]">
      <header className="flex items-center justify-between">
        <span className="uppercase tracking-wide text-neutral-200">Browser extension</span>
        <StatusDot connected={status?.connected ?? false} clients={status?.clients ?? 0} />
      </header>

      {!status && <p className="text-neutral-300">loading…</p>}

      {status && !status.connected && <Pairing status={status} />}

      {status?.connected && (
        <div className="space-y-2">
          <div className="rounded-lg bg-emerald-900/20 px-3 py-2 text-emerald-300">
            Extension connected ({status.clients} client{status.clients === 1 ? "" : "s"}).
          </div>
          <button
            type="button"
            onClick={runSummary}
            disabled={busy}
            className="w-full rounded-md bg-passio-pulp/80 p-2 text-sm text-black font-medium hover:bg-passio-pulp disabled:opacity-40"
          >
            {busy ? "summarizing…" : "Summarize current tab (bullet)"}
          </button>
          {summary && (
            <div className="rounded-lg bg-[#1A1422] p-3 text-[14px] leading-relaxed">
              <p className="truncate font-medium text-passio-pulp">{summary.title}</p>
              <p className="truncate text-neutral-300">{summary.url}</p>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-neutral-200">{summary.summary}</pre>
            </div>
          )}
        </div>
      )}
      {err && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-red-300">{err}</p>}
    </div>
  );
}

function StatusDot({ connected, clients }: { connected: boolean; clients: number }) {
  return (
    <span className="flex items-center gap-1.5 text-[14px] text-neutral-200">
      <span
        className={clsx(
          "h-2 w-2 rounded-full",
          connected ? "bg-emerald-400" : "bg-neutral-600",
        )}
      />
      {connected ? `${clients} paired` : "not paired"}
    </span>
  );
}

function Pairing({ status }: { status: BridgeStatus }) {
  const [copied, setCopied] = useState<"" | "port" | "token">("");
  async function copy(kind: "port" | "token", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(""), 1200);
    } catch {
      /* some envs block clipboard */
    }
  }
  return (
    <div className="space-y-2 rounded-lg bg-[#1A1422] p-3">
      <p className="text-[14px] text-neutral-200 leading-relaxed">
        Install the unpacked Chrome extension (
        <code className="text-passio-pulp">apps/extension/dist</code>) and paste these
        into its options page:
      </p>
      <Row label="Port" value={String(status.port)} copied={copied === "port"} onCopy={() => copy("port", String(status.port))} />
      <Row label="Token" value={status.token} mono truncate copied={copied === "token"} onCopy={() => copy("token", status.token)} />
      <p className="text-[14px] text-neutral-400">
        Token rotates on every Passio restart; re-pair after restart.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
  mono = false,
  truncate = false,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-neutral-300">{label}</span>
      <code
        className={clsx(
          "flex-1 rounded bg-[#0E0A14] px-2 py-1 text-[14px]",
          mono && "font-mono",
          truncate && "truncate",
        )}
        title={value}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="rounded-md bg-passio-skinLight/30 px-2 py-1 text-[14px] hover:bg-passio-skinLight/40"
      >
        {copied ? "✓" : "copy"}
      </button>
    </div>
  );
}
