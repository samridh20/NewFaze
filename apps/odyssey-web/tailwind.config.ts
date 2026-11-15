import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { faze: { red: "#e4002b", ink: "#07080a", panel: "#0f1115" } },
      fontFamily: { display: ["var(--font-display)", "system-ui"], mono: ["var(--font-mono)", "ui-monospace"] },
      keyframes: { pulseRing: { "0%": { transform: "scale(.9)", opacity: ".7" }, "100%": { transform: "scale(1.6)", opacity: "0" } } },
      animation: { pulseRing: "pulseRing 1.6s ease-out infinite" },
    },
  },
  plugins: [],
} satisfies Config;
