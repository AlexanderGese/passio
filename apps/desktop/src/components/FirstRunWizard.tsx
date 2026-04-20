import { useEffect, useState } from "react";
import clsx from "clsx";
import { firstRunApi, goalCreate, keychainApi, packApi, personaTreeApi, vaultApi, type PersonaNode } from "../ipc";
import { invoke } from "@tauri-apps/api/core";

/**
 * 5-step first-run wizard. Renders as a full-window overlay — it replaces
 * the bubble until the user completes or skips it.
 *
 * Steps: welcome → key → vault → first goal → pack.
 */
type Step = 0 | 1 | 2 | 3 | 4 | 5;

export function FirstRunWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>(0);
  const [key, setKey] = useState("");
  const [vault, setVault] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState(() => plusMonths(12));
  const [pack, setPack] = useState<"work" | "study" | "chill">("work");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [personaTree, setPersonaTree] = useState<PersonaNode[]>([]);
  const [personaPath, setPersonaPath] = useState<string[]>([]);

  useEffect(() => {
    personaTreeApi
      .get()
      .then((r) => setPersonaTree(r.tree))
      .catch(() => undefined);
  }, []);

  const advance = () => setStep((s) => Math.min(5, s + 1) as Step);
  const back = () => setStep((s) => Math.max(0, s - 1) as Step);

  async function finish() {
    setBusy(true);
    setErr(null);
    try {
      if (key.trim()) await keychainApi.set("openai", key.trim());
      if (vault.trim()) {
        await vaultApi.setRoot(vault.trim()).catch(() => {});
        await vaultApi.index().catch(() => {});
        await invoke("request_scan", { reason: "manual" }).catch(() => {});
      }
      if (personaPath.length === 3) {
        await personaTreeApi.applyPath(personaPath).catch(() => {});
      }
      if (goalTitle.trim()) {
        await goalCreate({
          title: goalTitle.trim(),
          target_date: goalTarget,
          category: "personal",
        });
      }
      await packApi.set(pack);
      await firstRunApi.mark().catch(() => {});
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    // Mark done even on skip so we don't harass the user every boot.
    // They can re-run the wizard from Settings → Re-run wizard.
    await firstRunApi.mark().catch(() => {});
    onDone();
  }

  return (
    <div className="no-drag pointer-events-auto flex h-[480px] w-[340px] flex-col rounded-2xl border border-passio-skinLight/40 bg-[#120E1A] p-4 text-[14px] text-neutral-100 shadow-2xl ">
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
              className="no-drag w-full rounded-md border border-passio-border bg-[#241B30] p-2 focus:border-passio-pulp focus:outline-none"
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
              className="no-drag w-full rounded-md border border-passio-border bg-[#241B30] p-2 focus:border-passio-pulp focus:outline-none"
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
                className="no-drag w-full rounded-md border border-passio-border bg-[#241B30] p-2 focus:border-passio-pulp focus:outline-none"
              />
            </Field>
            <Field label="Target date">
              <input
                type="date"
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
                className="no-drag w-full rounded-md border border-passio-border bg-[#241B30] p-2 focus:border-passio-pulp focus:outline-none"
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
                      : "bg-[#1A1422] hover:bg-passio-skinLight/30",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>
        )}
        {step === 5 && (
          <PersonaStep
            tree={personaTree}
            path={personaPath}
            onPick={(newPath) => setPersonaPath(newPath)}
          />
        )}
        {err && <p className="mt-2 text-red-400">{err}</p>}
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="rounded-md px-3 py-1.5 text-neutral-200 hover:text-neutral-100 disabled:opacity-30"
        >
          back
        </button>
        <button type="button" onClick={skip} className="text-[14px] text-neutral-300 hover:text-neutral-200">
          skip
        </button>
        {step < 5 ? (
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
    <div className="space-y-2 text-[14px] text-neutral-200">
      <p>
        Passio is a <span className="text-passio-pulp">local-first</span> desktop AI
        assistant — a passionfruit that lives in your corner, remembers what matters,
        chases big goals, and acts in your browser with your permission.
      </p>
      <p className="text-neutral-200">
        In the next steps we'll set up your API key, optional Obsidian vault,
        first goal, and default context pack. You can skip any of these and
        change them later.
      </p>
      <p className="text-[14px] text-emerald-300">
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
      <span className="mb-1 block text-neutral-200">{label}</span>
      {children}
      {hint && <p className="mt-1 text-[14px] text-neutral-300">{hint}</p>}
    </label>
  );
}

function Dots({ step }: { step: number }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4, 5].map((i) => (
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

function PersonaStep({
  tree,
  path,
  onPick,
}: {
  tree: PersonaNode[];
  path: string[];
  onPick: (p: string[]) => void;
}) {
  const options = resolveLevel(tree, path);
  const levelLabel = path.length === 0 ? "What kind of companion?" : path.length === 1 ? "Sharpen the tone" : "Pick a flavor";
  const hint =
    path.length === 0
      ? "Five archetypes. Each gets more specific in the next two steps."
      : path.length === 1
        ? "Now the tone of voice."
        : "Last pick — a specific flavor.";
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[14px] text-passio-cream">{levelLabel}</p>
        <p className="text-[12px] text-neutral-400">{hint} · step {path.length + 1} of 3</p>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick([...path, o.id])}
            className={clsx(
              "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] transition-colors",
              path[path.length - 1] === o.id
                ? "border-passio-pulp bg-passio-pulp/15"
                : "border-passio-border bg-[#1A1422] hover:border-passio-pulp/50",
            )}
          >
            <span className="text-[18px] leading-none">{o.emoji}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-passio-cream">{o.title}</span>
              <span className="block truncate text-[12px] text-neutral-400">{o.tagline}</span>
            </span>
          </button>
        ))}
      </div>
      {path.length > 0 && (
        <button
          type="button"
          onClick={() => onPick(path.slice(0, -1))}
          className="text-[12px] text-neutral-400 hover:text-passio-pulp"
        >
          ← back to previous pick
        </button>
      )}
      {path.length === 3 && (
        <p className="mt-1 text-[12px] text-emerald-300">
          ✓ Persona set. Click finish to save.
        </p>
      )}
    </div>
  );
}

function resolveLevel(tree: PersonaNode[], path: string[]): PersonaNode[] {
  let level = tree;
  for (const id of path) {
    const match = level.find((n) => n.id === id);
    if (!match) return [];
    level = match.children ?? [];
  }
  return level;
}

function plusMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
