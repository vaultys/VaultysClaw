"use client";

import type { ReactNode } from "react";

export type UserTabId = "overview" | "access" | "grants" | "realms" | "details";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

export type UserTab = TabItem<UserTabId>;

export function UserTabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 px-1 bg-background-100 rounded-t-xl overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === tab.id
              ? "border-primary-500 text-primary-400"
              : "border-transparent text-foreground-500 hover:text-foreground hover:border-neutral-300"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
