import clsx from "clsx";

interface Props {
  state: "idle" | "listening" | "thinking" | "talking" | "alert";
  sizePx?: number;
}

/**
 * Inline SVG placeholder avatar while the Gemini-rendered PNG assets
 * are being finalized. Swap to an <img> referencing
 * `src/avatar/{idle,talking}.png` once those files exist.
 */
export function PassioAvatar({ state, sizePx = 60 }: Props) {
  const mouthOpen = state === "talking";
  const halo = state === "listening" || state === "talking";
  const spin = state === "thinking";

  return (
    <div
      className={clsx("relative select-none", spin && "animate-gentle-spin")}
      style={{ width: sizePx, height: sizePx }}
    >
      {halo && (
        <div
          className="absolute inset-[-8px] rounded-full bg-passio-pulp/30 animate-pulse-halo"
          aria-hidden
        />
      )}
      <svg
        viewBox="0 0 120 120"
        width={sizePx}
        height={sizePx}
        className="relative drop-shadow-md"
        role="img"
        aria-label={`Passio, ${state}`}
      >
        <defs>
          <radialGradient id="body" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0%" stopColor="#8B3FA0" />
            <stop offset="70%" stopColor="#5B2A86" />
            <stop offset="100%" stopColor="#3E1A60" />
          </radialGradient>
          <radialGradient id="pulp" cx="0.5" cy="0.3" r="0.7">
            <stop offset="0%" stopColor="#FFD085" />
            <stop offset="100%" stopColor="#FFB84D" />
          </radialGradient>
        </defs>
        {/* Body */}
        <circle cx="60" cy="66" r="42" fill="url(#body)" />
        {/* Highlight */}
        <ellipse cx="46" cy="48" rx="10" ry="8" fill="#FFF4E0" opacity="0.45" />
        {/* Leaves */}
        <path d="M54 22 C48 12, 38 14, 36 24 C42 26, 50 26, 54 22 Z" fill="#7FB685" />
        <path d="M60 18 C64 6, 76 10, 78 22 C70 26, 62 24, 60 18 Z" fill="#95C79A" />
        <rect x="57" y="20" width="5" height="10" rx="2" fill="#5E8A63" />
        {/* Pulp belly */}
        <ellipse cx="60" cy="86" rx="18" ry="12" fill="url(#pulp)" />
        <circle cx="54" cy="86" r="1.5" fill="#2A1810" />
        <circle cx="60" cy="90" r="1.5" fill="#2A1810" />
        <circle cx="66" cy="84" r="1.5" fill="#2A1810" />
        <circle cx="62" cy="82" r="1.2" fill="#2A1810" />
        <circle cx="58" cy="92" r="1.2" fill="#2A1810" />
        {/* Eyes */}
        <circle cx="50" cy="58" r="6" fill="#FFFFFF" />
        <circle cx="70" cy="58" r="6" fill="#FFFFFF" />
        <circle cx="51" cy="60" r="3.2" fill="#1A0F30" />
        <circle cx="71" cy="60" r="3.2" fill="#1A0F30" />
        <circle cx="52" cy="58" r="1.2" fill="#FFFFFF" />
        <circle cx="72" cy="58" r="1.2" fill="#FFFFFF" />
        {/* Mouth */}
        {mouthOpen ? (
          <ellipse cx="60" cy="72" rx="5" ry="4" fill="#2A1020" stroke="#FFB84D" strokeWidth="1" />
        ) : (
          <path
            d="M54 72 Q60 76 66 72"
            stroke="#2A1020"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </svg>
    </div>
  );
}
