/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        vc: {
          bg: "rgb(var(--vc-bg) / <alpha-value>)",
          surface: "rgb(var(--vc-surface) / <alpha-value>)",
          raised: "rgb(var(--vc-raised) / <alpha-value>)",
          border: "rgb(var(--vc-border) / <alpha-value>)",
          ring: "rgb(var(--vc-ring) / <alpha-value>)",
          text: "rgb(var(--vc-text) / <alpha-value>)",
          "text-2": "rgb(var(--vc-text-2) / <alpha-value>)",
          muted: "rgb(var(--vc-muted) / <alpha-value>)",
          subtle: "rgb(var(--vc-subtle) / <alpha-value>)",
        },
      },
      animation: {
        "gradient-shift": "gradient-shift 8s ease infinite",
        "fade-in": "fade-in 0.6s ease forwards",
        "slide-up": "slide-up 0.5s ease forwards",
      },
      keyframes: {
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
