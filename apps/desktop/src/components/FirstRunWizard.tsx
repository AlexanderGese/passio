import { useState } from "react";
import clsx from "clsx";
import { goalCreate, keychainApi, packApi } from "../ipc";
import { invoke } from "@tauri-apps/api/core";

/**
 * 5-step first-run wizard. Renders as a full-window overlay — it replaces
 * the bubble until the user completes or skips it.
 *
 * Steps: welcome → key → vault → first goal → pack.
 */
type Step = 0 | 1 | 2 | 3 | 4;

export function FirstRunWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>(0);
  const [key, setKey] = useState("");
  const [vault, setVault] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState(() => plusMonths(12));
  const [pack, setPack] = useState<"work" | "study" | "chill">("work");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const advance = () => setStep((s) => Math.min(4, s + 1) as Step);
  const back = () => setStep((s) => Math.max(0, s - 1) as Step);

  async function finish() {
    setBusy(true);
    setErr(null);
    try {
      if (key.trim()) await keychainApi.set("openai", key.trim());
      if (vault.trim()) {
        await invoke("request_scan", { reason: "manual" }).catch(() => {});
      }
      if (goalTitle.trim()) {
        await goalCreate({
          title: goalTitle.trim(),
          target_date: goalTarget,
          category: "personal",
        });
      }
      await packApi.set(pack);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-drag pointer-events-auto flex h-[480px] w-[340px] flex-col rounded-2xl border border-passio-skinLight/40 bg-neutral-950/98 p-4 text-[13px] text-neutral-100 shadow-2xl backdrop-blur">
      <header className="mb-2 flex items-center justify-between">
        <span className="text-passio-pulp font-medium">🍇 Welcome to Passio</span>
        <Dots step={step} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {step === 0 && <Welcome />}
        {step === 1 && (
          <Field
            label="OpenAI API key"
            hint="Stored in your OS keychain. Never transmitted except to api.openai.com."
          >
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-proj-…"
              className="no-drag w-full rounded-md border border-white/10 bg-black/40 p-2 focus:border-passio-pulp focus:outline-none"
              autoFocus
            />
          </Field>
        )}
        {step === 2 && (
          <Field
            label="Obsidian vault path"
            hint="Optional. Leave blank to skip. Passio will only write inside <vault>/passio/."
          >
            <input
              type="text"
              value={vault}
              onChange={(e) => setVault(e.target.value)}
              placeholder="/home/you/Documents/ObsidianVault"
              className="no-drag w-full rounded-md border border-white/10 bg-black/40 p-2 focus:border-passio-pulp focus:outline-none"
            />
          </Field>
        )}
        {step === 3 && (
          <div className="space-y-2">
            <Field
              label="Your first big goal"
              hint="I'll auto-decompose this into milestones via the power model."
            >
              <input
                type="text"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder="e.g. Launch a SaaS in 12 months"
                className="no-drag w-full rounded-md border border-white/10 bg-black/40 p-2 focus:border-passio-pulp focus:outline-none"
              />
            </Field>
            <Field label="Target date">
              <input
                type="date"
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
                className="no-drag w-full rounded-md border border-white/10 bg-black/40 p-2 focus:border-passio-pulp focus:outline-none"
              />
            </Field>
          </div>
        )}
        {step === 4 && (
          <Field label="How should Passio behave by default?" hint="Cycle later with Super+M.">
            <div className="grid grid-cols-3 gap-1">
              {(["work", "study", "chill"] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPack(p)}
                  className={clsx(
                    "rounded-md p-2 text-center",
                    pack === p
                      ? "bg-passio-pulp/80 text-black"
                      : "bg-black/30 hover:bg-passio-skinLight/30",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>
        )}
        {err && <p className="mt-2 text-red-400">{err}</p>}
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="rounded-md px-3 py-1.5 text-neutral-400 hover:text-neutral-100 disabled:opacity-30"
        >
          back
        </button>
        <button type="button" onClick={onDone} className="text-[11px] text-neutral-500 hover:text-neutral-300">
          skip
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={advance}
            className="rounded-md bg-passio-pulp/80 px-3 py-1.5 text-black hover:bg-passio-pulp"
          >
            next
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={busy}
            className="rounded-md bg-passio-pulp/80 px-3 py-1.5 text-black hover:bg-passio-pulp disabled:opacity-40"
          >
            {busy ? "saving…" : "finish"}
          </button>
        )}
      </footer>
    </div>
  );
}

function Welcome() {
  return (
    <div className="space-y-2 text-[12px] text-neutral-200">
      <p>
        Passio is a <span className="text-passio-pulp">local-first</span> desktop AI
        assistant — a passionfruit that lives in your corner, remembers what matters,
        chases big goals, and acts in your browser with your permission.
      </p>
      <p className="text-neutral-400">
        In the next steps we'll set up your API key, optional Obsidian vault,
        first goal, and default context pack. You can skip any of these and
        change them later.
      </p>
      <p className="text-[11px] text-emerald-300">
        ✓ Zero telemetry. Everything stays on this machine unless you explicitly
        call an API.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-neutral-400">{label}</span>
      {children}
      {hint && <p className="mt-1 text-[10px] text-neutral-500">{hint}</p>}
    </label>
  );
}

function Dots({ step }: { step: number }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            i <= step ? "bg-passio-pulp" : "bg-neutral-600",
          )}
        />
      ))}
    </div>
  );
}

function plusMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
