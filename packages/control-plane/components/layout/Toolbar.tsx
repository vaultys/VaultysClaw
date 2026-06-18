"use client";

import { useToolbarState, type ToolbarAction } from "./ToolbarContext";
import ToolbarSearch from "./ToolbarSearch";
import ToolbarSteps from "./ToolbarSteps";

const BADGE_TONES: Record<
  NonNullable<Extract<ToolbarAction, { kind: "badge" }>["tone"]>,
  string
> = {
  success: "bg-success-100 border-success-300 text-success-700",
  neutral: "bg-background-200 border-neutral-200 text-foreground-400",
  warning: "bg-warning-100 border-warning-300 text-warning-700",
  danger: "bg-danger-100 border-danger-300 text-danger-700",
};

function ActionItem({ action }: { action: ToolbarAction }) {
  if (action.kind === "badge") {
    return (
      <span
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
          BADGE_TONES[action.tone ?? "neutral"]
        }`}
      >
        {action.icon}
        {action.label}
      </span>
    );
  }

  if (action.kind === "tabs") {
    return (
      <div className="flex items-center bg-background-100 border border-neutral-200 rounded-lg p-0.5">
        {action.options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => action.onChange(opt.value)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              action.value === opt.value
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground-500 hover:text-foreground"
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  // button
  return (
    <button
      onClick={action.onClick}
      disabled={action.disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        action.variant === "primary"
          ? "bg-primary-600 hover:bg-primary-500 text-white"
          : "bg-background-100 border border-neutral-200 text-foreground hover:bg-background-200"
      }`}
    >
      {action.icon}
      {action.label}
    </button>
  );
}

/**
 * Renders the page toolbar configured via `useToolbar`. Mounted once by the
 * app shell, below the TopBar. Renders nothing when no page has set a config.
 */
export default function Toolbar() {
  const { config } = useToolbarState();
  if (!config) return null;

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-background border-b border-neutral-200/60 shrink-0">
      <div className="min-w-0 shrink-0">
        <h1 className="text-lg font-semibold text-foreground truncate">
          {config.title}
        </h1>
        {config.description && (
          <p className="text-foreground-500 text-sm mt-0.5 truncate">
            {config.description}
          </p>
        )}
      </div>

      {/* Center: step indicator or advanced search (or a spacer to keep
          actions right-aligned). Steps take precedence over search. */}
      {config.steps ? (
        <div className="flex-1 flex justify-center">
          <ToolbarSteps steps={config.steps} />
        </div>
      ) : config.search ? (
        <div className="flex-1 flex justify-center">
          <ToolbarSearch search={config.search} />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {config.actions && config.actions.length > 0 && (
        <div className="flex items-center gap-3 shrink-0">
          {config.actions.map((action) => (
            <ActionItem key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}
