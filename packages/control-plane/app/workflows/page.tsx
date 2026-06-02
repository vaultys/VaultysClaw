"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
} from "lucide-react";
import { useWorkflowStore } from "@/components/workflow/store";
import { TemplateSelectionModal } from "@/components/workflow/TemplateSelectionModal";
import { ImportExportButtons } from "@/components/workflow/ImportExportButtons";
import { WorkflowRunModal } from "@/components/workflow/WorkflowRunModal";
import type { WorkflowDefinition } from "@/lib/db";

interface WorkflowItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
}

interface WorkflowWithRuns extends WorkflowItem {
  runs?: WorkflowRun[];
  runsExpanded?: boolean;
  loadingRuns?: boolean;
}

function parseTimestamp(val: unknown): number | null {
  if (val === null || val === undefined || val === "" || val === false) return null;
  if (typeof val === "number") return val > 0 ? val * 1000 : null;
  if (typeof val === "string") {
    if (!val.trim()) return null;
    if (/^\d+$/.test(val)) {
      const n = parseInt(val, 10);
      return n > 0 ? n * 1000 : null;
    }
    let s = val.replace(" ", "T");
    if (!s.endsWith("Z") && !s.includes("+") && !/[+-]\d{2}:\d{2}$/.test(s)) s += "Z";
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

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={16} className="text-green-500" />;
    case "failed":
      return <AlertCircle size={16} className="text-red-500" />;
    case "running":
      return <Activity size={16} className="text-blue-500 animate-pulse" />;
    default:
      return <Clock size={16} className="text-foreground-500" />;
  }
}

function getStatusBadge(status: string) {
  const baseClass = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium";
  switch (status) {
    case "completed":
      return `${baseClass} bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400`;
    case "failed":
      return `${baseClass} bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400`;
    case "running":
      return `${baseClass} bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400`;
    default:
      return `${baseClass} bg-background-200 text-foreground-400`;
  }
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowWithRuns[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [executingWorkflow, setExecutingWorkflow] = useState<{
    id: string;
    name: string;
    description: string | null;
    definition: WorkflowDefinition;
  } | null>(null);
  const clearWorkflow = useWorkflowStore((s) => s.clearWorkflow);
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error("Failed to fetch workflows");
      const data = (await res.json()) as { workflows: WorkflowItem[] };
      setWorkflows(
        data.workflows.map((w) => ({
          ...w,
          runsExpanded: false,
          runs: [],
          loadingRuns: false,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch workflows:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleRuns = async (workflowId: string) => {
    setWorkflows((prev) =>
      prev.map((w) => {
        if (w.id !== workflowId) return w;
        if (w.runsExpanded) {
          return { ...w, runsExpanded: false };
        }
        // Load runs if not already loaded
        if (w.runs && w.runs.length > 0) {
          return { ...w, runsExpanded: true };
        }
        // Fetch runs
        fetchRunsForWorkflow(workflowId);
        return { ...w, runsExpanded: true, loadingRuns: true };
      })
    );
  };

  const fetchRunsForWorkflow = async (workflowId: string) => {
    try {
      const res = await fetch(
        `/api/workflow-runs?workflowId=${workflowId}&pageSize=100&sortBy=startedAt&sortDir=desc`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { runs: WorkflowRun[] };
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === workflowId
            ? { ...w, runs: data.runs, loadingRuns: false }
            : w
        )
      );
    } catch (err) {
      console.error("Failed to fetch runs:", err);
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === workflowId ? { ...w, loadingRuns: false } : w
        )
      );
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    try {
      const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete workflow");
      setWorkflows((w) => w.filter((wf) => wf.id !== id));
    } catch (err) {
      console.error("Failed to delete workflow:", err);
      alert("Failed to delete workflow");
    }
  };

  const handleCreateWorkflow = () => {
    clearWorkflow();
  };

  const handleSelectTemplate = async (templateId: string, realmId?: string) => {
    try {
      const res = await fetch(`/api/workflows/templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to load template");
      const data = (await res.json()) as { template: { definition: any; name: string } };

      clearWorkflow();
      setWorkflow("", data.template.name, "", data.template.definition);
      const params = new URLSearchParams({ fromTemplate: "1" });
      if (realmId) params.set("realm", realmId);
      router.push(`/workflows/new?${params.toString()}`);
    } catch (error) {
      console.error("Failed to load template:", error);
      alert("Failed to load template");
    }
  };

  const handleExecuteWorkflow = async (workflowId: string) => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`);
      if (!res.ok) throw new Error("Failed to load workflow");
      const data = (await res.json()) as {
        workflow: {
          id: string;
          name: string;
          description: string | null;
          definition: WorkflowDefinition;
        };
      };
      setExecutingWorkflow(data.workflow);
    } catch (error) {
      console.error("Failed to load workflow:", error);
      alert("Failed to load workflow");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background-100 border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Workflows</h1>
              <p className="text-foreground-500 mt-1">
                Create and manage AI agent orchestration workflows
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
              >
                <Plus size={18} /> From Template
              </button>
              <Link
                href="/workflows/new"
                onClick={handleCreateWorkflow}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                <Plus size={18} /> New Workflow
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {!loading && workflows.length === 0 && (
          <div className="text-center">
            <p className="text-foreground-500 mb-4">No workflows yet. Create your first one!</p>
            <Link
              href="/workflows/new"
              onClick={handleCreateWorkflow}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus size={18} /> Create Workflow
            </Link>
          </div>
        )}

        {!loading && workflows.length > 0 && (
          <div className="space-y-4">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-background-100 rounded-lg border border-neutral-200 overflow-hidden"
              >
                {/* Workflow header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-200 hover:bg-background-200/30 transition">
                  <button
                    onClick={() => toggleRuns(workflow.id)}
                    className="flex-1 flex items-center justify-between text-left"
                  >
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground">{workflow.name}</h3>
                      {workflow.description && (
                        <p className="text-foreground-500 text-sm mt-1">{workflow.description}</p>
                      )}
                      <p className="text-xs text-foreground-400 mt-2">
                        Updated {new Date(workflow.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="ml-4">
                      {workflow.runsExpanded ? (
                        <ChevronUp className="text-foreground-500" />
                      ) : (
                        <ChevronDown className="text-foreground-500" />
                      )}
                    </div>
                  </button>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleExecuteWorkflow(workflow.id)}
                      className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                      title="Execute workflow"
                    >
                      <Play size={16} />
                      Execute
                    </button>
                    <Link
                      href={`/workflows/${workflow.id}`}
                      className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded"
                    >
                      Edit
                      <ChevronRight size={16} />
                    </Link>
                    <button
                      onClick={() => handleDeleteWorkflow(workflow.id)}
                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      title="Delete workflow"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Runs section */}
                {workflow.runsExpanded && (
                  <div className="border-t border-neutral-200">
                    {workflow.loadingRuns ? (
                      <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : workflow.runs && workflow.runs.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider bg-background-200/50">
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Run ID</th>
                              <th className="px-4 py-3">Started</th>
                              <th className="px-4 py-3">Duration</th>
                              <th className="px-4 py-3">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workflow.runs.map((run) => {
                              const startMs = parseTimestamp(run.started_at);
                              const endMs = parseTimestamp(run.completed_at);
                              const duration = startMs !== null && endMs !== null
                                ? Math.round((endMs - startMs) / 1000)
                                : null;
                              return (
                                <tr
                                  key={run.id}
                                  className="border-b border-neutral-200/50 hover:bg-background-200/30 transition"
                                >
                                  <td className="px-4 py-3">
                                    <div className={getStatusBadge(run.status)}>
                                      {getStatusIcon(run.status)}
                                      {run.status}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-foreground-500 font-mono text-xs">
                                    {run.id.slice(0, 8)}…
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="text-foreground text-xs">
                                      {formatDate(run.started_at)}
                                    </div>
                                    <div className="text-foreground-500 text-xs mt-0.5">
                                      {timeAgo(run.started_at)}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-foreground-500 text-xs">
                                    {duration !== null ? `${duration}s` : "—"}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Link
                                      href={`/workflows/runs/${run.id}`}
                                      className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-400 text-sm font-medium"
                                    >
                                      View
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-4 py-8 text-center text-foreground-500 text-sm">
                        No runs yet for this workflow
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Selection Modal */}
      <TemplateSelectionModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      {/* Workflow Execution Modal */}
      {executingWorkflow && (
        <WorkflowRunModal
          workflowId={executingWorkflow.id}
          workflowName={executingWorkflow.name}
          workflowDescription={executingWorkflow.description}
          definition={executingWorkflow.definition}
          isOpen={!!executingWorkflow}
          onClose={() => setExecutingWorkflow(null)}
        />
      )}

      {/* Bottom Action Bar for Import/Export */}
      <div className="fixed bottom-6 right-6">
        <ImportExportButtons onImportComplete={fetchWorkflows} />
      </div>
    </div>
  );
}
