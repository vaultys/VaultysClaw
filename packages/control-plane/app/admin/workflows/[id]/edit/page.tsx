"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Download, Upload, Save, Play, Trash2, Check } from "lucide-react";
import { WorkflowEditor } from "@/components/workflow/WorkflowEditor";
import { WorkflowExecutionPanel } from "@/components/workflow/WorkflowExecutionPanel";
import { useWorkflowStore } from "@/components/workflow/store";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { WorkflowDefinition } from "@/lib/workflow-types";
import { useToast } from "@/components/shared/ToastContext";
import { useConfirm } from "@/components/shared/ConfirmContext";

type SaveStatus = "idle" | "saving" | "success" | "error";

export default function WorkflowEditPage() {
  const params = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workflowId = typeof params.id === "string" ? params.id : params.id?.[0];
  const workspaceFromUrl = searchParams.get("workspace");
  const fromTemplate = searchParams.get("fromTemplate") === "1";

  const {
    workflowName,
    workflowDescription,
    workflowWorkspaceId,
    workflowInput,
    definition,
    isExecuting,
    setWorkflow,
    setWorkflowName,
    setWorkflowDescription,
    setDefinition,
    setWorkflowInput,
    clearWorkflow,
    setWorkspaceId,
    startExecution,
  } = useWorkflowStore();

  // Bumping this remounts the editor so the canvas re-initialises from the
  // store (used after loading a workflow or importing one from a file).
  const [editorKey, setEditorKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showInputModal, setShowInputModal] = useState(false);
  const [pendingInput, setPendingInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storeId = useWorkflowStore((s) => s.workflowId);
  const nodeCount = definition.nodes?.length ?? 0;
  const edgeCount = definition.edges?.length ?? 0;
  const isPersisted = !!storeId;

  useEffect(() => {
    if (workflowId === "new") {
      if (!fromTemplate) {
        clearWorkflow();
      }
      if (workspaceFromUrl) {
        setWorkspaceId(workspaceFromUrl);
      }
    } else if (workflowId) {
      fetchWorkflow(workflowId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  const fetchWorkflow = async (id: string) => {
    try {
      const data = unwrap(await userApi.workflows.getOne({ params: { id } }));
      const def = data.workflow.definition as unknown as WorkflowDefinition;
      setWorkflow(
        data.workflow.id,
        data.workflow.name,
        data.workflow.description ?? "",
        def,
        data.workflow.workspaceId ?? undefined
      );
      if (def.input) {
        setWorkflowInput(def.input);
      }
      setEditorKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to fetch workflow:", err);
      toast.error("Failed to load workflow");
    }
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      const body = {
        name: workflowName,
        description: workflowDescription,
        definition: definition as unknown as Record<string, unknown>,
        workspaceId: workflowWorkspaceId,
      };
      if (storeId) {
        unwrap(await userApi.workflows.update({ params: { id: storeId }, body }));
      } else {
        const data = unwrap(await userApi.workflows.create({ body }));
        setWorkflow(
          data.workflow.id,
          workflowName,
          data.workflow.description ?? "",
          data.workflow.definition as unknown as WorkflowDefinition,
          data.workflow.workspaceId ?? workflowWorkspaceId
        );
        const qs = workspaceFromUrl ? `?workspace=${workspaceFromUrl}` : "";
        router.replace(`/admin/workflows/${data.workflow.id}/edit${qs}`);
      }
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save workflow:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  const handleExecute = async () => {
    if (!storeId) {
      toast.info("Please save the workflow first");
      return;
    }
    if (!workflowInput) {
      setPendingInput("");
      setShowInputModal(true);
      return;
    }
    await runExecution(workflowInput);
  };

  const runExecution = async (input: string) => {
    if (!storeId) return;
    try {
      const data = unwrap(
        await userApi.workflows.execute({
          params: { id: storeId },
          body: { input: input || undefined },
        })
      );
      startExecution(data.runId);
    } catch (err) {
      console.error("Failed to execute workflow:", err);
      toast.error("Failed to execute workflow");
    }
  };

  const handleExport = async () => {
    if (!storeId) {
      toast.info("Save the workflow first");
      return;
    }
    try {
      const data = unwrap(
        await userApi.workflows.export({ params: { id: storeId } })
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workflow-${data.name.replace(/\s+/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export workflow");
    }
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const def = (data.definition ?? {
        nodes: [],
        edges: [],
      }) as WorkflowDefinition;
      setWorkflowName(data.name || file.name.replace(/\.json$/, ""));
      setWorkflowDescription(data.description ?? "");
      setDefinition(def);
      setWorkflowInput(def.input ?? "");
      setEditorKey((k) => k + 1);
    } catch (err) {
      console.error("Import failed:", err);
      toast.error("Failed to import workflow: " + String(err));
    }
  };

  const handleDelete = async () => {
    if (!storeId) {
      // Unsaved workflow: just go back.
      router.push(workspaceFromUrl ? `/workspaces/${workspaceFromUrl}` : "/admin/workflows");
      return;
    }
    if (
      !(await confirm({
        title: "Delete workflow",
        message: `Delete workflow "${workflowName}"? This cannot be undone.`,
        variant: "danger",
      }))
    )
      return;
    try {
      unwrap(await userApi.workflows.remove({ params: { id: storeId } }));
      router.push(workspaceFromUrl ? `/workspaces/${workspaceFromUrl}` : "/admin/workflows");
    } catch (err) {
      console.error("Failed to delete workflow:", err);
      toast.error("Failed to delete workflow");
    }
  };

  useBreadcrumbs(
    [
      { label: "Workflows", href: "/admin/workflows" },
      { label: workflowName || "New workflow" },
    ],
    [workflowName]
  );

  useToolbar(
    {
      title: workflowName || "Untitled Workflow",
      onTitleChange: setWorkflowName,
      titlePlaceholder: "Untitled Workflow",
      description: `${nodeCount} node${nodeCount === 1 ? "" : "s"} · ${edgeCount} edge${edgeCount === 1 ? "" : "s"}`,
      actions: [
        ...(saveStatus === "success"
          ? [
              {
                kind: "badge" as const,
                id: "saved",
                label: "Saved",
                tone: "success" as const,
                icon: <Check className="w-3 h-3" />,
              },
            ]
          : []),
        {
          kind: "button",
          id: "import",
          label: "Import",
          icon: <Upload className="w-3.5 h-3.5" />,
          onClick: () => fileInputRef.current?.click(),
        },
        {
          kind: "button",
          id: "export",
          label: "Export",
          icon: <Download className="w-3.5 h-3.5" />,
          disabled: !isPersisted,
          onClick: handleExport,
        },
        {
          kind: "button",
          id: "delete",
          label: "Delete",
          variant: "danger",
          icon: <Trash2 className="w-3.5 h-3.5" />,
          onClick: handleDelete,
        },
        {
          kind: "button",
          id: "save",
          label: saveStatus === "saving" ? "Saving…" : "Save",
          icon: <Save className="w-3.5 h-3.5" />,
          disabled: saveStatus === "saving",
          onClick: handleSave,
          variant: "success",
        },
        {
          kind: "button",
          id: "execute",
          label: "Execute",
          variant: "primary",
          icon: <Play className="w-3.5 h-3.5" />,
          disabled: isExecuting || !isPersisted,
          onClick: handleExecute,
        },
      ],
    },
    [
      workflowName,
      nodeCount,
      edgeCount,
      saveStatus,
      isPersisted,
      isExecuting,
      workflowDescription,
      workflowWorkspaceId,
      workflowInput,
      definition,
      storeId,
    ]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex-1 min-h-0">
        <WorkflowEditor key={editorKey} initialDefinition={definition} />
      </div>
      <WorkflowExecutionPanel />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        className="hidden"
        aria-label="Import workflow file"
      />

      {/* Input prompt modal — shown when Execute is clicked and no default input is set */}
      {showInputModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background-100 rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 border border-neutral-200">
            <h3 className="text-base font-semibold text-foreground mb-1">
              Workflow Input
            </h3>
            <p className="text-sm text-foreground-500 mb-4">
              Provide an input for the first agent in this workflow.
            </p>
            <textarea
              autoFocus
              rows={4}
              value={pendingInput}
              onChange={(e) => setPendingInput(e.target.value)}
              placeholder="Type your input here…"
              className="w-full bg-background-200 text-foreground border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <div className="flex items-center gap-2 mt-4 justify-end">
              <label className="flex items-center gap-1.5 text-xs text-foreground-500 mr-auto cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded"
                  onChange={(e) => {
                    if (e.target.checked) setWorkflowInput(pendingInput);
                    else setWorkflowInput("");
                  }}
                />
                Save as default input
              </label>
              <button
                onClick={() => setShowInputModal(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 text-foreground hover:bg-background-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowInputModal(false);
                  runExecution(pendingInput);
                }}
                className="px-4 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium"
              >
                Run Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
