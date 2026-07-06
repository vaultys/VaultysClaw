import React from "react";
import { Check } from "lucide-react";
import { STEPS, type StepId } from "./types";

export function StepProgress({
  currentIdx,
  completedSteps,
}: {
  currentIdx: number;
  completedSteps: Set<StepId>;
}) {
  return (
    <div className="flex items-start mb-8">
      {STEPS.map(({ id, label, icon: Icon }, idx) => {
        const isActive = idx === currentIdx;
        const isPast = idx < currentIdx;
        const isCompleted = completedSteps.has(id);
        return (
          <React.Fragment key={id}>
            <div className="flex flex-col items-center gap-1.5 min-w-[56px]">
              <div
                className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                  isActive
                    ? "border-primary-500 bg-primary-500 text-white shadow-md shadow-primary-500/30"
                    : isPast && isCompleted
                      ? "border-success-500 bg-success-500 text-white"
                      : isPast
                        ? "border-neutral-200 bg-background-200 text-foreground-500"
                        : "border-neutral-200 bg-background-100 text-foreground-400"
                }`}
              >
                {isPast && isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              <span
                className={`text-[11px] font-medium whitespace-nowrap ${
                  isActive
                    ? "text-primary-500"
                    : isPast && isCompleted
                      ? "text-success-600"
                      : isPast
                        ? "text-foreground-500"
                        : "text-foreground-400"
                }`}
              >
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mt-[18px] mx-1 transition-colors duration-500 ${
                  idx < currentIdx && completedSteps.has(STEPS[idx].id)
                    ? "bg-success-400"
                    : idx < currentIdx
                      ? "bg-neutral-200"
                      : "bg-background-200"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
