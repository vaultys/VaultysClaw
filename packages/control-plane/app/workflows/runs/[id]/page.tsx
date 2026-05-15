"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
} from "lucide-react";

interface WorkflowRunStep {
  id: string;
  run_id: string;
  step_id: string;
  agent_id: string | null;
  status: string;
  output: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_user_email: string | null;
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  results: string | null;
}

interface WorkflowDefinition {
  nodes: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

interface RunHistory {
  run: WorkflowRun;
  workflow: { id: string; name: string; definition: WorkflowDefinition } | null;
  steps: WorkflowRunStep[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Topological sort of node ids using Kahn's algorithm */
function topoSort(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: string; target: string }>,
): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { inDegree.set(n.id, 0); adj.set(n.id, []); }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }
  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
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
    case "completed": return <CheckCircle2 size={20} className="text-green-500" />;
    case "failed": return <AlertCircle size={20} className="text-red-500" />;
    case "rejected": return <AlertCircle size={20} className="text-orange-500" />;
    case "running": return <Activity size={20} className="text-blue-500 animate-pulse" />;
    case "waiting_approval": return <Clock size={20} className="text-amber-500" />;
    default: return <Clock size={20} className="text-vc-muted" />;
  }
}

function getStatusBadge(status: string) {
  const base = "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium";
  switch (status) {
    case "completed": return `${base} bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400`;
    case "failed": return `${base} bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400`;
    case "rejected": return `${base} bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400`;
    case "running": return `${base} bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400`;
    case "waiting_approval": return `${base} bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400`;
    default: return `${base} bg-vc-raised text-vc-subtle`;
  }
}

function getStepPill(status: string) {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium";
  switch (status) {
    case "completed": return `${base} bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400`;
    case "failed": return `${base} bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400`;
    case "rejected": return `${base} bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400`;
    case "running": return `${base} bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400`;
    case "waiting_approval": return `${base} bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400`;
    default: return `${base} bg-vc-raised text-vc-subtle`;
  }
}

export default function WorkflowRunDetailPage() {
  const params = useParams();
  const runId = params.id as string;

  const [history, setHistory] = useState<RunHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/workflow-runs/${runId}`)
      .then(async (res) => {
        if (!res.ok) {
          setError(res.status === 404 ? "Workflow run not found" : "Failed to fetch run");
          return;
        }
        setHistory(await res.json() as RunHistory);
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
  const getSortedSteps = (): WorkflowRunStep[] => {
    if (!history) return [];
    const def = history.workflow?.definition;
    if (def) {
      const order = topoSort(def.nodes, def.edges);
      const stepMap = new Map(history.steps.map((s) => [s.step_id, s]));
      const sorted: WorkflowRunStep[] = [];
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
      const at = a.started_at ? new Date(a.started_at).getTime() : 0;
      const bt = b.started_at ? new Date(b.started_at).getTime() : 0;
      return at - bt;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-vc-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !history) {
    return (
      <div className="min-h-screen bg-vc-bg p-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/workflows" className="inline-flex items-center gap-2 text-indigo-500 hover:text-indigo-400 mb-6">
            <ChevronLeft size={18} /> Back to Workflows
          </Link>
          <div className="bg-vc-surface rounded-xl border border-vc-border p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-vc-text font-medium mb-2">{error || "Workflow run not found"}</p>
            <Link href="/workflows" className="text-indigo-500 hover:text-indigo-400">Return to workflows</Link>
          </div>
        </div>
      </div>
    );
  }

  const { run, workflow } = history;
  const definition = workflow?.definition;
  const nodeMap = new Map(definition?.nodes.map((n) => [n.id, n]) ?? []);

  const duration = run.completed_at && run.started_at
    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  const sortedSteps = getSortedSteps();

  return (
    <div className="min-h-screen bg-vc-bg">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <Link href="/workflows" className="inline-flex items-center gap-2 text-indigo-500 hover:text-indigo-400 mb-4">
            <ChevronLeft size={18} /> Back to Workflows
          </Link>

          <div className="bg-vc-surface rounded-xl border border-vc-border p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-vc-text mb-1">
                  {workflow?.name ?? "Workflow Run"}
                </h1>
                <p className="text-vc-muted font-mono text-xs">{run.id}</p>
              </div>
              <div className={getStatusBadge(run.status)}>
                {getStatusIcon(run.status)}
                {run.status}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-vc-border">
              <div>
                <p className="text-vc-muted text-sm mb-1">Started</p>
                <p className="text-vc-text text-xs font-medium">{formatDate(run.started_at)}</p>
                <p className="text-vc-subtle text-xs mt-0.5">{timeAgo(run.started_at)}</p>
              </div>
              <div>
                <p className="text-vc-muted text-sm mb-1">Completed</p>
                <p className="text-vc-text text-xs font-medium">{formatDate(run.completed_at)}</p>
                {run.completed_at && (
                  <p className="text-vc-subtle text-xs mt-0.5">{timeAgo(run.completed_at)}</p>
                )}
              </div>
              <div>
                <p className="text-vc-muted text-sm mb-1">Duration</p>
                <p className="text-vc-text text-sm font-medium">{duration !== null ? `${duration}s` : "—"}</p>
              </div>
              <div>
                <p className="text-vc-muted text-sm mb-1">Steps</p>
                <p className="text-vc-text text-sm font-medium">{history.steps.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div>
          <h2 className="text-lg font-semibold text-vc-text mb-4">Execution Steps</h2>

          {sortedSteps.length === 0 ? (
            <div className="bg-vc-surface rounded-xl border border-vc-border p-8 text-center text-vc-muted">
              No steps recorded for this run
            </div>
          ) : (
            <div className="space-y-3">
              {sortedSteps.map((step, idx) => {
                const node = nodeMap.get(step.step_id);
                const nodeData = node?.data ?? {};

                // Resolve agent display: prefer node's agentName, then agent_id from step
                const agentDid = (nodeData.agentId as string | undefined) ?? step.agent_id ?? null;
                const agentName = (nodeData.agentName as string | undefined) ?? null;

                // Resolve user display: prefer DB-resolved name (from approval JOIN), then node data
                const userDid = step.assigned_user_id ?? (nodeData.assignedUserId as string | undefined) ?? null;
                const userName = step.assigned_user_name ?? (nodeData.assignedUserName as string | undefined) ?? null;
                const userEmail = step.assigned_user_email ?? null;

                // Node label for step title
                const nodeLabel = (nodeData.label as string | undefined) ?? step.step_id;

                const isExpanded = expandedSteps.has(step.id);
                const stepDuration = step.completed_at && step.started_at
                  ? Math.round((new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) / 1000)
                  : null;

                return (
                  <div key={step.id} className="bg-vc-surface rounded-xl border border-vc-border overflow-hidden">
                    {/* Step header */}
                    <button
                      onClick={() => toggleStep(step.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-vc-raised/50 transition text-left"
                    >
                      {/* Step number */}
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vc-raised border border-vc-border text-vc-muted text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>

                      <div className="flex-shrink-0">{getStatusIcon(step.status)}</div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-vc-text">{nodeLabel}</span>
                          <span className={getStepPill(step.status)}>{step.status}</span>
                          {agentName && (
                            <span className="inline-flex items-center gap-1 text-xs text-vc-muted">
                              <Bot size={12} /> {agentName}
                            </span>
                          )}
                          {userName && (
                            <span className="inline-flex items-center gap-1 text-xs text-vc-muted">
                              <User size={12} /> {userName}
                            </span>
                          )}
                        </div>
                        {step.started_at && (
                          <p className="text-xs text-vc-subtle mt-0.5">
                            {formatDate(step.started_at)}
                            {stepDuration !== null && ` · ${stepDuration}s`}
                          </p>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        {isExpanded ? <ChevronUp size={18} className="text-vc-muted" /> : <ChevronDown size={18} className="text-vc-muted" />}
                      </div>
                    </button>

                    {/* Step details */}
                    {isExpanded && (
                      <div className="border-t border-vc-border px-4 py-4 space-y-4 bg-vc-raised/30">
                        {/* Agent */}
                        {agentDid && (
                          <div>
                            <div className="flex items-center gap-1.5 text-sm text-vc-muted mb-1.5">
                              <Bot size={14} /> Agent
                            </div>
                            <div className="ml-5">
                              {agentName && <p className="text-vc-text text-sm font-medium">{agentName}</p>}
                              <p className="text-vc-muted font-mono text-xs break-all">{agentDid}</p>
                            </div>
                          </div>
                        )}

                        {/* Assigned user */}
                        {userDid && (
                          <div>
                            <div className="flex items-center gap-1.5 text-sm text-vc-muted mb-1.5">
                              <User size={14} /> Assigned User
                            </div>
                            <div className="ml-5">
                              {userName && <p className="text-vc-text text-sm font-medium">{userName}</p>}
                              {userEmail && <p className="text-vc-subtle text-xs">{userEmail}</p>}
                              <p className="text-vc-muted font-mono text-xs break-all mt-0.5">{userDid}</p>
                            </div>
                          </div>
                        )}

                        {/* Output */}
                        {step.output && (() => {
                          let parsed: unknown;
                          try { parsed = JSON.parse(step.output); } catch { parsed = step.output; }
                          return (
                            <div>
                              <p className="text-sm text-vc-muted mb-2">Output</p>
                              <pre className="bg-vc-surface rounded p-3 text-vc-text text-xs font-mono overflow-auto max-h-48 border border-vc-border">
                                {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
                              </pre>
                            </div>
                          );
                        })()}

                        {/* Error */}
                        {step.error && (
                          <div>
                            <p className="text-sm text-red-400 mb-2">Error</p>
                            <pre className="bg-red-950/30 rounded p-3 text-red-300 text-xs font-mono overflow-auto max-h-48 border border-red-900/50">
                              {step.error}
                            </pre>
                          </div>
                        )}

                        {!step.output && !step.error && (
                          <p className="text-vc-muted text-sm">No output recorded</p>
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
        {run.results && (() => {
          let parsed: unknown;
          try { parsed = JSON.parse(run.results); } catch { parsed = run.results; }
          return (
            <div>
              <h2 className="text-lg font-semibold text-vc-text mb-4">Results</h2>
              <div className="bg-vc-surface rounded-xl border border-vc-border p-4">
                <pre className="text-vc-text text-sm font-mono overflow-auto max-h-64">
                  {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
                </pre>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
