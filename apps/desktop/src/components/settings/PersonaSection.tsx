import { useEffect, useState } from "react";
import { type Persona, personaApi, personaTreeApi } from "../../ipc";
import { sidecarCall } from "../../ipc-helpers";
import { usePassioStore } from "../../store";
import { PrimaryButton, Section } from "./_shared";

export function PersonaSection() {
  const { setAssistantName } = usePassioStore();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [customSaved, setCustomSaved] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    personaApi.get().then((p) => {
      setPersona(p);
      setName(p.name);
    });
    // Seed the custom prompt from whatever the tree picker last composed.
    sidecarCall<{ value: string } | null>("passio.settings.get", { key: "persona_prompt_extra" })
      .then((r) => {
        if (r && typeof r.value === "string") {
          try {
            const parsed = JSON.parse(r.value) as { prompt?: string; custom?: string };
            if (parsed.custom) setCustomPrompt(parsed.custom);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    if (!name.trim() || !persona) return;
    const next = await personaApi.set({ name: name.trim() });
    setPersona(next);
    setAssistantName(next.name);
    setStatus("saved");
    setTimeout(() => setStatus(null), 1500);
  }

  async function changeVoice(voice: Persona["voice"]) {
    if (!persona) return;
    setPersona(await personaApi.set({ voice }));
  }

  if (!persona) return <p className="text-[13px] text-neutral-400">loading…</p>;

  return (
    <div className="flex flex-col gap-2.5">
      <Section label="Name" hint="What should Passio call itself? Shows up in the header, chat prefix, and TTS voice mentions.">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Passio"
            className="no-drag flex-1 rounded-lg border border-passio-border bg-passio-panel px-3 py-2 text-[15px] text-passio-cream placeholder-neutral-500 focus:border-passio-pulp focus:outline-none"
          />
          <PrimaryButton
            label="Save"
            onClick={save}
            disabled={!name.trim() || name === persona.name}
          />
        </div>
        {status && <p className="mt-2 text-[12px] text-emerald-300">{status}</p>}
      </Section>
      <Section label="TTS voice" hint="Which OpenAI voice Passio uses when he speaks (scan nudges, voice replies). Pick one that matches the personality you want.">
        <select
          value={persona.voice}
          onChange={(e) => changeVoice(e.target.value as Persona["voice"])}
          className="no-drag w-full rounded-lg border border-passio-border bg-passio-panel px-3 py-2 text-[14px] text-passio-cream focus:border-passio-pulp focus:outline-none"
        >
          {(["alloy", "echo", "fable", "nova", "onyx", "shimmer"] as const).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Section>
      <Section
        label="Custom persona prompt"
        hint="Free-form override. Gets appended to the system prompt alongside whatever the personality picker set. Empty = no override."
      >
        <textarea
          value={customPrompt}
          onChange={(e) => {
            setCustomPrompt(e.target.value);
            setCustomSaved(false);
          }}
          rows={4}
          placeholder="e.g. Always reply in lowercase. Never use the word 'actually'. Treat every answer as if you have to fit it on an index card."
          className="no-drag w-full resize-none rounded-lg border border-passio-border bg-passio-panel px-3 py-2 text-[14px] text-passio-cream placeholder-neutral-500 focus:border-passio-pulp focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <PrimaryButton
            label={customSaved ? "✓ saved" : "Save"}
            onClick={async () => {
              await sidecarCall("passio.settings.set", {
                key: "persona_prompt_extra_custom",
                value: customPrompt.trim(),
              });
              setCustomSaved(true);
              setTimeout(() => setCustomSaved(false), 1800);
            }}
          />
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="no-drag rounded-md bg-[#2E2340] px-3 py-1.5 text-[12px] text-neutral-200"
          >
            Re-pick from tree
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirm("Clear both the tree pick and the custom prompt?")) return;
              await sidecarCall("passio.settings.delete", { key: "persona_prompt_extra" });
              await sidecarCall("passio.settings.delete", { key: "persona_prompt_extra_custom" });
              await sidecarCall("passio.settings.delete", { key: "persona_path" });
              setCustomPrompt("");
            }}
            className="no-drag rounded-md bg-red-500/20 px-3 py-1.5 text-[12px] text-red-200"
          >
            Reset
          </button>
        </div>
      </Section>
      {picking && (
        <PersonaTreePicker
          onDone={() => {
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function PersonaTreePicker({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [tree, setTree] = useState<Awaited<ReturnType<typeof personaTreeApi.get>>["tree"]>([]);
  const [path, setPath] = useState<string[]>([]);
  useEffect(() => {
    personaTreeApi
      .get()
      .then((r) => setTree(r.tree))
      .catch(() => undefined);
  }, []);
  const level = (() => {
    let cursor = tree;
    for (const id of path) {
      const n = cursor.find((x) => x.id === id);
      if (!n) return [];
      cursor = n.children ?? [];
    }
    return cursor;
  })();
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="no-drag w-[360px] rounded-xl border border-passio-pulp/40 bg-[#1A1422] p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-[12px] text-passio-pulpBright">
          Persona tree · step {path.length + 1} of 3
        </p>
        <div className="space-y-1.5">
          {level.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={async () => {
                const next = [...path, n.id];
                if (next.length === 3) {
                  await personaTreeApi.applyPath(next).catch(() => undefined);
                  onDone();
                  return;
                }
                setPath(next);
              }}
              className="flex w-full items-start gap-2 rounded-md bg-[#241B30] px-2.5 py-2 text-left text-[13px] hover:bg-passio-pulp/20"
            >
              <span className="text-[16px]">{n.emoji}</span>
              <span className="min-w-0">
                <span className="block text-passio-cream">{n.title}</span>
                <span className="block truncate text-[11px] text-neutral-400">{n.tagline}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          {path.length > 0 ? (
            <button
              type="button"
              onClick={() => setPath(path.slice(0, -1))}
              className="text-neutral-400 hover:text-passio-pulp"
            >
              ← back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onCancel}
            className="text-neutral-400 hover:text-neutral-200"
          >
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}
