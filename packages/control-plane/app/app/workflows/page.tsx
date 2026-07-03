"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronRight,
  Play,
  GitBranch,
  Upload,
} from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { useWorkflowStore } from "@/components/workflow/store";
import { TemplateSelectionModal } from "@/components/workflow/TemplateSelectionModal";
import { WorkflowRunModal } from "@/components/workflow/WorkflowRunModal";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { WorkflowDefinition } from "@/lib/workflow-types";
import { Workflow } from "@prisma/client";

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useBreadcrumbs([{ label: "Workflows" }], []);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const result = unwrap(
        await userApi.workflows.import({
          body: {
            name: data.name || file.name.replace(".json", ""),
            description: data.description,
            definition: data.definition,
          },
        })
      );
      setWorkflows((w) => [...w, result.workflow]);
    } catch (err) {
      alert("Failed to import workflow: " + String(err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const data = unwrap(await userApi.workflows.list({ query: {} }));
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
      unwrap(await userApi.workflows.remove({ params: { id } }));
      setWorkflows((w) => w.filter((wf) => wf.id !== id));
    } catch {
      alert("Failed to delete workflow");
    }
  };

  const handleSelectTemplate = async (templateId: string, workspaceId?: string) => {
    try {
      const data = unwrap(
        await userApi.workflows.getTemplate({ params: { templateId } })
      );
      const template = data.template as { definition: unknown; name: string };
      clearWorkflow();
      setWorkflow(
        "",
        template.name,
        "",
        template.definition as WorkflowDefinition
      );
      const params = new URLSearchParams({ fromTemplate: "1" });
      if (workspaceId) params.set("workspace", workspaceId);
      router.push(`/app/workflows/new/edit?${params.toString()}`);
    } catch {
      alert("Failed to load template");
    }
  };

  const handleExecuteWorkflow = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const data = unwrap(await userApi.workflows.getOne({ params: { id } }));
      setExecutingWorkflow({
        id: data.workflow.id,
        name: data.workflow.name,
        description: data.workflow.description,
        definition: data.workflow.definition as unknown as WorkflowDefinition,
      });
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

  useToolbar(
    {
      title: "Workflows",
      description: "Create and manage AI agent orchestration workflows",
      search: {
        value: search,
        onChange: setSearch,
        placeholder: "Search workflows…",
      },
      actions: [
        {
          kind: "button",
          id: "import",
          label: "Import",
          icon: <Upload className="w-3.5 h-3.5" />,
          onClick: () => fileInputRef.current?.click(),
        },
        {
          kind: "button",
          id: "from-template",
          label: "From Template",
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: () => setShowTemplateModal(true),
        },
        {
          kind: "button",
          id: "new-workflow",
          label: "New Workflow",
          variant: "primary",
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: () => {
            clearWorkflow();
            router.push("/app/workflows/new/edit");
          },
        },
      ],
    },
    [search, clearWorkflow, router]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-danger-50 border border-danger-200 text-danger-600 px-4 py-3 rounded-lg">
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
              href="/app/workflows/new/edit"
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
                onClick={() => router.push(`/app/workflows/${workflow.id}`)}
                className="group bg-background-100 rounded-lg border border-neutral-200 hover:border-primary-300 hover:shadow-sm transition overflow-hidden cursor-pointer"
              >
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary-600 transition truncate">
                      {workflow.name}
                    </h3>
                    {workflow.description && (
                      <p className="text-foreground-500 text-sm mt-0.5 truncate">
                        {workflow.description}
                      </p>
                    )}
                    <p className="text-xs text-foreground-400 mt-1.5">
                      Updated{" "}
                      {new Date(workflow.updatedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div
                    className="flex items-center gap-1 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => handleExecuteWorkflow(workflow.id, e)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-success-600 hover:bg-success-50 rounded"
                      title="Execute workflow"
                    >
                      <Play size={14} /> Execute
                    </button>
                    <Link
                      href={`/app/workflows/${workflow.id}/edit`}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-foreground-500 hover:text-foreground hover:bg-background-200 rounded"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={(e) => handleDeleteWorkflow(workflow.id, e)}
                      className="p-1.5 text-foreground-400 hover:text-danger-600 hover:bg-danger-50 rounded"
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

      {/* Hidden file input for the toolbar "Import" action */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        className="hidden"
        aria-label="Import workflow file"
      />
    </div>
  );
}
