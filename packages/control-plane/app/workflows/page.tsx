"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Play, ChevronRight } from "lucide-react";
import { useWorkflowStore } from "@/components/workflow/store";
import { TemplateSelectionModal } from "@/components/workflow/TemplateSelectionModal";
import { ImportExportButtons } from "@/components/workflow/ImportExportButtons";

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
  const [showTemplateModal, setShowTemplateModal] = useState(false);
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
      console.error("Failed to fetch workflows:", err);
      setError(String(err));
    } finally {
      setLoading(false);
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
    // Navigation to editor happens via Link
  };

  const handleSelectTemplate = async (templateId: string, realmId?: string) => {
    try {
      const res = await fetch(`/api/workflows/templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to load template");
      const data = (await res.json()) as { template: { definition: any; name: string } };

      // Load template into store and navigate — fromTemplate=1 tells the editor not to clear
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Workflows</h1>
              <p className="text-gray-600 mt-1">
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
          <div className="text-center text-gray-500">Loading workflows...</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {!loading && workflows.length === 0 && (
          <div className="text-center">
            <p className="text-gray-500 mb-4">No workflows yet. Create your first one!</p>
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
          <div className="grid gap-4">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900">{workflow.name}</h3>
                    {workflow.description && (
                      <p className="text-gray-600 text-sm mt-1">{workflow.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Updated {new Date(workflow.updatedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Link
                      href={`/workflows/${workflow.id}`}
                      className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded"
                    >
                      Edit
                      <ChevronRight size={16} />
                    </Link>
                    <button
                      onClick={() => handleDeleteWorkflow(workflow.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                      title="Delete workflow"
                    >
                      <Trash2 size={16} />
                    </button>
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

      {/* Bottom Action Bar for Import/Export */}
      <div className="fixed bottom-6 right-6">
        <ImportExportButtons onImportComplete={fetchWorkflows} />
      </div>
    </div>
  );
}
