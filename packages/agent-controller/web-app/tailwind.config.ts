import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        // Existing dark-palette tokens (used throughout the rest of the app)
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
        // Control-plane design system — CSS-variable-backed tokens
        vc: {
          bg:      "rgb(var(--vc-bg) / <alpha-value>)",
          surface: "rgb(var(--vc-surface) / <alpha-value>)",
          raised:  "rgb(var(--vc-raised) / <alpha-value>)",
          border:  "rgb(var(--vc-border) / <alpha-value>)",
          ring:    "rgb(var(--vc-ring) / <alpha-value>)",
          text:    "rgb(var(--vc-text) / <alpha-value>)",
          "text-2":"rgb(var(--vc-text-2) / <alpha-value>)",
          muted:   "rgb(var(--vc-muted) / <alpha-value>)",
          subtle:  "rgb(var(--vc-subtle) / <alpha-value>)",
        },
      },
      fontFamily: {
        mono: ["'SF Mono'", "Consolas", "monospace"],
      },
      animation: {
        "fade-in":  "fade-in 0.15s ease forwards",
        "slide-up": "slide-up 0.2s ease forwards",
      },
      keyframes: {
        "fade-in":  { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
} satisfies Config;
