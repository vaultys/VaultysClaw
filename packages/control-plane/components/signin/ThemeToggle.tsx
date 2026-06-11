"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";

const THEMES: { value: Theme; icon: React.ElementType; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const current = THEMES.find((t) => t.value === theme) ?? THEMES[1];
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  const Icon = current.icon;

  return (
    <button
      onClick={() => setTheme(next.value)}
      title={`Switch to ${next.label} mode`}
      className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-lg vc-bg-surface border vc-border vc-text-subtle hover:vc-text transition-colors backdrop-blur-sm shadow-sm animate-fade-in-up"
      style={{ animationDelay: "150ms" }}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
