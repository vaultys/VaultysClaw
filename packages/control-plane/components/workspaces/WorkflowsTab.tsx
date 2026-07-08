"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, GitFork, LayoutTemplate, Plus } from "lucide-react";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { useWorkflowStore } from "@/components/workflow/store";
import { TemplateSelectionModal } from "@/components/workflow/TemplateSelectionModal";
import type { WorkflowDefinition } from "@/lib/workflow-types";
import type { WorkspaceWorkflow } from "./types";
import { ListCard, ListRow } from "./ui";

export function WorkflowsTab({
  workspaceId,
  workflows,
  canManage,
}: {
  workspaceId: string;
  workflows: WorkspaceWorkflow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const setWorkflowStore = useWorkflowStore((s) => s.setWorkflow);
  const clearWorkflowStore = useWorkflowStore((s) => s.clearWorkflow);

  async function handleSelectTemplate(templateId: string) {
    try {
      const data = unwrap(
        await userApi.workflows.getTemplate({ params: { templateId } })
      );
      const template = data.template as {
        definition: WorkflowDefinition;
        name: string;
      };
      clearWorkflowStore();
      setWorkflowStore("", template.name, "", template.definition);
      router.push(`/admin/workflows/new/edit?fromTemplate=1&workspace=${workspaceId}`);
    } catch (err) {
      console.error("Failed to load template:", err);
      alert("Failed to load template");
    }
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-secondary-600 hover:bg-secondary-500 text-white font-medium transition-colors"
          >
            <LayoutTemplate className="w-4 h-4" /> From Template
          </button>
          <Link
            href={`/admin/workflows/new/edit?workspace=${workspaceId}`}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New Workflow
          </Link>
        </div>
      )}
      {workflows.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <GitFork className="w-8 h-8 text-neutral-300 mb-2" />
          <p className="text-foreground-500 text-sm">
            No workflows in this workspace.
          </p>
          {canManage && (
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => setShowTemplateModal(true)}
                className="text-secondary-400 hover:text-secondary-300 text-sm underline"
              >
                Start from template
              </button>
              <span className="text-foreground-400 text-sm">or</span>
              <Link
                href={`/admin/workflows/new/edit?workspace=${workspaceId}`}
                className="text-primary-700 hover:text-primary-300 text-sm underline"
              >
                Create blank workflow
              </Link>
            </div>
          )}
        </div>
      ) : (
        <ListCard>
          {workflows.map((wf, i) => (
            <ListRow key={wf.id} index={i}>
              <div className="w-8 h-8 rounded-lg bg-secondary-600/20 flex items-center justify-center shrink-0">
                <GitFork className="w-4 h-4 text-secondary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground truncate block">
                  {wf.name}
                </span>
                {wf.description && (
                  <p className="text-xs text-foreground-500 truncate">
                    {wf.description}
                  </p>
                )}
                <p className="text-xs text-foreground-400">
                  Updated {new Date(wf.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Link
                href={`/admin/workflows/${wf.id}`}
                className="p-1.5 rounded-lg text-foreground-500 hover:text-primary-400 transition-colors"
                title="Open workflow editor"
              >
                <ChevronRight className="w-4 h-4" />
              </Link>
            </ListRow>
          ))}
        </ListCard>
      )}

      {showTemplateModal && (
        <TemplateSelectionModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          onSelectTemplate={handleSelectTemplate}
        />
      )}
    </div>
  );
}
