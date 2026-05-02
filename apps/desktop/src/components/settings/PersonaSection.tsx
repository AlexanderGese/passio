import { useEffect, useState } from "react";
import { type Persona, personaApi } from "../../ipc";
import { usePassioStore } from "../../store";
import { PrimaryButton, Section } from "./_shared";

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

  if (!persona) return <p className="text-[13px] text-neutral-400">loading…</p>;

  return (
    <Section label="Persona" hint="Your assistant's name + voice. Keep it simple.">
      <label className="flex items-center gap-2 text-[14px] text-neutral-300">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="no-drag flex-1 rounded-md border border-passio-border bg-[#1A1422] px-2 py-1 text-passio-cream focus:border-passio-pulp focus:outline-none"
        />
      </label>
      <PrimaryButton
        label="Save"
        onClick={() => void save()}
        disabled={!name.trim() || name === persona.name}
      />
      {status && <span className="ml-2 text-[12px] text-neutral-400">{status}</span>}
    </Section>
  );
}
