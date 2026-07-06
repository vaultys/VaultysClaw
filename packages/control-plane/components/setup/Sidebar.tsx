"use client";

import { Check, X } from "lucide-react";
import { STEPS, type StepId } from "./types";

export function Sidebar({
  currentIdx,
  done,
  completedSteps,
  onGoToStep,
  onFinishLater,
}: {
  currentIdx: number;
  done: boolean;
  completedSteps: Set<StepId>;
  onGoToStep: (idx: number) => void;
  onFinishLater: () => void;
}) {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-background-100 border-r border-neutral-200 p-6 gap-8">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-primary-600 rounded-xl flex items-center justify-center text-sm leading-none shadow shadow-primary-600/30">
          🦞
        </div>
        <span className="font-bold text-foreground tracking-tight">
          VaultysClaw
        </span>
      </div>

      <div>
        <p className="text-foreground-400 text-[10px] font-bold uppercase tracking-widest mb-3 px-1">
          Setup
        </p>
        <nav className="space-y-0.5">
          {STEPS.map(({ id, label, desc, icon: Icon }, idx) => {
            const isActive = !done && idx === currentIdx;
            const isPast = done || idx < currentIdx;
            const isCompleted = completedSteps.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => !done && onGoToStep(idx)}
                disabled={done}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  done ? "cursor-default" : "cursor-pointer"
                } ${
                  isActive
                    ? "bg-primary-50 border border-primary-200 text-primary-900"
                    : isPast && isCompleted
                      ? "text-success-600 hover:bg-background-200"
                      : !done
                        ? "text-foreground-400 hover:bg-background-200 hover:text-foreground-500"
                        : "text-foreground-400"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                    isActive
                      ? "bg-primary-600 border-primary-500 text-white"
                      : isPast && isCompleted
                        ? "bg-success-100 border-success-200 text-success-600"
                        : "bg-background-200 border-neutral-200 text-foreground-400"
                  }`}
                >
                  {isPast && isCompleted ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{label}</p>
                  <p
                    className={`text-[10px] truncate ${
                      isActive ? "text-primary-600/70" : "text-foreground-400"
                    }`}
                  >
                    {desc}
                  </p>
                </div>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0 animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-3">
        <button
          onClick={onFinishLater}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-foreground-500 hover:text-foreground border border-neutral-200 hover:bg-background-200 rounded-xl transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Finish later
        </button>
        <p className="text-foreground-400 text-[10px] text-center leading-relaxed opacity-70">
          Your progress is saved. Return from the dashboard banner.
        </p>
      </div>
    </aside>
  );
}
