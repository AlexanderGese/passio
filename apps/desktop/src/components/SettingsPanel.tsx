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
import { RssSection } from "./settings/RssSection";
import { WeatherSection } from "./settings/WeatherSection";

type Section =
  | "persona"
  | "keybinds"
  | "keys"
  | "mail"
  | "calendar"
  | "rss"
  | "weather"
  | "policy"
  | "automation"
  | "privacy";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "persona", label: "Persona" },
  { id: "keybinds", label: "Keybinds" },
  { id: "keys", label: "API keys" },
  { id: "mail", label: "Mail" },
  { id: "calendar", label: "Calendar" },
  { id: "rss", label: "RSS" },
  { id: "weather", label: "Weather" },
  { id: "policy", label: "Policy" },
  { id: "automation", label: "Automation" },
  { id: "privacy", label: "Privacy" },
];

/**
 * Settings shell — two-column layout with a left-rail section picker and
 * the active section rendered on the right. Each section is a standalone
 * file under ./settings/.
 */
export function SettingsPanel({ onRunWizard }: { onRunWizard: () => void }) {
  const [section, setSection] = useState<Section>("persona");

  return (
    <div className="flex h-full gap-2 text-xs">
      <nav className="flex w-24 shrink-0 flex-col gap-0.5 overflow-y-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={clsx(
              "rounded-md px-2 py-1 text-left transition-colors",
              section === s.id
                ? "bg-passio-skinLight/40 text-passio-pulp"
                : "text-neutral-400 hover:text-neutral-100",
            )}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onRunWizard}
          className="mt-2 rounded-md border border-passio-skinLight/30 px-2 py-1 text-[10px] text-neutral-400 hover:text-passio-pulp"
        >
          Re-run wizard
        </button>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {section === "persona" && <PersonaSection />}
        {section === "keybinds" && <KeybindsSection />}
        {section === "keys" && <KeysSection />}
        {section === "mail" && <MailSection />}
        {section === "calendar" && <CalendarSection />}
        {section === "rss" && <RssSection />}
        {section === "weather" && <WeatherSection />}
        {section === "policy" && <PolicySection />}
        {section === "automation" && <AutomationSection />}
        {section === "privacy" && <PrivacySection />}
      </div>
    </div>
  );
}
