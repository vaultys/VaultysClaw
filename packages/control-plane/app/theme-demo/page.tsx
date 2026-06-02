"use client";

import { useEffect, useState } from "react";

const COLORS = [
  "primary",
  "secondary",
  "success",
  "warning",
  "danger",
  "neutral",
  "background",
  "foreground",
] as const;

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

type Color = (typeof COLORS)[number];

function swatch(color: Color, step: number) {
  return `rgb(var(--${color}-${step}))`;
}

function textOn(color: Color, step: number) {
  return step <= 400
    ? `rgb(var(--${color}-950))`
    : `rgb(var(--${color}-50))`;
}

export default function ThemeDemoPage() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);

  return (
    <div className="min-h-screen bg-background text-foreground p-8 transition-colors duration-300">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-12">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Theme System
          </h1>
          <p className="mt-1 text-foreground-500">
            8 adaptive palettes · 11 steps · auto dark/light
          </p>
          <p className="mt-3 text-sm text-foreground-400 max-w-xl">
            Every step (50–950) is a CSS variable that inverts its lightness in
            dark mode. Write{" "}
            <code className="bg-neutral-100 text-primary-600 px-1 py-0.5 rounded text-xs font-mono">
              bg-danger-100
            </code>{" "}
            once — it renders as a pale tint in light mode and a deep tint in
            dark mode automatically.
          </p>
        </div>
        <button
          onClick={() => setDark((d) => !d)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-medium text-sm shadow-sm hover:bg-primary-600 transition-colors shrink-0"
        >
          {dark ? "☀️  Light mode" : "🌙  Dark mode"}
        </button>
      </div>

      {/* ── Palette swatches ─────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="text-lg font-semibold text-foreground-700 mb-6 uppercase tracking-widest text-xs">
          Color Palettes
        </h2>
        <div className="space-y-5">
          {COLORS.map((color) => (
            <div key={color}>
              <p className="text-sm font-medium text-foreground-500 mb-2 capitalize w-28 inline-block">
                {color}
              </p>
              <div className="flex gap-1">
                {STEPS.map((step) => (
                  <div key={step} className="flex-1 min-w-0">
                    <div
                      className="h-10 rounded-md w-full"
                      style={{ backgroundColor: swatch(color, step) }}
                      title={`${color}-${step}`}
                    />
                    <p
                      className="text-center mt-1 font-mono"
                      style={{ fontSize: "9px", color: "rgb(var(--foreground-400))" }}
                    >
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-14">
        {/* ── Buttons ────────────────────────────────────────────── */}
        <section className="bg-background-100 rounded-xl p-6 border border-neutral-200">
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest mb-5">
            Buttons
          </h2>
          <div className="flex flex-wrap gap-3 mb-4">
            <button className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors">
              Primary
            </button>
            <button className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-medium hover:bg-secondary-600 transition-colors">
              Secondary
            </button>
            <button className="px-4 py-2 rounded-lg bg-success text-white text-sm font-medium hover:bg-success-600 transition-colors">
              Success
            </button>
            <button className="px-4 py-2 rounded-lg bg-warning text-white text-sm font-medium hover:bg-warning-600 transition-colors">
              Warning
            </button>
            <button className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger-600 transition-colors">
              Danger
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="px-4 py-2 rounded-lg border border-primary-300 bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-colors">
              Outline primary
            </button>
            <button className="px-4 py-2 rounded-lg border border-danger-300 bg-danger-50 text-danger-700 text-sm font-medium hover:bg-danger-100 transition-colors">
              Outline danger
            </button>
            <button className="px-4 py-2 rounded-lg bg-neutral-200 text-foreground-700 text-sm font-medium hover:bg-neutral-300 transition-colors">
              Neutral
            </button>
          </div>
        </section>

        {/* ── Badges ─────────────────────────────────────────────── */}
        <section className="bg-background-100 rounded-xl p-6 border border-neutral-200">
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest mb-5">
            Badges
          </h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["primary", "New"],
                ["secondary", "Beta"],
                ["success", "Active"],
                ["warning", "Pending"],
                ["danger", "Error"],
                ["neutral", "Archived"],
              ] as const
            ).map(([color, label]) => (
              <span
                key={color}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: swatch(color, 100),
                  color: swatch(color, 700),
                }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {(
              [
                ["primary", "V2.1"],
                ["success", "Online"],
                ["danger", "Offline"],
                ["warning", "Degraded"],
              ] as const
            ).map(([color, label]) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
                style={{
                  backgroundColor: swatch(color, 50),
                  color: swatch(color, 800),
                  borderColor: swatch(color, 200),
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: swatch(color, 500) }}
                />
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* ── Alerts ─────────────────────────────────────────────── */}
        <section className="bg-background-100 rounded-xl p-6 border border-neutral-200">
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest mb-5">
            Alerts
          </h2>
          <div className="space-y-3">
            {(
              [
                ["success", "✓", "Deployment successful", "All 3 agents are running normally."],
                ["warning", "⚠", "High latency detected", "Agent response time exceeded 2s threshold."],
                ["danger", "✕", "Connection lost", "Unable to reach control plane on port 8080."],
                ["primary", "ℹ", "Update available", "Version 2.1.0 is ready to install."],
              ] as const
            ).map(([color, icon, title, body]) => (
              <div
                key={title}
                className="flex gap-3 p-4 rounded-lg border"
                style={{
                  backgroundColor: swatch(color, 50),
                  borderColor: swatch(color, 200),
                }}
              >
                <span
                  className="text-lg leading-none mt-0.5"
                  style={{ color: swatch(color, 600) }}
                >
                  {icon}
                </span>
                <div>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: swatch(color, 800) }}
                  >
                    {title}
                  </p>
                  <p
                    className="text-sm mt-0.5"
                    style={{ color: swatch(color, 700) }}
                  >
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Cards ──────────────────────────────────────────────── */}
        <section className="bg-background-100 rounded-xl p-6 border border-neutral-200">
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest mb-5">
            Cards
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["primary", "24", "Active agents", "+2 this week"],
                ["success", "98%", "Uptime", "Last 30 days"],
                ["warning", "12", "Pending", "Needs review"],
                ["danger", "3", "Errors", "In last hour"],
              ] as const
            ).map(([color, stat, label, sub]) => (
              <div
                key={label}
                className="p-4 rounded-xl border"
                style={{
                  backgroundColor: swatch(color, 50),
                  borderColor: swatch(color, 200),
                }}
              >
                <p
                  className="text-2xl font-bold"
                  style={{ color: swatch(color, 600) }}
                >
                  {stat}
                </p>
                <p
                  className="text-sm font-medium mt-0.5"
                  style={{ color: swatch(color, 800) }}
                >
                  {label}
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: swatch(color, 500) }}
                >
                  {sub}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Form elements ──────────────────────────────────────── */}
        <section className="bg-background-100 rounded-xl p-6 border border-neutral-200">
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest mb-5">
            Form
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                Default
              </label>
              <input
                defaultValue="agent-worker-01"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-success-700 mb-1">
                Valid
              </label>
              <input
                defaultValue="valid-value@example.com"
                className="w-full px-3 py-2 rounded-lg border border-success-300 bg-success-50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-success-400 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-danger-700 mb-1">
                Error
              </label>
              <input
                defaultValue="bad input ✕"
                className="w-full px-3 py-2 rounded-lg border border-danger-300 bg-danger-50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-danger-400 transition"
              />
              <p className="mt-1 text-xs text-danger-600">
                This field is required.
              </p>
            </div>
          </div>
        </section>

        {/* ── Typography ─────────────────────────────────────────── */}
        <section className="bg-background-100 rounded-xl p-6 border border-neutral-200">
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest mb-5">
            Typography
          </h2>
          <div className="space-y-2">
            {(
              [
                [950, "text-foreground-950", "Heading — 950"],
                [900, "text-foreground-900", "Body text — 900 (default)"],
                [700, "text-foreground-700", "Secondary text — 700"],
                [500, "text-foreground-500", "Placeholder / muted — 500"],
                [400, "text-foreground-400", "Subtle hint — 400"],
                [300, "text-foreground-300", "Divider label — 300"],
              ] as const
            ).map(([step, cls, label]) => (
              <p key={step} className={`text-sm ${cls}`}>
                {label}
              </p>
            ))}
            <div className="pt-3 border-t border-neutral-200 space-y-1">
              <p className="text-sm text-primary-600">primary link text</p>
              <p className="text-sm text-success-600">success message</p>
              <p className="text-sm text-warning-600">warning notice</p>
              <p className="text-sm text-danger-600">error message</p>
            </div>
          </div>
        </section>
      </div>

      {/* ── Step semantics reference ─────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest mb-5">
          Step Semantics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {(
            [
              ["50", "Subtle background tint"],
              ["100", "Hover / pressed bg"],
              ["200–300", "Border / divider"],
              ["400", "Icon / placeholder"],
              ["500", "Solid color (DEFAULT)"],
              ["600", "Hover on solid"],
              ["700–800", "Text on light bg"],
              ["900–950", "Strong heading"],
            ] as const
          ).map(([step, desc]) => (
            <div
              key={step}
              className="px-4 py-3 rounded-lg bg-background-100 border border-neutral-200"
            >
              <p className="font-mono text-xs font-bold text-primary-600 mb-1">
                -{step}
              </p>
              <p className="text-foreground-600 text-xs">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-foreground-300 pb-4">
        /theme-demo · VaultysClaw adaptive theme
      </p>
    </div>
  );
}
