import type { Config } from "tailwindcss";

/**
 * Passionfruit color palette — pulled from the v1 avatar art.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        passio: {
          skin: "#5B2A86",
          skinLight: "#8B3FA0",
          pulp: "#FFB84D",
          cream: "#FFF4E0",
          leaf: "#7FB685",
          seed: "#2A1810",
        },
      },
      fontFamily: {
        sans: [
          "'JetBrains Mono'",
          "'Inter'",
          "system-ui",
          "sans-serif",
        ],
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
