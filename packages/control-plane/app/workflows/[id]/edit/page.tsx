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
import type { WorkflowDefinition } from "@/lib/workflow-types";

export default function WorkflowEditPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workflowId = typeof params.id === "string" ? params.id : params.id?.[0];
  const realmFromUrl = searchParams.get("realm");
  const {
    setWorkflow,
    clearWorkflow,
    setRealmId,
    setWorkflowInput,
    definition,
  } = useWorkflowStore();
  const fromTemplate = searchParams.get("fromTemplate") === "1";

  useEffect(() => {
    if (workflowId === "new") {
      if (!fromTemplate) {
        clearWorkflow();
      }
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
        data.workflow.realmId
      );
      if (data.workflow.definition.input) {
        setWorkflowInput(data.workflow.definition.input);
      }
    } catch (err) {
      console.error("Failed to fetch workflow:", err);
      alert("Failed to load workflow");
    }
  };

  const backHref = realmFromUrl
    ? `/realms/${realmFromUrl}`
    : workflowId !== "new"
      ? `/workflows/${workflowId}`
      : "/workflows";

  const backLabel = realmFromUrl
    ? "Back to Realm"
    : workflowId !== "new"
      ? "Back to Workflow"
      : "Back";

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="border-b border-neutral-200 bg-background-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={backHref}
            className="flex items-center gap-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium text-sm px-4 py-3"
          >
            <ChevronLeft size={18} /> {backLabel}
          </Link>
          <TitleDescriptionEditor />
        </div>
        <ImportExportButtons
          workflowId={workflowId !== "new" ? workflowId : undefined}
        />
      </div>

      <div className="flex-1 flex">
        <div className="flex-1">
          <WorkflowEditor initialDefinition={definition} />
        </div>
        <WorkflowExecutionPanel />
      </div>
    </div>
  );
}
