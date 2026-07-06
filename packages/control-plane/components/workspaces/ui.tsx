"use client";

import type { LucideIcon } from "lucide-react";

/** Bordered rounded container that holds a list of bordered rows. */
export function ListCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
      {children}
    </div>
  );
}

/** One row inside a {@link ListCard}; draws a top divider for all but the first. */
export function ListRow({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-neutral-200/50" : ""}`}
    >
      {children}
    </div>
  );
}

/** Centered empty state with an icon, primary message and optional extra. */
export function EmptyState({
  icon: Icon,
  message,
  hint,
  children,
}: {
  icon: LucideIcon;
  message: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <Icon className="w-8 h-8 text-neutral-300 mb-2" />
      <p className="text-foreground-500 text-sm">{message}</p>
      {hint && <p className="text-foreground-400 text-xs mt-1">{hint}</p>}
      {children}
    </div>
  );
}
