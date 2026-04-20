import { useEffect, useState } from "react";
import { keychainApi } from "../../ipc";
import { Section } from "./_shared";

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "vercel_sandbox_token", label: "Vercel Sandbox" },
  { id: "db_cipher", label: "DB cipher (SQLCipher)" },
] as const;

export function KeysSection() {
  const [has, setHas] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    const next: Record<string, boolean> = {};
    for (const p of PROVIDERS) next[p.id] = await keychainApi.has(p.id);
    setHas(next);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function save(id: string) {
    const v = (drafts[id] ?? "").trim();
    if (!v) return;
    await keychainApi.set(id, v);
    setDrafts((d) => ({ ...d, [id]: "" }));
    await refresh();
    setStatus(`${id} saved — restart to apply`);
    setTimeout(() => setStatus(null), 2500);
  }
  async function forget(id: string) {
    await keychainApi.delete(id);
    await refresh();
  }

  return (
    <div className="space-y-2 text-[14px]">
      <Section label="API keys (stored in OS keychain)" hint="OpenAI powers chat, voice, and the scanner. Anthropic is the optional Claude fallback. All keys saved to OS keyring; fallback to ~/.config/passio/secrets.env if no keyring daemon.">
        {PROVIDERS.map((p) => (
          <div key={p.id} className="mb-2">
            <div className="flex items-center justify-between">
              <span>{p.label}</span>
              <span className={has[p.id] ? "text-emerald-400" : "text-neutral-300"}>
                {has[p.id] ? "✓ stored" : "not set"}
              </span>
            </div>
            <div className="mt-1 flex gap-1">
              <input
                type="password"
                value={drafts[p.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                placeholder={has[p.id] ? "paste new to replace" : "paste key"}
                className="no-drag flex-1 rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
              />
              <button
                type="button"
                onClick={() => save(p.id)}
                disabled={!(drafts[p.id] ?? "").trim()}
                className="rounded-md bg-passio-pulp/80 px-2 text-black hover:bg-passio-pulp disabled:opacity-40"
              >
                save
              </button>
              {has[p.id] && (
                <button
                  type="button"
                  onClick={() => forget(p.id)}
                  className="rounded-md bg-red-900/40 px-2 text-red-200 hover:bg-red-900/60"
                >
                  forget
                </button>
              )}
            </div>
          </div>
        ))}
        {status && <p className="text-[14px] text-emerald-300">{status}</p>}
      </Section>
    </div>
  );
}
