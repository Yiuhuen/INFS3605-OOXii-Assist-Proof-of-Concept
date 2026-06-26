import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        field: {
          ink: "#17081f",
          surface: "#251033",
          card: "#311640",
          muted: "#8f7da0",
          line: "#563568",
          accent: "#7dd3fc",
          good: "#86efac",
          warn: "#fde68a",
          danger: "#fca5a5"
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
