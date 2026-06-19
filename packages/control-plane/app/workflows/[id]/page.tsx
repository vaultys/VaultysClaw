"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Edit2,
  Play,
  Search,
  CheckCircle2,
  AlertCircle,
  Activity,
  Clock,
  ChevronDown,
  ChevronUp,
  Bot,
  User,
  X,
  GitBranch,
} from "lucide-react";
import { WorkflowViewer } from "@/components/workflow/WorkflowViewer";
import { WorkflowRunModal } from "@/components/workflow/WorkflowRunModal";
import type { WorkflowDefinition } from "@/lib/workflow-types";
import {
  agentsClient,
  workflowsClient,
  workflowRunsClient,
  unwrap,
} from "@/lib/api/ts-rest/client";

interface WorkflowData {
  id: string;
  name: string;
  description: string | null;
  definition: WorkflowDefinition;
  realmId?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  results?: string | null;
}

interface WorkflowRunStep {
  id: string;
  runId: string;
  stepId: string;
  agentId: string | null;
  status: string;
  output: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
}

interface RunDetail {
  run: WorkflowRun;
  workflow: { id: string; name: string; definition: WorkflowDefinition } | null;
  steps: WorkflowRunStep[];
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function timeAgo(val: unknown): string {
  const ms = parseTimestamp(val);
  if (ms === null) return "—";
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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

function getStatusIcon(status: string, size = 16) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={size} className="text-success-500" />;
    case "failed":
      return <AlertCircle size={size} className="text-danger-500" />;
    case "rejected":
      return <AlertCircle size={size} className="text-warning-500" />;
    case "running":
      return (
        <Activity size={size} className="text-primary-500 animate-pulse" />
      );
    case "waiting_approval":
      return <Clock size={size} className="text-warning-500" />;
    default:
      return <Clock size={size} className="text-foreground-500" />;
  }
}

function statusBadgeClass(status: string): string {
  const base =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium";
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

const STATUS_OPTIONS = [
  "all",
  "completed",
  "running",
  "failed",
  "waiting_approval",
  "rejected",
];

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = typeof params.id === "string" ? params.id : params.id?.[0];

  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runSearch, setRunSearch] = useState("");
  const [runStatusFilter, setRunStatusFilter] = useState("all");

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const [executingWorkflow, setExecutingWorkflow] = useState(false);
  const [realmName, setRealmName] = useState<string | null>(null);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (workflowId === "new") {
      router.replace("/workflows/new/edit");
      return;
    }
    if (workflowId) {
      fetchWorkflow(workflowId);
      fetchRuns(workflowId);
    }
  }, [workflowId]);

  useEffect(() => {
    if (selectedRunId) {
      fetchRunDetail(selectedRunId);
      setExpandedSteps(new Set());
    } else {
      setRunDetail(null);
    }
  }, [selectedRunId]);

  // Resolve agent names for all agent DIDs in the loaded run detail
  useEffect(() => {
    if (!runDetail) return;
    const dids = new Set<string>();
    for (const step of runDetail.steps) {
      if (step.agentId) dids.add(step.agentId);
    }
    for (const node of runDetail.workflow?.definition?.nodes ?? []) {
      const did = (node.data as any)?.agentId;
      if (did) dids.add(did);
    }
    dids.forEach((did) => resolveAgentName(did));
  }, [runDetail]);

  const fetchWorkflow = async (id: string) => {
    try {
      setLoading(true);
      const res = await workflowsClient.getOne({ params: { id } });
      if (res.status !== 200) {
        setError(
          res.status === 404 ? "Workflow not found" : "Failed to load workflow"
        );
        return;
      }
      const data = res.body as unknown as { workflow: WorkflowData };
      setWorkflow(data.workflow);
      if (data.workflow.realmId) {
        fetch(`/api/realms/${data.workflow.realmId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: any) => d?.realm?.name && setRealmName(d.realm.name))
          .catch(() => {});
      }
    } catch {
      setError("Failed to load workflow");
    } finally {
      setLoading(false);
    }
  };

  const resolveAgentName = useCallback(
    async (did: string) => {
      if (!did || agentNames[did]) return;
      try {
        const agent = unwrap(
          await agentsClient.getAgent({
            params: {
              did,
            },
          })
        );
        setAgentNames((prev) => ({ ...prev, [did]: agent.name! }));
      } catch {}
    },
    [agentNames]
  );

  const fetchRuns = async (id: string) => {
    try {
      setRunsLoading(true);
      const res = await workflowRunsClient.list({
        query: {
          workflowId: id,
          pageSize: 100,
          sortBy: "startedAt",
          sortDir: "desc",
        },
      });
      if (res.status !== 200) return;
      setRuns(res.body.runs as unknown as WorkflowRun[]);
    } catch {
      /* ignore */
    } finally {
      setRunsLoading(false);
    }
  };

  const fetchRunDetail = async (runId: string) => {
    try {
      setRunDetailLoading(true);
      const res = await workflowRunsClient.getOne({ params: { runId } });
      if (res.status !== 200) return;
      setRunDetail(res.body as unknown as RunDetail);
    } catch {
      /* ignore */
    } finally {
      setRunDetailLoading(false);
    }
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const s = new Set(prev);
      s.has(stepId) ? s.delete(stepId) : s.add(stepId);
      return s;
    });
  };

  const filteredRuns = runs.filter((r) => {
    const matchesStatus =
      runStatusFilter === "all" || r.status === runStatusFilter;
    const matchesSearch =
      !runSearch ||
      r.id.toLowerCase().includes(runSearch.toLowerCase()) ||
      r.status.toLowerCase().includes(runSearch.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getSortedSteps = (detail: RunDetail): WorkflowRunStep[] => {
    const def = detail.workflow?.definition;
    if (def) {
      const order = topoSort(def.nodes, def.edges);
      const stepMap = new Map(detail.steps.map((s) => [s.stepId, s]));
      const sorted: WorkflowRunStep[] = [];
      for (const nodeId of order) {
        const s = stepMap.get(nodeId);
        if (s) sorted.push(s);
      }
      for (const s of detail.steps) {
        if (!sorted.includes(s)) sorted.push(s);
      }
      return sorted;
    }
    return [...detail.steps].sort((a, b) => {
      const at = parseTimestamp(a.startedAt) ?? 0;
      const bt = parseTimestamp(b.startedAt) ?? 0;
      return at - bt;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/workflows"
            className="inline-flex items-center gap-2 text-primary-500 hover:text-primary-400 mb-6"
          >
            <ChevronLeft size={18} /> Back to Workflows
          </Link>
          <div className="bg-background-100 rounded-xl border border-neutral-200 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-danger-500 mx-auto mb-4" />
            <p className="text-foreground font-medium mb-2">
              {error ?? "Workflow not found"}
            </p>
            <Link
              href="/workflows"
              className="text-primary-500 hover:text-primary-400"
            >
              Return to workflows
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const nodeCount = workflow.definition?.nodes?.length ?? 0;
  const edgeCount = workflow.definition?.edges?.length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background-100 border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href="/workflows"
                className="flex-shrink-0 flex items-center gap-1.5 text-foreground-500 hover:text-foreground text-sm font-medium"
              >
                <ChevronLeft size={16} /> Workflows
              </Link>
              <div className="w-px h-4 bg-neutral-300 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">
                  {workflow.name}
                </h1>
                {workflow.description && (
                  <p className="text-foreground-500 text-sm truncate mt-0.5">
                    {workflow.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setExecutingWorkflow(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-success-600 hover:bg-success-50 rounded-lg border border-success-200"
              >
                <Play size={15} /> Execute
              </button>
              <Link
                href={`/workflows/${workflow.id}/edit`}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
              >
                <Edit2 size={15} /> Edit Workflow
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Workflow overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ReactFlow preview */}
          <div className="lg:col-span-2 bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-2">
              <GitBranch size={15} className="text-foreground-400" />
              <span className="text-sm font-medium text-foreground">
                Workflow Graph
              </span>
              <span className="ml-auto text-xs text-foreground-400">
                {nodeCount} node{nodeCount !== 1 ? "s" : ""} · {edgeCount} edge
                {edgeCount !== 1 ? "s" : ""}
              </span>
            </div>
            {nodeCount === 0 ? (
              <div className="h-64 flex items-center justify-center text-foreground-400 text-sm">
                No nodes defined
              </div>
            ) : (
              <div className="h-72">
                <WorkflowViewer definition={workflow.definition} />
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="bg-background-100 rounded-xl border border-neutral-200 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Details</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-foreground-400 text-xs uppercase tracking-wide mb-1">
                  Created
                </p>
                <p className="text-foreground">
                  {formatDate(workflow.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-foreground-400 text-xs uppercase tracking-wide mb-1">
                  Last updated
                </p>
                <p className="text-foreground">
                  {formatDate(workflow.updatedAt)}
                </p>
                <p className="text-foreground-500 text-xs mt-0.5">
                  {timeAgo(workflow.updatedAt)}
                </p>
              </div>
              {workflow.realmId && (
                <div>
                  <p className="text-foreground-400 text-xs uppercase tracking-wide mb-1">
                    Realm
                  </p>
                  <Link
                    href={`/realms/${workflow.realmId}`}
                    className="text-primary-500 hover:text-primary-400 text-xs font-medium"
                  >
                    {realmName ?? workflow.realmId.slice(0, 16) + "…"}
                  </Link>
                </div>
              )}
              <div>
                <p className="text-foreground-400 text-xs uppercase tracking-wide mb-1">
                  Total runs
                </p>
                <p className="text-foreground font-medium">{runs.length}</p>
              </div>
              {runs.length > 0 && (
                <div>
                  <p className="text-foreground-400 text-xs uppercase tracking-wide mb-1">
                    Last run
                  </p>
                  <p className="text-foreground text-xs">
                    {timeAgo(runs[0]?.startedAt)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selected run detail panel */}
        {selectedRunId && (
          <div className="bg-background-100 rounded-xl border border-primary-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 bg-primary-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Run Details
                </span>
                <span className="font-mono text-xs text-foreground-400">
                  {selectedRunId.slice(0, 8)}…
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/workflows/runs/${selectedRunId}`}
                  className="text-xs text-primary-500 hover:text-primary-400 font-medium"
                >
                  Open full page
                </Link>
                <button
                  onClick={() => setSelectedRunId(null)}
                  className="p-1 text-foreground-400 hover:text-foreground rounded"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {runDetailLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : runDetail ? (
              <div className="p-4">
                {/* Run summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-neutral-200">
                  <div>
                    <p className="text-foreground-400 text-xs uppercase tracking-wide mb-1">
                      Status
                    </p>
                    <div className={statusBadgeClass(runDetail.run.status)}>
                      {getStatusIcon(runDetail.run.status)}
                      {runDetail.run.status}
                    </div>
                  </div>
                  <div>
                    <p className="text-foreground-400 text-xs uppercase tracking-wide mb-1">
                      Started
                    </p>
                    <p className="text-foreground text-xs">
                      {formatDate(runDetail.run.startedAt)}
                    </p>
                    <p className="text-foreground-400 text-xs mt-0.5">
                      {timeAgo(runDetail.run.startedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground-400 text-xs uppercase tracking-wide mb-1">
                      Completed
                    </p>
                    <p className="text-foreground text-xs">
                      {formatDate(runDetail.run.completedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground-400 text-xs uppercase tracking-wide mb-1">
                      Steps
                    </p>
                    <p className="text-foreground font-medium text-sm">
                      {runDetail.steps.length}
                    </p>
                  </div>
                </div>

                {/* Steps */}
                <div className="space-y-2">
                  {getSortedSteps(runDetail).map((step, idx) => {
                    const def = runDetail.workflow?.definition;
                    const nodeMap = new Map(
                      def?.nodes.map((n) => [n.id, n]) ?? []
                    );
                    const node = nodeMap.get(step.stepId);
                    const nodeData = node?.data ?? {};
                    const agentDid =
                      (nodeData.agentId as string | undefined) ??
                      step.agentId ??
                      null;
                    const agentName = agentDid
                      ? (agentNames[agentDid] ?? null)
                      : null;
                    const userDid =
                      step.assignedUserId ??
                      (nodeData.assignedUserId as string | undefined) ??
                      null;
                    const userName =
                      step.assignedUserName ??
                      (nodeData.assignedUserName as string | undefined) ??
                      null;
                    const userEmail = step.assignedUserEmail ?? null;
                    const nodeLabel =
                      (nodeData.label as string | undefined) ?? step.stepId;
                    const isExpanded = expandedSteps.has(step.id);
                    const stepStartMs = parseTimestamp(step.startedAt);
                    const stepEndMs = parseTimestamp(step.completedAt);
                    const stepDuration =
                      stepStartMs !== null && stepEndMs !== null
                        ? Math.round((stepEndMs - stepStartMs) / 1000)
                        : null;

                    return (
                      <div
                        key={step.id}
                        className="bg-background rounded-lg border border-neutral-200 overflow-hidden"
                      >
                        <button
                          onClick={() => toggleStep(step.id)}
                          className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-background-200/50 transition text-left"
                        >
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-background-200 border border-neutral-200 text-foreground-500 text-xs font-bold flex items-center justify-center">
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
                              <span
                                className={statusBadgeClass(
                                  step.status
                                ).replace("px-2.5 py-1", "px-2 py-0.5")}
                              >
                                {step.status}
                              </span>
                              {agentName && (
                                <span className="inline-flex items-center gap-1 text-xs text-foreground-500">
                                  <Bot size={11} /> {agentName}
                                </span>
                              )}
                              {userName && (
                                <span className="inline-flex items-center gap-1 text-xs text-foreground-500">
                                  <User size={11} /> {userName}
                                </span>
                              )}
                            </div>
                            {step.startedAt && (
                              <p className="text-xs text-foreground-400 mt-0.5">
                                {formatDate(step.startedAt)}
                                {stepDuration !== null && ` · ${stepDuration}s`}
                              </p>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            {isExpanded ? (
                              <ChevronUp
                                size={16}
                                className="text-foreground-500"
                              />
                            ) : (
                              <ChevronDown
                                size={16}
                                className="text-foreground-500"
                              />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-neutral-200 px-3 py-3 space-y-3 bg-background-200/30">
                            {agentDid && (
                              <div>
                                <div className="flex items-center gap-1.5 text-xs text-foreground-500 mb-1">
                                  <Bot size={12} /> Agent
                                </div>
                                <div className="ml-4">
                                  {agentName && (
                                    <p className="text-foreground text-xs font-medium">
                                      {agentName}
                                    </p>
                                  )}
                                  <p className="text-foreground-500 font-mono text-xs break-all">
                                    {agentDid}
                                  </p>
                                </div>
                              </div>
                            )}
                            {userDid && (
                              <div>
                                <div className="flex items-center gap-1.5 text-xs text-foreground-500 mb-1">
                                  <User size={12} /> Assigned User
                                </div>
                                <div className="ml-4">
                                  {userName && (
                                    <p className="text-foreground text-xs font-medium">
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
                            {step.output &&
                              (() => {
                                let parsed: unknown;
                                try {
                                  parsed = JSON.parse(step.output);
                                } catch {
                                  parsed = step.output;
                                }
                                return (
                                  <div>
                                    <p className="text-xs text-foreground-500 mb-1.5">
                                      Output
                                    </p>
                                    <pre className="bg-background-100 rounded p-2.5 text-foreground text-xs font-mono overflow-auto max-h-40 border border-neutral-200">
                                      {typeof parsed === "string"
                                        ? parsed
                                        : JSON.stringify(parsed, null, 2)}
                                    </pre>
                                  </div>
                                );
                              })()}
                            {step.error && (
                              <div>
                                <p className="text-xs text-danger-600 mb-1.5">
                                  Error
                                </p>
                                <pre className="bg-danger-50 rounded p-2.5 text-danger-700 text-xs font-mono overflow-auto max-h-40 border border-danger-200">
                                  {step.error}
                                </pre>
                              </div>
                            )}
                            {!step.output && !step.error && (
                              <p className="text-foreground-500 text-xs">
                                No output recorded
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Results */}
                {runDetail.run.results &&
                  (() => {
                    let parsed: unknown;
                    try {
                      parsed = JSON.parse(runDetail.run.results);
                    } catch {
                      parsed = runDetail.run.results;
                    }
                    return (
                      <div className="mt-4 pt-4 border-t border-neutral-200">
                        <p className="text-sm font-semibold text-foreground mb-2">
                          Results
                        </p>
                        <pre className="bg-background rounded p-3 text-foreground text-xs font-mono overflow-auto max-h-40 border border-neutral-200">
                          {typeof parsed === "string"
                            ? parsed
                            : JSON.stringify(parsed, null, 2)}
                        </pre>
                      </div>
                    );
                  })()}
              </div>
            ) : null}
          </div>
        )}

        {/* Runs section */}
        <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground">
              Runs
              {runs.length > 0 && (
                <span className="ml-1.5 text-foreground-400 font-normal">
                  ({runs.length})
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status filter */}
              <select
                value={runStatusFilter}
                onChange={(e) => setRunStatusFilter(e.target.value)}
                className="text-sm bg-background border border-neutral-200 rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All statuses" : s.replace("_", " ")}
                  </option>
                ))}
              </select>
              {/* Search */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-400"
                />
                <input
                  type="text"
                  placeholder="Search runs…"
                  value={runSearch}
                  onChange={(e) => setRunSearch(e.target.value)}
                  className="text-sm bg-background border border-neutral-200 rounded-lg pl-8 pr-3 py-1.5 text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500 w-44"
                />
              </div>
              <button
                onClick={() => workflowId && fetchRuns(workflowId)}
                className="text-xs text-foreground-500 hover:text-foreground px-2 py-1.5 rounded border border-neutral-200 hover:bg-background-200"
              >
                Refresh
              </button>
            </div>
          </div>

          {runsLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="px-4 py-10 text-center text-foreground-500 text-sm">
              {runs.length === 0
                ? "No runs yet for this workflow"
                : "No runs match the current filter"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider bg-background-200/50">
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Run ID</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map((run) => {
                    const startMs = parseTimestamp(run.startedAt);
                    const endMs = parseTimestamp(run.completedAt);
                    const duration =
                      startMs !== null && endMs !== null
                        ? Math.round((endMs - startMs) / 1000)
                        : null;
                    const isSelected = run.id === selectedRunId;

                    return (
                      <tr
                        key={run.id}
                        onClick={() =>
                          setSelectedRunId(isSelected ? null : run.id)
                        }
                        className={`border-b border-neutral-200/50 cursor-pointer transition ${
                          isSelected
                            ? "bg-primary-50"
                            : "hover:bg-background-200/30"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className={statusBadgeClass(run.status)}>
                            {getStatusIcon(run.status)}
                            {run.status}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground-500 font-mono text-xs">
                          {run.id.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground text-xs">
                            {formatDate(run.startedAt)}
                          </div>
                          <div className="text-foreground-500 text-xs mt-0.5">
                            {timeAgo(run.startedAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground-500 text-xs">
                          {duration !== null ? `${duration}s` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Execute modal */}
      {executingWorkflow && workflow && (
        <WorkflowRunModal
          workflowId={workflow.id}
          workflowName={workflow.name}
          workflowDescription={workflow.description}
          definition={workflow.definition}
          isOpen={executingWorkflow}
          onClose={() => {
            setExecutingWorkflow(false);
            fetchRuns(workflow.id);
          }}
        />
      )}
    </div>
  );
}
