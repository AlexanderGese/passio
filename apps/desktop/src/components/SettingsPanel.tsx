import { useEffect, useState } from "react";
import { keychainApi } from "../ipc";

/**
 * Settings panel — v1 surface for what actually matters for a fresh install.
 *
 * Deeper settings (model overrides, packs editor, SQLCipher toggle, plugin
 * registry) are still handled from chat or by editing ~/.config/passio
 * files directly; this panel is the minimal UX to configure a key and
 * re-run the wizard.
 */
export function SettingsPanel({ onRunWizard }: { onRunWizard: () => void }) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [hasOpenai, setHasOpenai] = useState<boolean | null>(null);
  const [hasAnthropic, setHasAnthropic] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    setHasOpenai(await keychainApi.has("openai"));
    setHasAnthropic(await keychainApi.has("anthropic"));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save(kind: "openai" | "anthropic", value: string, clearField: () => void) {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await keychainApi.set(kind, value.trim());
      clearField();
      await refresh();
      setStatus(`${kind} saved to OS keychain — restart app to take effect`);
      setTimeout(() => setStatus(null), 3_000);
    } catch (e) {
      setStatus(`⚠ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto text-xs">
      <Section label="API keys (OS keyring)">
        <KeyRow
          label="OpenAI"
          has={hasOpenai}
          value={openaiKey}
          setValue={setOpenaiKey}
          save={() => save("openai", openaiKey, () => setOpenaiKey(""))}
          remove={async () => {
            await keychainApi.delete("openai");
            await refresh();
          }}
          disabled={busy}
        />
        <KeyRow
          label="Anthropic"
          has={hasAnthropic}
          value={anthropicKey}
          setValue={setAnthropicKey}
          save={() => save("anthropic", anthropicKey, () => setAnthropicKey(""))}
          remove={async () => {
            await keychainApi.delete("anthropic");
            await refresh();
          }}
          disabled={busy}
        />
        {status && <p className="text-[11px] text-passio-pulp mt-1">{status}</p>}
      </Section>

      <Section label="Setup">
        <button
          type="button"
          onClick={onRunWizard}
          className="w-full rounded-md bg-passio-skinLight/30 p-2 hover:bg-passio-skinLight/50"
        >
          Re-run first-run wizard
        </button>
      </Section>

      <Section label="Where things live">
        <ul className="space-y-0.5 text-[11px] text-neutral-400">
          <li>
            <code className="text-passio-pulp">~/.local/share/passio/db.sqlite</code> · DB
          </li>
          <li>
            <code className="text-passio-pulp">~/.local/share/passio/logs/</code> · logs
          </li>
          <li>
            <code className="text-passio-pulp">~/.config/passio/</code> · config + pairing
          </li>
        </ul>
      </Section>

      <Section label="Telemetry">
        <p className="text-[11px] text-emerald-300">
          Off. Passio never phones home. Only outbound: LLM API calls with your key.
        </p>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-black/20 p-2">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      {children}
    </div>
  );
}

function KeyRow({
  label,
  has,
  value,
  setValue,
  save,
  remove,
  disabled,
}: {
  label: string;
  has: boolean | null;
  value: string;
  setValue: (s: string) => void;
  save: () => void | Promise<void>;
  remove: () => void | Promise<void>;
  disabled: boolean;
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className={has ? "text-emerald-400" : "text-neutral-500"}>
          {has === null ? "…" : has ? "✓ stored" : "not set"}
        </span>
      </div>
      <div className="mt-1 flex gap-1">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={has ? "paste new key to replace" : "paste key"}
          className="no-drag flex-1 rounded-md border border-white/10 bg-black/40 p-1.5 focus:border-passio-pulp focus:outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={disabled || !value.trim()}
          className="rounded-md bg-passio-pulp/80 px-2 text-black hover:bg-passio-pulp disabled:opacity-40"
        >
          save
        </button>
        {has && (
          <button
            type="button"
            onClick={remove}
            disabled={disabled}
            className="rounded-md bg-red-900/40 px-2 text-red-200 hover:bg-red-900/60"
          >
            forget
          </button>
        )}
      </div>
    </div>
  );
}
