import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#0d1117",
          subtle: "#161b22",
          overlay: "#21262d",
        },
        border: {
          DEFAULT: "#30363d",
          muted: "#21262d",
        },
        fg: {
          DEFAULT: "#c9d1d9",
          muted: "#8b949e",
          subtle: "#6e7681",
          dim: "#484f58",
        },
        accent: {
          DEFAULT: "#58a6ff",
          emphasis: "#1f6feb",
        },
        success: {
          DEFAULT: "#3fb950",
          emphasis: "#1a4731",
        },
        attention: {
          DEFAULT: "#e3b341",
          emphasis: "#9e6a03",
        },
        danger: {
          DEFAULT: "#f85149",
          emphasis: "#3d1414",
        },
        info: {
          DEFAULT: "#79c0ff",
          emphasis: "#003366",
        },
      },
      fontFamily: {
        mono: ["'SF Mono'", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
