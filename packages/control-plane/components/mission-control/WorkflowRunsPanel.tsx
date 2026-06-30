"use client";

import { Loader2 } from "lucide-react";
import type { WorkflowRun } from "./types";
import { PanelHeader, RunPill } from "./ui";

export function WorkflowRunsPanel({
  runs,
  runningCount,
  onSelectRun,
}: {
  runs: WorkflowRun[];
  runningCount: number;
  onSelectRun: (id: string) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden bg-background-100 border border-neutral-200/60 rounded-xl shadow-md shadow-black/10 min-h-0">
      <PanelHeader
        title="Workflow Runs"
        right={
          runningCount > 0 ? (
            <span className="flex items-center gap-1 text-[10px] text-primary-600">
              <Loader2 size={8} className="animate-spin" />
              {runningCount} active
            </span>
          ) : (
            <span className="text-[10px] text-foreground-600">idle</span>
          )
        }
      />
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {runs.length === 0 ? (
          <p className="px-1 py-4 text-center text-[10px] text-foreground-600">
            No recent runs
          </p>
        ) : (
          runs.map((run) => (
            <button
              key={run.id}
              type="button"
              className="block w-full cursor-pointer"
              onClick={() => onSelectRun(run.id)}
            >
              <RunPill run={run} block />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
