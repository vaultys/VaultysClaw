"use client";

import { CheckCircle, Loader2, XCircle } from "lucide-react";
import type { WorkflowRun } from "./types";

/** Section header used at the top of each dashboard panel. */
export function PanelHeader({
  title,
  right,
  className = "",
}: {
  title: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-4 py-2.5 border-b border-neutral-200/50 flex items-center justify-between shrink-0 ${className}`}
    >
      <span className="text-[10px] font-bold tracking-[0.18em] text-foreground-700 uppercase">
        {title}
      </span>
      {right}
    </div>
  );
}

/** Compact label+value row used inside the detail modal. */
export function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-foreground-500 mt-0.5 shrink-0">{icon}</span>
      <span className="text-foreground-500 shrink-0 w-24">{label}</span>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
        {children}
      </div>
    </div>
  );
}

/**
 * Circular gauge tile — ring shows pct (0–1), value sits inside, label below.
 * Fully fluid: the ring fills its grid cell (capped at a sane max) and scales
 * down cleanly on narrow screens instead of overflowing.
 */
export function StatTile({
  value,
  label,
  color = "text-foreground",
  pct = 0,
}: {
  value: string;
  label: string;
  color?: string;
  pct?: number;
}) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(1, Math.max(0, pct)) * circ;
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div className="relative w-full max-w-[88px] aspect-square">
        {/* Gauge ring */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 80 80"
        >
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="3.5"
            className="stroke-background-200"
          />
          {fill > 0 && (
            <circle
              cx="40"
              cy="40"
              r={r}
              fill="none"
              strokeWidth="3.5"
              stroke="currentColor"
              className={color}
              strokeLinecap="round"
              strokeDasharray={`${fill} ${circ}`}
            />
          )}
        </svg>
        {/* Number + label, centered inside the ring */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-1">
          <span
            className={`text-xs sm:text-sm font-bold tabular-nums leading-none truncate max-w-full ${color}`}
          >
            {value}
          </span>
          <span className="text-[8px] sm:text-[9px] text-foreground-500 uppercase tracking-wider truncate max-w-full">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Pill summarizing a single workflow run (status icon + name). */
export function RunPill({
  run,
  block = false,
}: {
  run: WorkflowRun;
  block?: boolean;
}) {
  const name =
    run.workflowName ?? run.workflowId?.slice(0, 8) ?? run.id.slice(0, 8);

  const styles: Record<string, string> = {
    running:
      "border-primary-500/60 bg-primary-500/15 text-primary-700 hover:border-primary-600/80",
    completed:
      "border-success-500/50 bg-success-600/10 text-success-700 hover:border-success-600/70",
    failed:
      "border-danger-500/50 bg-danger-500/10 text-danger-600 hover:border-danger-500/70",
  };

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[11px] cursor-default transition-colors ${
        styles[run.status] ?? "border-neutral-200/60 text-foreground-600"
      } ${block ? "w-full" : "shrink-0"}`}
      title={`${name} · ${run.status}`}
    >
      {run.status === "running" ? (
        <Loader2 size={10} className="animate-spin shrink-0" />
      ) : run.status === "completed" ? (
        <CheckCircle size={10} className="shrink-0" />
      ) : (
        <XCircle size={10} className="shrink-0" />
      )}
      <span className={`truncate ${block ? "flex-1" : "max-w-[110px]"}`}>
        {name}
      </span>
      {block && (
        <span className="ml-auto text-[10px] opacity-60 shrink-0">
          {run.status}
        </span>
      )}
    </div>
  );
}
