"use client";

import React, { useEffect, useState } from "react";
import { useWorkflowStore } from "./store";
import { ChevronDown, X } from "lucide-react";

interface ExecutionStatus {
  runId: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  results: Record<string, unknown> | null;
}

interface StepInfo {
  stepId: string;
  status: string;
  output: unknown;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export const WorkflowExecutionPanel: React.FC = () => {
  const {
    executionRunId,
    isExecuting,
    stepStatus,
    stepOutputs,
    setShowExecutionPanel,
    showExecutionPanel,
    endExecution,
  } = useWorkflowStore();

  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus | null>(null);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!isExecuting || !executionRunId) return;

    // Poll for execution status
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/workflows/runs/${executionRunId}/status`);
        if (!res.ok) return;
        const data = (await res.json()) as { success: boolean; status: string };
        setExecutionStatus(data as any);

        // Fetch execution history
        const historyRes = await fetch(`/api/workflows/runs/${executionRunId}/history`);
        if (!historyRes.ok) return;
        const historyData = (await historyRes.json()) as { steps: StepInfo[] };
        setSteps(historyData.steps);

        // Check if execution is complete
        if (["completed", "failed"].includes(data.status)) {
          clearInterval(pollInterval);
          endExecution();
        }
      } catch (err) {
        console.error("Failed to poll execution status:", err);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [isExecuting, executionRunId, endExecution]);

  useEffect(() => {
    if (!isExecuting) return;
    const timer = setInterval(() => setElapsedTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isExecuting]);

  if (!showExecutionPanel || !executionRunId) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const runningStepCount = Array.from(stepStatus.values()).filter(
    (s) => s === "running",
  ).length;
  const completedStepCount = Array.from(stepStatus.values()).filter(
    (s) => s === "success",
  ).length;
  const failedStepCount = Array.from(stepStatus.values()).filter(
    (s) => s === "failed",
  ).length;

  return (
    <div className="fixed bottom-0 right-0 w-96 bg-white border-l border-t border-gray-200 shadow-lg">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3 flex justify-between items-center bg-gray-50">
        <div>
          <h3 className="font-semibold text-gray-900">Execution Monitor</h3>
          <p className="text-xs text-gray-500">
            {isExecuting ? "Running..." : "Completed"} ({formatTime(elapsedTime)})
          </p>
        </div>
        <button
          onClick={() => setShowExecutionPanel(false)}
          className="p-1 hover:bg-gray-200 rounded"
        >
          <X size={16} />
        </button>
      </div>

      {/* Status Summary */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 grid grid-cols-3 gap-2 text-xs">
        <div className="text-center">
          <p className="text-gray-500">Running</p>
          <p className="font-semibold text-blue-600">{runningStepCount}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500">Completed</p>
          <p className="font-semibold text-green-600">{completedStepCount}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500">Failed</p>
          <p className="font-semibold text-red-600">{failedStepCount}</p>
        </div>
      </div>

      {/* Steps List */}
      <div className="overflow-y-auto max-h-64">
        {steps.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">No steps yet...</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {steps.map((step) => (
              <div key={step.stepId} className="border-b border-gray-100">
                <button
                  onClick={() =>
                    setExpandedStepId(
                      expandedStepId === step.stepId ? null : step.stepId,
                    )
                  }
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${step.status === "running"
                          ? "bg-blue-500"
                          : step.status === "success"
                            ? "bg-green-500"
                            : step.status === "failed"
                              ? "bg-red-500"
                              : "bg-gray-300"
                        }`}
                    />
                    <span className="text-xs font-medium text-gray-900 truncate">
                      {step.stepId}
                    </span>
                    <span className="text-xs text-gray-500">{step.status}</span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`flex-shrink-0 transition-transform ${expandedStepId === step.stepId ? "rotate-180" : ""
                      }`}
                  />
                </button>

                {/* Expanded output */}
                {expandedStepId === step.stepId && (
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                    {step.error ? (
                      <div className="text-xs text-red-600 font-mono break-words">
                        <p className="font-semibold mb-1">Error:</p>
                        {step.error}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-700">
                        <p className="font-semibold mb-1">Output:</p>
                        <pre className="bg-white p-2 rounded border border-gray-200 overflow-x-auto text-xs">
                          {JSON.stringify(step.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
