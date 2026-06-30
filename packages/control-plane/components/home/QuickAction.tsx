"use client";

import { ArrowRight } from "lucide-react";

const ACCENT_COLORS = {
  primary:
    "bg-primary-100 text-primary-600 border-primary-200 group-hover:bg-primary-200",
  success:
    "bg-success-100 text-success-600 border-success-200 group-hover:bg-success-200",
  warning:
    "bg-warning-100 text-warning-600 border-warning-200 group-hover:bg-warning-200",
  secondary:
    "bg-secondary-100 text-secondary-600 border-secondary-200 group-hover:bg-secondary-200",
} as const;

export function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
  accent = "primary",
  badge,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
  accent?: keyof typeof ACCENT_COLORS;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-start gap-3 p-4 bg-background-100 border border-neutral-200 rounded-xl text-left hover:border-primary-300 hover:shadow-sm transition-all duration-200 group w-full"
    >
      <div
        className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors duration-200 ${ACCENT_COLORS[accent]}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground leading-tight">
          {label}
        </p>
        <p className="text-xs text-foreground-400 mt-0.5 leading-tight">
          {description}
        </p>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-2 right-2 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold text-white bg-warning-500 rounded-full px-1">
          {badge}
        </span>
      )}
      <ArrowRight className="w-3.5 h-3.5 text-foreground-300 group-hover:text-primary-500 shrink-0 mt-0.5 transition-colors duration-200" />
    </button>
  );
}
