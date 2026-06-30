import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./primitives";

const THEME_OPTIONS: {
  value: Theme;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "dark", label: "Dark", description: "Always use dark theme", icon: Moon },
  { value: "light", label: "Light", description: "Always use light theme", icon: Sun },
  { value: "system", label: "System", description: "Follow OS preference", icon: Monitor },
];

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  return (
    <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      <SectionHeader icon={Sun} title="Appearance" />
      <div className="p-5">
        <p className="text-sm text-foreground-500 mb-4">
          Choose how VaultysClaw looks on this device.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "relative flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all text-center",
                theme === value
                  ? "bg-primary-100 border-primary-300 text-primary-700"
                  : "bg-background-200/50 border-neutral-300/50 text-foreground-500 hover:border-foreground-500 hover:text-foreground-700"
              )}
            >
              {theme === value && (
                <span className="absolute top-2 right-2 w-4 h-4 bg-primary-600 rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </span>
              )}
              <Icon className="w-5 h-5" />
              <div>
                <p className="text-xs font-semibold">{label}</p>
                <p className="text-[11px] text-foreground-400 mt-0.5 leading-tight">
                  {description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
