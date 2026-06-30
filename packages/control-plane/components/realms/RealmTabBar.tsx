"use client";

import { REALM_TABS, type RealmTab } from "./types";

const LABELS: Record<RealmTab, string> = {
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

export function RealmTabBar({
  active,
  counts,
  onSelect,
}: {
  active: RealmTab;
  counts: Partial<Record<RealmTab, number>>;
  onSelect: (tab: RealmTab) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto">
      {REALM_TABS.map((t) => {
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
