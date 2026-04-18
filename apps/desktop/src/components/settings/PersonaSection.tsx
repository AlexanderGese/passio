import { useEffect, useState } from "react";
import { type Persona, personaApi } from "../../ipc";
import { usePassioStore } from "../../store";
import { Section } from "./_shared";

export function PersonaSection() {
  const { setAssistantName } = usePassioStore();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    personaApi.get().then((p) => {
      setPersona(p);
      setName(p.name);
    });
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

  if (!persona) return <p className="text-[11px] text-neutral-500">loading…</p>;

  return (
    <div className="flex flex-col gap-2 text-xs">
      <Section label="Your Passio's name">
        <div className="flex gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Passio"
            className="no-drag flex-1 rounded-md border border-white/10 bg-black/40 p-1.5 focus:border-passio-pulp focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={!name.trim() || name === persona.name}
            className="rounded-md bg-passio-pulp/80 px-2 text-black hover:bg-passio-pulp disabled:opacity-40"
          >
            save
          </button>
        </div>
        {status && <p className="mt-1 text-[11px] text-emerald-300">{status}</p>}
      </Section>
      <Section label="TTS voice">
        <select
          value={persona.voice}
          onChange={(e) => changeVoice(e.target.value as Persona["voice"])}
          className="no-drag w-full rounded-md border border-white/10 bg-black/40 p-1.5 focus:border-passio-pulp focus:outline-none"
        >
          {(["alloy", "echo", "fable", "nova", "onyx", "shimmer"] as const).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Section>
    </div>
  );
}
