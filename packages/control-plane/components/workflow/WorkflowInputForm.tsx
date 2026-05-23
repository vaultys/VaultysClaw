"use client";

import React, { useState } from "react";
import type { WorkflowDefinition } from "@/lib/db";

interface WorkflowInputFormProps {
  definition: WorkflowDefinition;
  onSubmit: (input: string) => void;
  isLoading?: boolean;
}

export const WorkflowInputForm: React.FC<WorkflowInputFormProps> = ({
  definition,
  onSubmit,
  isLoading = false,
}) => {
  const [inputValue, setInputValue] = useState(definition.input || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(inputValue);
  };

  const firstNode = definition.nodes.length > 0 ? definition.nodes[0] : null;
  const hasInputFields = firstNode?.data && Object.keys(firstNode.data).length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Instructions */}
      {!hasInputFields && (
        <p className="text-sm text-vc-muted">
          This workflow doesn't require any input to start.
        </p>
      )}

      {/* Input field */}
      {hasInputFields && (
        <div>
          <label htmlFor="workflow-input" className="block text-sm font-medium text-vc-text mb-2">
            Input Data
          </label>
          <textarea
            id="workflow-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder='Enter workflow input (e.g., JSON or plain text)'
            className="w-full px-3 py-2 bg-vc-raised border border-vc-border rounded-lg text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            rows={4}
            disabled={isLoading}
          />
          <p className="text-xs text-vc-muted mt-1">
            {inputValue.length} characters
          </p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed font-medium transition"
      >
        {isLoading ? "Starting..." : "Execute Workflow"}
      </button>
    </form>
  );
};
