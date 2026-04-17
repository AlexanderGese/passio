import { useEffect, useState } from "react";

/**
 * Cartoon-style speech bubble that pops out of the avatar. Auto-dismisses
 * after `ttlMs`. Used for unprompted messages from Passio (scan nudges,
 * scheduled briefings, voice-mode replies). Chat-panel replies render in
 * the normal message list, not here.
 */
interface Props {
  message: string | null;
  ttlMs: number;
  name: string;
  onDone: () => void;
}

export function SpeechBubble({ message, ttlMs, name, onDone }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 200); // let fade-out play
    }, ttlMs);
    return () => clearTimeout(t);
  }, [message, ttlMs, onDone]);

  if (!message) return null;

  return (
    <div
      className={`pointer-events-auto absolute bottom-16 right-16 max-w-[220px] transition-all duration-200 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
      onClick={() => {
        setVisible(false);
        setTimeout(onDone, 200);
      }}
      role="button"
      tabIndex={0}
    >
      <div className="relative rounded-2xl border border-passio-skinLight/40 bg-neutral-950/95 px-3 py-2 shadow-2xl backdrop-blur">
        <span className="text-[10px] uppercase tracking-wide text-passio-pulp">{name}</span>
        <p className="mt-0.5 text-[12px] leading-snug text-neutral-100">{message}</p>
        {/* Tail */}
        <span
          className="absolute -bottom-[7px] right-5 h-3 w-3 rotate-45 border-b border-r border-passio-skinLight/40 bg-neutral-950/95"
          aria-hidden
        />
      </div>
    </div>
  );
}
