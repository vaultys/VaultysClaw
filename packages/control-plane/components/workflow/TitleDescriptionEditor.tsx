"use client";

import React, { useState } from "react";
import { Edit2, Check, X } from "lucide-react";
import { useWorkflowStore } from "./store";

export const TitleDescriptionEditor: React.FC = () => {
  const { workflowName, workflowDescription, workflowId, workflowRealmId, setWorkflow, definition } = useWorkflowStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(workflowName);
  const [editDescription, setEditDescription] = useState(workflowDescription);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (workflowId && workflowId !== "new") {
        // Update existing workflow
        const res = await fetch(`/api/workflows/${workflowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName,
            description: editDescription,
            definition,
            realmId: workflowRealmId,
          }),
        });
        if (!res.ok) throw new Error("Failed to update workflow");
      }
      setWorkflow(workflowId || "temp", editName, editDescription, definition, workflowRealmId);
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save workflow metadata:", err);
      alert("Failed to save workflow");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditName(workflowName);
    setEditDescription(workflowDescription);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex-1 px-4 py-3 space-y-2">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full text-lg font-bold text-foreground bg-background-100 border border-neutral-200 rounded px-2 py-1"
          placeholder="Workflow name"
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="w-full text-sm text-foreground-700 bg-background-100 border border-neutral-200 rounded px-2 py-1 resize-none"
          placeholder="Workflow description"
          rows={2}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            <Check size={14} /> Save
          </button>
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-background-200 text-foreground-700 border border-neutral-200 rounded hover:bg-neutral-200"
          >
            <X size={14} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-3 flex items-start justify-between">
      <div>
        <h1 className="text-lg font-bold text-foreground">{workflowName}</h1>
        {workflowDescription && <p className="text-sm text-foreground-500 mt-1">{workflowDescription}</p>}
      </div>
      <button
        onClick={() => setIsEditing(true)}
        className="flex items-center gap-1 px-3 py-1 text-xs text-foreground-500 hover:text-foreground hover:bg-background-200 rounded transition-colors"
        title="Edit workflow title and description"
      >
        <Edit2 size={14} />
      </button>
    </div>
  );
};
