"use client";

import { WORKSPACE_TABS, type WorkspaceTab } from "./types";

const LABELS: Record<WorkspaceTab, string> = {
  agents: "Agents",
  users: "Users",
  workflows: "Workflows",
  skills: "Skills",
  models: "Models",
  channels: "Channels",
  "org-chart": "Org Chart",
  map: "Map",
  config: "Config",
};

export function WorkspaceTabBar({
  active,
  counts,
  onSelect,
}: {
  active: WorkspaceTab;
  counts: Partial<Record<WorkspaceTab, number>>;
  onSelect: (tab: WorkspaceTab) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto">
      {WORKSPACE_TABS.map((t) => {
        const count = counts[t];
        return (
          <button
            key={t}
            onClick={() => onSelect(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px whitespace-nowrap ${
              active === t
                ? "border-primary-500 text-primary-700"
                : "border-transparent text-foreground-500 hover:text-foreground"
            }`}
          >
            {LABELS[t]}
            {count !== undefined && ` (${count})`}
          </button>
        );
      })}
    </div>
  );
}
