import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "rgb(var(--canvas) / <alpha-value>)",
          subtle:  "rgb(var(--canvas-subtle) / <alpha-value>)",
          overlay: "rgb(var(--canvas-overlay) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          muted:   "rgb(var(--border-muted) / <alpha-value>)",
        },
        fg: {
          DEFAULT: "rgb(var(--fg) / <alpha-value>)",
          muted:   "rgb(var(--fg-muted) / <alpha-value>)",
          subtle:  "rgb(var(--fg-subtle) / <alpha-value>)",
          dim:     "rgb(var(--fg-dim) / <alpha-value>)",
        },
        accent: {
          DEFAULT:  "rgb(var(--accent) / <alpha-value>)",
          emphasis: "rgb(var(--accent-emphasis) / <alpha-value>)",
        },
        success: {
          DEFAULT:  "rgb(var(--success) / <alpha-value>)",
          emphasis: "rgb(var(--success-emphasis) / <alpha-value>)",
        },
        attention: {
          DEFAULT:  "rgb(var(--attention) / <alpha-value>)",
          emphasis: "rgb(var(--attention-emphasis) / <alpha-value>)",
        },
        danger: {
          DEFAULT:  "rgb(var(--danger) / <alpha-value>)",
          emphasis: "rgb(var(--danger-emphasis) / <alpha-value>)",
        },
        info: {
          DEFAULT:  "rgb(var(--info) / <alpha-value>)",
          emphasis: "rgb(var(--info-emphasis) / <alpha-value>)",
        },
        // vc-* design tokens (CSS-variable-backed)
        vc: {
          bg:       "rgb(var(--vc-bg) / <alpha-value>)",
          surface:  "rgb(var(--vc-surface) / <alpha-value>)",
          raised:   "rgb(var(--vc-raised) / <alpha-value>)",
          border:   "rgb(var(--vc-border) / <alpha-value>)",
          ring:     "rgb(var(--vc-ring) / <alpha-value>)",
          text:     "rgb(var(--vc-text) / <alpha-value>)",
          "text-2": "rgb(var(--vc-text-2) / <alpha-value>)",
          muted:    "rgb(var(--vc-muted) / <alpha-value>)",
          subtle:   "rgb(var(--vc-subtle) / <alpha-value>)",
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
