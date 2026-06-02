"use client";

import React, { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { WorkflowEditor } from "@/components/workflow/WorkflowEditor";
import { WorkflowExecutionPanel } from "@/components/workflow/WorkflowExecutionPanel";
import { ImportExportButtons } from "@/components/workflow/ImportExportButtons";
import { TitleDescriptionEditor } from "@/components/workflow/TitleDescriptionEditor";
import { useWorkflowStore } from "@/components/workflow/store";
import type { WorkflowDefinition } from "@/lib/db";

export default function WorkflowDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workflowId = typeof params.id === "string" ? params.id : params.id?.[0];
  const realmFromUrl = searchParams.get("realm");
  const { setWorkflow, clearWorkflow, setRealmId, setWorkflowInput, workflowId: storeWorkflowId, definition } = useWorkflowStore();
  const fromTemplate = searchParams.get("fromTemplate") === "1";

  useEffect(() => {
    if (workflowId === "new") {
      // Preserve store content only when arriving from a template load
      // In all other cases (direct navigation, from realm) always clear
      if (!fromTemplate) {
        clearWorkflow();
      }
      // Pre-set realm if passed via query param
      if (realmFromUrl) {
        setRealmId(realmFromUrl);
      }
    } else if (workflowId) {
      fetchWorkflow(workflowId);
    }
  }, [workflowId]);

  const fetchWorkflow = async (id: string) => {
    try {
      const res = await fetch(`/api/workflows/${id}`);
      if (!res.ok) throw new Error("Failed to fetch workflow");
      const data = (await res.json()) as {
        workflow: {
          id: string;
          name: string;
          description: string | null;
          definition: WorkflowDefinition;
          realmId?: string;
        };
      };
      setWorkflow(
        data.workflow.id,
        data.workflow.name,
        data.workflow.description ?? "",
        data.workflow.definition,
        data.workflow.realmId,
      );
      // Restore saved default input if present
      if (data.workflow.definition.input) {
        setWorkflowInput(data.workflow.definition.input);
      }
    } catch (err) {
      console.error("Failed to fetch workflow:", err);
      alert("Failed to load workflow");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header with back button and title editor */}
      <div className="border-b border-neutral-200 bg-background-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={realmFromUrl ? `/realms/${realmFromUrl}` : "/workflows"}
            className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium text-sm px-4 py-3"
          >
            <ChevronLeft size={18} /> {realmFromUrl ? "Back to Realm" : "Back"}
          </Link>
          <TitleDescriptionEditor />
        </div>
        <ImportExportButtons workflowId={workflowId !== "new" ? workflowId : undefined} />
      </div>

      {/* Editor and Execution Panel */}
      <div className="flex-1 flex">
        <div className="flex-1">
          <WorkflowEditor initialDefinition={definition} />
        </div>
        <WorkflowExecutionPanel />
      </div>
    </div>
  );
}
