"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronRight,
  Search,
  Play,
  GitBranch,
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

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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
      setWorkflows(data.workflows);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWorkflow = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm("Delete this workflow?")) return;
    try {
      const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete workflow");
      setWorkflows((w) => w.filter((wf) => wf.id !== id));
    } catch {
      alert("Failed to delete workflow");
    }
  };

  const handleSelectTemplate = async (templateId: string, realmId?: string) => {
    try {
      const res = await fetch(`/api/workflows/templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to load template");
      const data = (await res.json()) as {
        template: { definition: any; name: string };
      };
      clearWorkflow();
      setWorkflow("", data.template.name, "", data.template.definition);
      const params = new URLSearchParams({ fromTemplate: "1" });
      if (realmId) params.set("realm", realmId);
      router.push(`/workflows/new/edit?${params.toString()}`);
    } catch {
      alert("Failed to load template");
    }
  };

  const handleExecuteWorkflow = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/workflows/${id}`);
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
    } catch {
      alert("Failed to load workflow");
    }
  };

  const filteredWorkflows = workflows.filter((w) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      w.name.toLowerCase().includes(q) ||
      (w.description ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background-100 border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Workflows</h1>
              <p className="text-foreground-500 mt-1">
                Create and manage AI agent orchestration workflows
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 font-medium"
              >
                <Plus size={18} /> From Template
              </button>
              <Link
                href="/workflows/new/edit"
                onClick={clearWorkflow}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
              >
                <Plus size={18} /> New Workflow
              </Link>
            </div>
          </div>

          {/* Search */}
          <div className="mt-4 relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" />
            <input
              type="text"
              placeholder="Search workflows…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-neutral-200 rounded-lg text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {!loading && workflows.length === 0 && (
          <div className="text-center py-16">
            <GitBranch className="w-12 h-12 text-foreground-300 mx-auto mb-4" />
            <p className="text-foreground-500 mb-4">
              No workflows yet. Create your first one!
            </p>
            <Link
              href="/workflows/new/edit"
              onClick={clearWorkflow}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus size={18} /> Create Workflow
            </Link>
          </div>
        )}

        {!loading && workflows.length > 0 && filteredWorkflows.length === 0 && (
          <div className="text-center py-16">
            <p className="text-foreground-500">No workflows match "{search}"</p>
          </div>
        )}

        {!loading && filteredWorkflows.length > 0 && (
          <div className="space-y-2">
            {filteredWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                onClick={() => router.push(`/workflows/${workflow.id}`)}
                className="group bg-background-100 rounded-lg border border-neutral-200 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition overflow-hidden cursor-pointer"
              >
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary-600 dark:group-hover:text-primary-400 transition truncate">
                      {workflow.name}
                    </h3>
                    {workflow.description && (
                      <p className="text-foreground-500 text-sm mt-0.5 truncate">
                        {workflow.description}
                      </p>
                    )}
                    <p className="text-xs text-foreground-400 mt-1.5">
                      Updated {new Date(workflow.updatedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleExecuteWorkflow(workflow.id, e)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-success-600 dark:text-success-400 hover:bg-success-50 dark:hover:bg-success-900/20 rounded"
                      title="Execute workflow"
                    >
                      <Play size={14} /> Execute
                    </button>
                    <Link
                      href={`/workflows/${workflow.id}/edit`}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-foreground-500 hover:text-foreground hover:bg-background-200 rounded"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={(e) => handleDeleteWorkflow(workflow.id, e)}
                      className="p-1.5 text-foreground-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded"
                      title="Delete workflow"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight
                      size={16}
                      className="text-foreground-300 group-hover:text-foreground-500 transition ml-1"
                    />
                  </div>
                </div>
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

      {/* Import/Export */}
      <div className="fixed bottom-6 right-6">
        <ImportExportButtons onImportComplete={fetchWorkflows} />
      </div>
    </div>
  );
}
