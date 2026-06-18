"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolbarStepsConfig } from "./ToolbarContext";

/**
 * Compact wizard step indicator rendered in the center of the toolbar. Past
 * steps show a check, the current step is highlighted, and upcoming steps are
 * muted. Driven by the `ToolbarStepsConfig` a page provides via `useToolbar`.
 */
export default function ToolbarSteps({ steps }: { steps: ToolbarStepsConfig }) {
  const { current, steps: items, onStepClick } = steps;
  return (
    <div className="flex items-center gap-0">
      {items.map((s, i) => {
        const clickable = onStepClick && i < current;
        return (
        <Fragment key={s.id}>
          <button
            type="button"
            disabled={!clickable}
            onClick={clickable ? () => onStepClick(i) : undefined}
            title={clickable ? `Back to ${s.label}` : undefined}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
              clickable && "cursor-pointer hover:bg-primary-200 dark:hover:bg-primary-600/30",
              !clickable && "cursor-default",
              i < current
                ? "bg-primary-100 dark:bg-primary-600/20 text-primary-600 dark:text-primary-400"
                : i === current
                  ? "bg-primary-600 text-white"
                  : "bg-background-200 text-foreground-400 border border-neutral-200"
            )}
          >
            {i < current ? (
              <Check size={11} />
            ) : (
              <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px] font-bold">
                {i + 1}
              </span>
            )}
            <span>{s.label}</span>
          </button>
          {i < items.length - 1 && (
            <div
              className={cn(
                "w-5 h-px mx-1",
                i < current
                  ? "bg-primary-300 dark:bg-primary-700"
                  : "bg-neutral-200"
              )}
            />
          )}
        </Fragment>
        );
      })}
    </div>
  );
}
