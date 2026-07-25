import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Reference the same CSS custom properties globals.css overrides per
        // data-contrast theme (standard/high-contrast/warm) — these previously
        // duplicated the standard theme's hex values directly, which meant
        // switching to "High contrast" or "Warm low-glare" in Display settings
        // had no visible effect anywhere these field-* classes were used.
        field: {
          ink: "var(--bg-ink)",
          surface: "var(--bg-surface)",
          card: "var(--bg-card)",
          muted: "var(--muted)",
          line: "var(--line)",
          accent: "var(--gold)",
          good: "var(--good)",
          warn: "var(--warn)",
          danger: "var(--danger)"
        }
      },
      boxShadow: {
        field: "0 18px 45px rgba(0,0,0,0.32)"
      }
    }
  },
  plugins: []
};

export default config;
