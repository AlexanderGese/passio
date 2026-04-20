import clsx from "clsx";
import { useState } from "react";
import { AutomationSection } from "./settings/AutomationSection";
import { CalendarSection } from "./settings/CalendarSection";
import { KeybindsSection } from "./settings/KeybindsSection";
import { KeysSection } from "./settings/KeysSection";
import { MailSection } from "./settings/MailSection";
import { PersonaSection } from "./settings/PersonaSection";
import { PolicySection } from "./settings/PolicySection";
import { PrivacySection } from "./settings/PrivacySection";
import { AboutSection } from "./settings/AboutSection";
import { HeaderLayoutSection } from "./settings/HeaderLayoutSection";
import { RssSection } from "./settings/RssSection";
import { TodoMdSection } from "./settings/TodoMdSection";
import { VaultSection } from "./settings/VaultSection";
import { WeatherSection } from "./settings/WeatherSection";

type Section =
  | "persona"
  | "keybinds"
  | "keys"
  | "mail"
  | "calendar"
  | "rss"
  | "weather"
  | "vault"
  | "todomd"
  | "policy"
  | "automation"
  | "privacy"
  | "header"
  | "about";

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "persona", label: "Persona", icon: "🍇" },
  { id: "header", label: "Header", icon: "🧩" },
  { id: "keybinds", label: "Keybinds", icon: "⌨" },
  { id: "keys", label: "API keys", icon: "🔑" },
  { id: "mail", label: "Mail", icon: "✉" },
  { id: "calendar", label: "Calendar", icon: "📅" },
  { id: "rss", label: "RSS", icon: "📡" },
  { id: "weather", label: "Weather", icon: "☀" },
  { id: "vault", label: "Vault", icon: "📚" },
  { id: "todomd", label: "Todo.md", icon: "✅" },
  { id: "policy", label: "Policy", icon: "🛡" },
  { id: "automation", label: "Automation", icon: "⚡" },
  { id: "privacy", label: "Privacy", icon: "🔒" },
  { id: "about", label: "About", icon: "ℹ" },
];

export function SettingsPanel({ onRunWizard }: { onRunWizard: () => void }) {
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
        <button
          type="button"
          onClick={onRunWizard}
          className="mt-2 rounded-lg border border-passio-border px-2.5 py-2 text-[12px] font-medium text-neutral-300 transition-colors hover:border-passio-pulp hover:text-passio-pulp"
        >
          Re-run wizard
        </button>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-2.5">
        {section === "persona" && <PersonaSection />}
        {section === "header" && <HeaderLayoutSection />}
        {section === "keybinds" && <KeybindsSection />}
        {section === "keys" && <KeysSection />}
        {section === "mail" && <MailSection />}
        {section === "calendar" && <CalendarSection />}
        {section === "rss" && <RssSection />}
        {section === "weather" && <WeatherSection />}
        {section === "vault" && <VaultSection />}
        {section === "todomd" && <TodoMdSection />}
        {section === "policy" && <PolicySection />}
        {section === "automation" && <AutomationSection />}
        {section === "privacy" && <PrivacySection />}
        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}
