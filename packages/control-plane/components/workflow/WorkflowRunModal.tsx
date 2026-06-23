"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Activity,
  Download,
  Copy,
} from "lucide-react";
import type { WorkflowDefinition } from "@/lib/workflow-types";
import { WorkflowInputForm } from "./WorkflowInputForm";
import { workflowsClient, unwrap } from "@/lib/api/ts-rest/client";

interface WorkflowRunModalProps {
  workflowId: string;
  workflowName: string;
  workflowDescription: string | null;
  definition: WorkflowDefinition;
  isOpen: boolean;
  onClose: () => void;
}

interface ExecutionState {
  runId: string | null;
  status: "idle" | "running" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  results: Record<string, unknown> | null;
  error: string | null;
}

interface StepInfo {
  stepId: string;
  status: string;
  output: unknown;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  agentId: string | null;
  assignedUserName: string | null;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={16} className="text-success-500" />;
    case "failed":
      return <AlertCircle size={16} className="text-danger-500" />;
    case "running":
      return <Activity size={16} className="text-primary-500 animate-pulse" />;
    default:
      return <Clock size={16} className="text-foreground-500" />;
  }
}

function getStatusBadge(status: string) {
  const base =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium";
  switch (status) {
    case "completed":
      return `${base} bg-success-100 text-success-700`;
    case "failed":
      return `${base} bg-danger-100 text-danger-700`;
    case "running":
      return `${base} bg-primary-100 text-primary-700`;
    default:
      return `${base} bg-background-200 text-foreground-400`;
  }
}

function parseTimestamp(val: unknown): number | null {
  if (val === null || val === undefined || val === "" || val === false)
    return null;
  if (typeof val === "number") return val > 0 ? val * 1000 : null;
  if (typeof val === "string") {
    if (!val.trim()) return null;
    if (/^\d+$/.test(val)) {
      const n = parseInt(val, 10);
      return n > 0 ? n * 1000 : null;
    }
    let s = val.replace(" ", "T");
    if (!s.endsWith("Z") && !s.includes("+") && !/[+-]\d{2}:\d{2}$/.test(s))
      s += "Z";
    const t = new Date(s).getTime();
    return isNaN(t) ? null : t;
  }
  return null;
}

function formatDate(val: unknown): string {
  const ms = parseTimestamp(val);
  if (ms === null) return "—";
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export const WorkflowRunModal: React.FC<WorkflowRunModalProps> = ({
  workflowId,
  workflowName,
  workflowDescription,
  definition,
  isOpen,
  onClose,
}) => {
  const [execution, setExecution] = useState<ExecutionState>({
    runId: null,
    status: "idle",
    startedAt: null,
    completedAt: null,
    results: null,
    error: null,
  });

  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Handle input form submission
  const handleStartExecution = async (input: string) => {
    try {
      const data = unwrap(
        await workflowsClient.execute({
          params: { id: workflowId },
          body: { input: input || undefined },
        }),
      );

      setExecution({
        runId: data.runId,
        status: "running",
        startedAt: new Date().toISOString(),
        completedAt: null,
        results: null,
        error: null,
      });
    } catch (err) {
      setExecution((prev) => ({
        ...prev,
        status: "failed",
        error: String(err),
      }));
    }
  };

  // Poll for execution status
  useEffect(() => {
    if (execution.status !== "running" || !execution.runId) return;
    const runId = execution.runId;

    const pollInterval = setInterval(async () => {
      try {
        // Fetch status
        const statusRes = await workflowsClient.runStatus({
          params: { runId },
        });
        if (statusRes.status !== 200) return;
        const statusData = statusRes.body;

        // Fetch history
        const historyRes = await workflowsClient.runHistory({
          params: { runId },
        });
        if (historyRes.status !== 200) return;
        const historyData = historyRes.body as unknown as {
          steps: StepInfo[];
          run: { status: string; results: string | null };
        };

        setSteps(historyData.steps);

        // Check if execution is complete
        if (["completed", "failed"].includes(statusData.status)) {
          let results = null;
          if (historyData.run.results) {
            try {
              results = JSON.parse(historyData.run.results);
            } catch {
              results = { raw: historyData.run.results };
            }
          }

          setExecution((prev) => ({
            ...prev,
            status: statusData.status as "completed" | "failed",
            completedAt: new Date().toISOString(),
            results,
          }));

          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Failed to poll execution status:", err);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [execution.status, execution.runId]);

  // Elapsed time counter
  useEffect(() => {
    if (execution.status !== "running") return;
    const timer = setInterval(() => setElapsedTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [execution.status]);

  if (!isOpen) return null;

  const handleCopyResults = () => {
    if (execution.results) {
      navigator.clipboard.writeText(JSON.stringify(execution.results, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadResults = () => {
    if (execution.results) {
      const json = JSON.stringify(execution.results, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workflowName}-results-${new Date().getTime()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const runningStepCount = steps.filter((s) => s.status === "running").length;
  const completedStepCount = steps.filter(
    (s) => s.status === "completed"
  ).length;
  const failedStepCount = steps.filter((s) => s.status === "failed").length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-100 rounded-xl border border-neutral-200 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between bg-background-200">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {execution.status !== "idle" && (
              <button
                onClick={() => {
                  if (
                    execution.status === "completed" ||
                    execution.status === "failed"
                  ) {
                    onClose();
                  }
                }}
                className="p-1 hover:bg-neutral-200 rounded"
                title="Go back"
              >
                <ChevronLeft size={18} className="text-foreground-500" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground truncate">
                {workflowName}
              </h2>
              {workflowDescription && (
                <p className="text-sm text-foreground-500 truncate">
                  {workflowDescription}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-200 rounded flex-shrink-0"
          >
            <X size={18} className="text-foreground-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {execution.status === "idle" && (
            <div className="p-6 space-y-4">
              <WorkflowInputForm
                definition={definition}
                onSubmit={handleStartExecution}
              />
            </div>
          )}

          {execution.status === "running" && (
            <div className="p-6 space-y-6">
              {/* Timer and Status Summary */}
              <div className="bg-background-200 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground-500">Elapsed Time</p>
                    <p className="text-2xl font-bold text-foreground font-mono">
                      {formatTime(elapsedTime)}
                    </p>
                  </div>
                  <div className={getStatusBadge("running")}>
                    {getStatusIcon("running")}
                    Running
                  </div>
                </div>

                {/* Step counters */}
                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-neutral-200">
                  <div className="text-center">
                    <p className="text-xs text-foreground-500">Running</p>
                    <p className="text-lg font-semibold text-primary-500">
                      {runningStepCount}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-foreground-500">Completed</p>
                    <p className="text-lg font-semibold text-success-500">
                      {completedStepCount}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-foreground-500">Failed</p>
                    <p className="text-lg font-semibold text-danger-500">
                      {failedStepCount}
                    </p>
                  </div>
                </div>
              </div>

              {/* Steps Timeline */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Execution Steps
                </h3>
                {steps.length === 0 ? (
                  <p className="text-sm text-foreground-500">
                    Waiting for steps...
                  </p>
                ) : (
                  <div className="space-y-2">
                    {steps.map((step) => (
                      <div
                        key={step.stepId}
                        className="bg-background-200 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() =>
                            setExpandedStepId(
                              expandedStepId === step.stepId
                                ? null
                                : step.stepId
                            )
                          }
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-200/50 transition text-left"
                        >
                          <div className="flex-shrink-0">
                            {getStatusIcon(step.status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {step.stepId}
                            </p>
                            {step.assignedUserName && (
                              <p className="text-xs text-foreground-500">
                                👤 {step.assignedUserName}
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-medium text-foreground-500 flex-shrink-0">
                            {step.status}
                          </span>
                        </button>

                        {/* Expanded details */}
                        {expandedStepId === step.stepId && (
                          <div className="border-t border-neutral-200 px-4 py-3 bg-background-100 space-y-2 text-xs">
                            {step.error ? (
                              <div>
                                <p className="font-semibold text-danger-500 mb-1">
                                  Error
                                </p>
                                <pre className="bg-danger-950/30 p-2 rounded border border-danger-900/30 text-danger-300 overflow-auto">
                                  {step.error}
                                </pre>
                              </div>
                            ) : step.output ? (
                              <div>
                                <p className="font-semibold text-foreground-500 mb-1">
                                  Output
                                </p>
                                <pre className="bg-background p-2 rounded border border-neutral-200 overflow-auto">
                                  {typeof step.output === "string"
                                    ? step.output
                                    : JSON.stringify(step.output, null, 2)}
                                </pre>
                              </div>
                            ) : (
                              <p className="text-foreground-500">
                                No output yet
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {execution.status === "completed" && (
            <div className="p-6 space-y-6">
              {/* Success State */}
              <div className="bg-success-50 rounded-lg p-4 border border-success-200 flex items-start gap-3">
                <CheckCircle2
                  size={20}
                  className="text-success-600 flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="font-semibold text-success-900">
                    Workflow completed successfully
                  </p>
                  {execution.completedAt && (
                    <p className="text-sm text-success-800 mt-1">
                      {formatDate(execution.completedAt)}
                    </p>
                  )}
                </div>
              </div>

              {/* Results */}
              {execution.results ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Results
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCopyResults}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 rounded"
                      >
                        <Copy size={14} />
                        {copied ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={handleDownloadResults}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 rounded"
                      >
                        <Download size={14} />
                        Download
                      </button>
                    </div>
                  </div>
                  <pre className="bg-background-200 rounded-lg p-4 border border-neutral-200 text-foreground text-xs font-mono overflow-auto max-h-64">
                    {JSON.stringify(execution.results, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-foreground-500">
                  No results generated
                </p>
              )}

              {/* Steps Summary */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Execution Steps ({steps.length})
                </h3>
                <div className="space-y-2">
                  {steps.map((step) => (
                    <div
                      key={step.stepId}
                      className="bg-background-200 rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedStepId(
                            expandedStepId === step.stepId ? null : step.stepId
                          )
                        }
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-200/50 transition text-left"
                      >
                        <div className="flex-shrink-0">
                          {getStatusIcon(step.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {step.stepId}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-foreground-500 flex-shrink-0">
                          {step.status}
                        </span>
                      </button>

                      {expandedStepId === step.stepId && (
                        <div className="border-t border-neutral-200 px-4 py-3 bg-background-100 space-y-2 text-xs">
                          {step.error ? (
                            <div>
                              <p className="font-semibold text-danger-500 mb-1">
                                Error
                              </p>
                              <pre className="bg-danger-950/30 p-2 rounded border border-danger-900/30 text-danger-300 overflow-auto">
                                {step.error}
                              </pre>
                            </div>
                          ) : step.output ? (
                            <div>
                              <p className="font-semibold text-foreground-500 mb-1">
                                Output
                              </p>
                              <pre className="bg-background p-2 rounded border border-neutral-200 overflow-auto">
                                {typeof step.output === "string"
                                  ? step.output
                                  : JSON.stringify(step.output, null, 2)}
                              </pre>
                            </div>
                          ) : (
                            <p className="text-foreground-500">No output</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {execution.status === "failed" && (
            <div className="p-6 space-y-6">
              {/* Error State */}
              <div className="bg-danger-50 rounded-lg p-4 border border-danger-200 flex items-start gap-3">
                <AlertCircle
                  size={20}
                  className="text-danger-600 flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="font-semibold text-danger-900">
                    Workflow execution failed
                  </p>
                  {execution.error && (
                    <p className="text-sm text-danger-800 mt-1 font-mono">
                      {execution.error}
                    </p>
                  )}
                </div>
              </div>

              {/* Steps with failures */}
              {steps.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Execution Steps
                  </h3>
                  <div className="space-y-2">
                    {steps.map((step) => (
                      <div
                        key={step.stepId}
                        className="bg-background-200 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() =>
                            setExpandedStepId(
                              expandedStepId === step.stepId
                                ? null
                                : step.stepId
                            )
                          }
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-200/50 transition text-left"
                        >
                          <div className="flex-shrink-0">
                            {getStatusIcon(step.status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {step.stepId}
                            </p>
                          </div>
                          <span className="text-xs font-medium text-foreground-500 flex-shrink-0">
                            {step.status}
                          </span>
                        </button>

                        {expandedStepId === step.stepId && (
                          <div className="border-t border-neutral-200 px-4 py-3 bg-background-100 space-y-2 text-xs">
                            {step.error && (
                              <div>
                                <p className="font-semibold text-danger-500 mb-1">
                                  Error
                                </p>
                                <pre className="bg-danger-950/30 p-2 rounded border border-danger-900/30 text-danger-300 overflow-auto">
                                  {step.error}
                                </pre>
                              </div>
                            )}
                            {step.output
                              ? (() => {
                                  const outputStr =
                                    typeof step.output === "string"
                                      ? step.output
                                      : JSON.stringify(step.output, null, 2);
                                  return (
                                    <div>
                                      <p className="font-semibold text-foreground-500 mb-1">
                                        Output
                                      </p>
                                      <pre className="bg-background p-2 rounded border border-neutral-200 overflow-auto">
                                        {outputStr}
                                      </pre>
                                    </div>
                                  );
                                })()
                              : null}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {execution.status !== "idle" && (
          <div className="border-t border-neutral-200 px-6 py-4 bg-background-200 flex items-center justify-between">
            <div className="text-xs text-foreground-500">
              {execution.runId && (
                <>
                  Run ID:{" "}
                  <span className="font-mono">
                    {execution.runId.slice(0, 8)}
                  </span>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {execution.status !== "running" && (
                <>
                  <Link
                    href={`/workflows/runs/${execution.runId}`}
                    className="px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded font-medium"
                  >
                    View Full Details
                  </Link>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 font-medium"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
