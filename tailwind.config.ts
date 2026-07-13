import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        field: {
          ink: "#150c1f",
          surface: "#1c1226",
          card: "#201530",
          muted: "#a898bb",
          line: "#352842",
          accent: "#ecc568",
          good: "#7fe3a0",
          warn: "#f0b76d",
          danger: "#f2937f"
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
