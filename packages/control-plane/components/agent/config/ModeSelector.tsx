import type { ConfigMode } from "./constants";

interface ModeButton {
  id: ConfigMode;
  label: string;
  disabled: boolean;
  hint?: string;
}

export function ModeSelector({
  mode,
  modes,
  onSelect,
}: {
  mode: ConfigMode;
  modes: ModeButton[];
  onSelect: (mode: ConfigMode) => void;
}) {
  return (
    <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-sm">
      {modes.map(({ id, label, disabled, hint }) => (
        <button
          key={id}
          onClick={() => !disabled && onSelect(id)}
          disabled={disabled}
          title={disabled ? hint : undefined}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            mode === id
              ? "bg-primary-600 text-white"
              : disabled
                ? "bg-background text-foreground-400 cursor-not-allowed"
                : "bg-background text-foreground-500 hover:text-foreground hover:bg-background-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
