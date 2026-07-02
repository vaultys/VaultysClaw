"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Bot,
  User,
  GitBranch,
} from "lucide-react";
import { workflowRunsClient } from "@/lib/api/ts-rest/client";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  WorkflowRunDetail,
  WorkflowRunStepDetail,
} from "@/lib/contracts";
import { WorkflowDefinition } from "@/lib/workflow-types";
import { formatDateTime, timeAgo } from "@vaultysclaw/shared";

/** Topological sort of node ids using Kahn's algorithm */
function topoSort(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: string; target: string }>
): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }
  const queue = [...inDegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id);
  const order: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const next of adj.get(cur) ?? []) {
      const nd = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, nd);
      if (nd === 0) queue.push(next);
    }
  }
  return order;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={20} className="text-success-500" />;
    case "failed":
      return <AlertCircle size={20} className="text-danger-500" />;
    case "rejected":
      return <AlertCircle size={20} className="text-warning-500" />;
    case "running":
      return <Activity size={20} className="text-primary-500 animate-pulse" />;
    case "waiting_approval":
      return <Clock size={20} className="text-warning-500" />;
    default:
      return <Clock size={20} className="text-foreground-500" />;
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
    case "rejected":
      return `${base} bg-warning-100 text-warning-700`;
    case "running":
      return `${base} bg-primary-100 text-primary-700`;
    case "waiting_approval":
      return `${base} bg-warning-100 text-warning-700`;
    default:
      return `${base} bg-background-200 text-foreground-400`;
  }
}

function getStepPill(status: string) {
  const base =
    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium";
  switch (status) {
    case "completed":
      return `${base} bg-success-100 text-success-700`;
    case "failed":
      return `${base} bg-danger-100 text-danger-700`;
    case "rejected":
      return `${base} bg-warning-100 text-warning-700`;
    case "running":
      return `${base} bg-primary-100 text-primary-700`;
    case "waiting_approval":
      return `${base} bg-warning-100 text-warning-700`;
    default:
      return `${base} bg-background-200 text-foreground-400`;
  }
}

function statusTone(
  status: string
): "success" | "neutral" | "warning" | "danger" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "rejected":
    case "waiting_approval":
      return "warning";
    default:
      return "neutral";
  }
}

export default function WorkflowRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;

  const [history, setHistory] = useState<WorkflowRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    workflowRunsClient
      .getOne({ params: { runId } })
      .then((res) => {
        if (res.status !== 200) {
          setError(
            res.status === 404
              ? "Workflow run not found"
              : "Failed to fetch run"
          );
          return;
        }
        setHistory(res.body);
      })
      .catch(() => setError("Failed to load workflow run"))
      .finally(() => setLoading(false));
  }, [runId]);

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const s = new Set(prev);
      s.has(stepId) ? s.delete(stepId) : s.add(stepId);
      return s;
    });
  };

  /** Order steps by the workflow's topological node order, fallback to start time */
  const getSortedSteps = (): WorkflowRunStepDetail[] => {
    if (!history) return [];
    const def = history.workflow
      ?.definition as unknown as WorkflowDefinition | null;
    if (def) {
      const order = topoSort(def.nodes, def.edges);
      const stepMap = new Map(history.steps.map((s) => [s.stepId, s]));
      const sorted: WorkflowRunStepDetail[] = [];
      for (const nodeId of order) {
        const s = stepMap.get(nodeId);
        if (s) sorted.push(s);
      }
      // append any steps not covered by the topo order (shouldn't happen, but safe)
      for (const s of history.steps) {
        if (!sorted.includes(s)) sorted.push(s);
      }
      return sorted;
    }
    return [...history.steps].sort((a, b) => {
      const at = a.startedAt?.getTime() ?? 0;
      const bt = b.startedAt?.getTime() ?? 0;
      return at - bt;
    });
  };

  const runWorkflowId = history?.run.workflowId;
  const runWorkflowName = history?.workflow?.name;

  useBreadcrumbs(
    [
      { label: "Workflows", href: "/app/workflows" },
      ...(runWorkflowId
        ? [
            {
              label: runWorkflowName ?? "Workflow",
              href: `/app/workflows/${runWorkflowId}`,
            },
          ]
        : []),
      { label: `Run ${runId.slice(0, 8)}…` },
    ],
    [runWorkflowId, runWorkflowName, runId]
  );

  useToolbar(
    {
      title: runWorkflowName ?? "Workflow Run",
      description: `Run ${runId.slice(0, 8)}…`,
      actions: [
        ...(history
          ? [
              {
                kind: "badge" as const,
                id: "status",
                label: history.run.status.replace("_", " "),
                tone: statusTone(history.run.status),
              },
            ]
          : []),
        ...(runWorkflowId
          ? [
              {
                kind: "button" as const,
                id: "view-workflow",
                label: "View workflow",
                variant: "primary" as const,
                icon: <GitBranch className="w-3.5 h-3.5" />,
                onClick: () => router.push(`/app/workflows/${runWorkflowId}`),
              },
            ]
          : []),
      ],
    },
    [runWorkflowId, runWorkflowName, runId, history?.run.status, router]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !history) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/app/workflows"
            className="inline-flex items-center gap-2 text-primary-500 hover:text-primary-400 mb-6"
          >
            <ChevronLeft size={18} /> Back to Workflows
          </Link>
          <div className="bg-background-100 rounded-xl border border-neutral-200 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-danger-500 mx-auto mb-4" />
            <p className="text-foreground font-medium mb-2">
              {error || "Workflow run not found"}
            </p>
            <Link
              href="/app/workflows"
              className="text-primary-500 hover:text-primary-400"
            >
              Return to workflows
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { run, workflow } = history;
  const definition = workflow?.definition as unknown as
    | WorkflowDefinition
    | null
    | undefined;
  const nodeMap = new Map(definition?.nodes.map((n) => [n.id, n]) ?? []);

  const startedMs = run.startedAt?.getTime() ?? null;
  const completedMs = run.completedAt?.getTime() ?? null;
  const duration =
    startedMs !== null && completedMs !== null
      ? Math.round((completedMs - startedMs) / 1000)
      : null;

  const sortedSteps = getSortedSteps();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Run summary */}
        <div>
          <div className="bg-background-100 rounded-xl border border-neutral-200 p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <p className="text-foreground-500 font-mono text-xs break-all">
                {run.id}
              </p>
              <div className={getStatusBadge(run.status)}>
                {getStatusIcon(run.status)}
                {run.status}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-neutral-200">
              <div>
                <p className="text-foreground-500 text-sm mb-1">Started</p>
                <p className="text-foreground text-xs font-medium">
                  {formatDateTime(run.startedAt)}
                </p>
                <p className="text-foreground-400 text-xs mt-0.5">
                  {timeAgo(run.startedAt)}
                </p>
              </div>
              <div>
                <p className="text-foreground-500 text-sm mb-1">Completed</p>
                <p className="text-foreground text-xs font-medium">
                  {formatDateTime(run.completedAt)}
                </p>
                {run.completedAt && (
                  <p className="text-foreground-400 text-xs mt-0.5">
                    {timeAgo(run.completedAt)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-foreground-500 text-sm mb-1">Duration</p>
                <p className="text-foreground text-sm font-medium">
                  {duration !== null ? `${duration}s` : "—"}
                </p>
              </div>
              <div>
                <p className="text-foreground-500 text-sm mb-1">Steps</p>
                <p className="text-foreground text-sm font-medium">
                  {history.steps.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Execution Steps
          </h2>

          {sortedSteps.length === 0 ? (
            <div className="bg-background-100 rounded-xl border border-neutral-200 p-8 text-center text-foreground-500">
              No steps recorded for this run
            </div>
          ) : (
            <div className="space-y-3">
              {sortedSteps.map((step, idx) => {
                const node = nodeMap.get(step.stepId);
                const nodeData = node?.data ?? {};

                // Resolve agent display: prefer node's agentName, then agentId from step
                const agentDid =
                  (nodeData.agentId as string | undefined) ??
                  step.agentId ??
                  null;
                const agentName =
                  (nodeData.agentName as string | undefined) ?? null;

                // Resolve user display: prefer DB-resolved name (from approval JOIN), then node data
                const userDid =
                  step.assignedUserId ??
                  (nodeData.assignedUserId as string | undefined) ??
                  null;
                const userName =
                  step.assignedUserName ??
                  (nodeData.assignedUserName as string | undefined) ??
                  null;
                const userEmail = step.assignedUserEmail ?? null;

                // Node label for step title
                const nodeLabel =
                  (nodeData.label as string | undefined) ?? step.stepId;

                const isExpanded = expandedSteps.has(step.id);
                const stepStartMs = step.startedAt?.getTime() ?? null;
                const stepEndMs = step.completedAt?.getTime() ?? null;
                const stepDuration =
                  stepStartMs !== null && stepEndMs !== null
                    ? Math.round((stepEndMs - stepStartMs) / 1000)
                    : null;

                return (
                  <div
                    key={step.id}
                    className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden"
                  >
                    {/* Step header */}
                    <button
                      onClick={() => toggleStep(step.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-background-200/50 transition text-left"
                    >
                      {/* Step number */}
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-background-200 border border-neutral-200 text-foreground-500 text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>

                      <div className="flex-shrink-0">
                        {getStatusIcon(step.status)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">
                            {nodeLabel}
                          </span>
                          <span className={getStepPill(step.status)}>
                            {step.status}
                          </span>
                          {agentName && (
                            <span className="inline-flex items-center gap-1 text-xs text-foreground-500">
                              <Bot size={12} /> {agentName}
                            </span>
                          )}
                          {userName && (
                            <span className="inline-flex items-center gap-1 text-xs text-foreground-500">
                              <User size={12} /> {userName}
                            </span>
                          )}
                        </div>
                        {step.startedAt && (
                          <p className="text-xs text-foreground-400 mt-0.5">
                            {formatDateTime(step.startedAt)}
                            {stepDuration !== null && ` · ${stepDuration}s`}
                          </p>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUp
                            size={18}
                            className="text-foreground-500"
                          />
                        ) : (
                          <ChevronDown
                            size={18}
                            className="text-foreground-500"
                          />
                        )}
                      </div>
                    </button>

                    {/* Step details */}
                    {isExpanded && (
                      <div className="border-t border-neutral-200 px-4 py-4 space-y-4 bg-background-200/30">
                        {/* Agent */}
                        {agentDid && (
                          <div>
                            <div className="flex items-center gap-1.5 text-sm text-foreground-500 mb-1.5">
                              <Bot size={14} /> Agent
                            </div>
                            <div className="ml-5">
                              {agentName && (
                                <p className="text-foreground text-sm font-medium">
                                  {agentName}
                                </p>
                              )}
                              <p className="text-foreground-500 font-mono text-xs break-all">
                                {agentDid}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Assigned user */}
                        {userDid && (
                          <div>
                            <div className="flex items-center gap-1.5 text-sm text-foreground-500 mb-1.5">
                              <User size={14} /> Assigned User
                            </div>
                            <div className="ml-5">
                              {userName && (
                                <p className="text-foreground text-sm font-medium">
                                  {userName}
                                </p>
                              )}
                              {userEmail && (
                                <p className="text-foreground-400 text-xs">
                                  {userEmail}
                                </p>
                              )}
                              <p className="text-foreground-500 font-mono text-xs break-all mt-0.5">
                                {userDid}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Output */}
                        {step.output != null && (
                          <div>
                            <p className="text-sm text-foreground-500 mb-2">
                              Output
                            </p>
                            <pre className="bg-background-100 rounded p-3 text-foreground text-xs font-mono overflow-auto max-h-48 border border-neutral-200">
                              {typeof step.output === "string"
                                ? step.output
                                : JSON.stringify(step.output, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Error */}
                        {step.error && (
                          <div>
                            <p className="text-sm text-danger-600 mb-2">
                              Error
                            </p>
                            <pre className="bg-danger-50 rounded p-3 text-danger-700 text-xs font-mono overflow-auto max-h-48 border border-danger-200">
                              {step.error}
                            </pre>
                          </div>
                        )}

                        {step.output == null && !step.error && (
                          <p className="text-foreground-500 text-sm">
                            No output recorded
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Results */}
        {run.results != null && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Results
            </h2>
            <div className="bg-background-100 rounded-xl border border-neutral-200 p-4">
              <pre className="text-foreground text-sm font-mono overflow-auto max-h-64">
                {typeof run.results === "string"
                  ? run.results
                  : JSON.stringify(run.results, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
