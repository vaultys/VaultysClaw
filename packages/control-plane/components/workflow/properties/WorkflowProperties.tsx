"use client";

import { Calendar, FileText } from "lucide-react";
import { useWorkflowStore } from "../store";
import { SchedulePanel } from "./SchedulePanel";

/** Panel shown when no node is selected: workflow name/description/input + schedule. */
export function WorkflowProperties() {
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const workflowDescription = useWorkflowStore((s) => s.workflowDescription);
  const workflowInput = useWorkflowStore((s) => s.workflowInput);
  const setWorkflowInput = useWorkflowStore((s) => s.setWorkflowInput);

  return (
    <div className="w-64 bg-background-100 border-l border-neutral-200 flex flex-col h-full overflow-hidden">
      <div className="border-b border-neutral-200 p-4 flex items-center gap-2">
        <FileText size={15} className="text-foreground-400" />
        <h3 className="font-semibold text-foreground text-sm">Workflow</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <p className="text-xs font-medium text-foreground-700 mb-1">Name</p>
          <p className="text-sm text-foreground truncate">
            {workflowName || (
              <span className="italic text-foreground-400">Untitled</span>
            )}
          </p>
        </div>
        {workflowDescription && (
          <div>
            <p className="text-xs font-medium text-foreground-700 mb-1">
              Description
            </p>
            <p className="text-sm text-foreground-500">{workflowDescription}</p>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-foreground-700 mb-1">
            Default Input
          </label>
          <textarea
            rows={4}
            value={workflowInput}
            onChange={(e) => setWorkflowInput(e.target.value)}
            placeholder="Default input passed to the first agent (optional)…"
            className="w-full bg-background-200 text-foreground border border-neutral-200 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <p className="text-xs text-foreground-400 mt-1">
            Overridden at execution time if left empty.
          </p>
        </div>
        <div className="pt-2 border-t border-neutral-200 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-foreground-400" />
            <p className="text-xs font-semibold text-foreground-700 uppercase tracking-wide">
              Schedule
            </p>
          </div>
          <SchedulePanel workflowId={workflowId} />
        </div>
        <div className="pt-2 border-t border-neutral-200">
          <p className="text-xs text-foreground-400">
            Click a node on the canvas to configure it.
          </p>
        </div>
      </div>
    </div>
  );
}
