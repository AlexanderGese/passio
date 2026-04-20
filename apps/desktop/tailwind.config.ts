import type { Config } from "tailwindcss";

/**
 * Passionfruit palette + typography scale. W21 redesign: bumped the base
 * size to 15px, introduced pulpBright/borderBright for contrast, and a
 * panel shadow preset so nested cards feel crisp against the dark bg.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        passio: {
          skin: "#6B3A9E",
          skinLight: "#A855F7",
          pulp: "#FFB84D",
          pulpBright: "#FFD073",
          cream: "#FFF4E0",
          leaf: "#7FB685",
          seed: "#2A1810",
          bg: "#0E0A14",
          panel: "#1A1422",
          panelAlt: "#241B30",
          border: "#3A2E4C",
          borderBright: "#5A4670",
        },
      },
      fontFamily: {
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        tiny: ["12px", "16px"],
        small: ["13px", "18px"],
        base: ["15px", "22px"],
        h3: ["17px", "24px"],
        h2: ["20px", "28px"],
      },
      boxShadow: {
        panel:
          "0 20px 48px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(168,85,247,0.18)",
      },
      animation: {
        "pulse-halo": "pulse-halo 2s ease-in-out infinite",
        "gentle-spin": "spin 6s linear infinite",
      },
      keyframes: {
        "pulse-halo": {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(1.08)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
