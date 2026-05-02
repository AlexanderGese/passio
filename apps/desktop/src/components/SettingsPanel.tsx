import clsx from "clsx";
import { useState } from "react";
import { AboutSection } from "./settings/AboutSection";
import { KeybindsSection } from "./settings/KeybindsSection";
import { KeysSection } from "./settings/KeysSection";
import { PersonaSection } from "./settings/PersonaSection";

type Section = "persona" | "keys" | "keybinds" | "about";

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "persona", label: "Persona", icon: "🍇" },
  { id: "keys", label: "API keys", icon: "🔑" },
  { id: "keybinds", label: "Keybinds", icon: "⌨" },
  { id: "about", label: "About", icon: "ℹ" },
];

export function SettingsPanel() {
  const [section, setSection] = useState<Section>("persona");

  return (
    <div className="flex h-full gap-3">
      <nav className="flex w-[108px] shrink-0 flex-col gap-1 overflow-y-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={clsx(
              "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
              section === s.id
                ? "bg-passio-skin text-passio-cream"
                : "text-neutral-300 hover:bg-passio-panelAlt hover:text-passio-cream",
            )}
          >
            <span className="text-[15px]">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-2.5">
        {section === "persona" && <PersonaSection />}
        {section === "keys" && <KeysSection />}
        {section === "keybinds" && <KeybindsSection />}
        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}
