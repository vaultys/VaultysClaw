"use client";

import React, { useState, useEffect } from "react";
import { Play, GitBranch } from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { WorkflowRunModal } from "@/components/workflow/WorkflowRunModal";
import { userApi, unwrap } from "@/lib/api/ts-rest/client";
import { useToast } from "@/components/shared/ToastContext";
import type { WorkflowDefinition } from "@/lib/workflow-types";
import { Workflow } from "@prisma/client";

/**
 * My Workflows — read-only view of the workflows the current user can access
 * (via workspace membership). Creating and managing workflows is admin-only
 * (see /admin/workflows). Users can browse and execute the workflows they have
 * access to. Backed by `userApi.workflows.list`, which already scopes results
 * to the caller's workspaces.
 */
export default function MyWorkflowsPage() {
  const toast = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [executingWorkflow, setExecutingWorkflow] = useState<{
    id: string;
    name: string;
    description: string | null;
    definition: WorkflowDefinition;
  } | null>(null);

  useBreadcrumbs([{ label: "My Workflows" }], []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = unwrap(await userApi.workflows.list({ query: {} }));
        setWorkflows(data.workflows);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
      toast.error("Failed to load workflow");
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
      title: "My Workflows",
      description: "Workflows you can access — run them and follow their runs",
      search: {
        value: search,
        onChange: setSearch,
        placeholder: "Search workflows…",
      },
    },
    [search]
  );

  return (
    <div className="min-h-screen bg-background">
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
            <p className="text-foreground-500">
              You don&apos;t have access to any workflows yet.
            </p>
          </div>
        )}

        {!loading && workflows.length > 0 && filteredWorkflows.length === 0 && (
          <div className="text-center py-16">
            <p className="text-foreground-500">No workflows match &quot;{search}&quot;</p>
          </div>
        )}

        {!loading && filteredWorkflows.length > 0 && (
          <div className="space-y-2">
            {filteredWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="group bg-background-100 rounded-lg border border-neutral-200 overflow-hidden"
              >
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground truncate">
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

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => handleExecuteWorkflow(workflow.id, e)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-success-600 hover:bg-success-50 rounded"
                      title="Execute workflow"
                    >
                      <Play size={14} /> Execute
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
