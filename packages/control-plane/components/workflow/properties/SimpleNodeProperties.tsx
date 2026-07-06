"use client";

import { PredecessorInputs } from "./PredecessorInputs";
import {
  LABEL_COLORS,
  type FlowNode,
  type UpdateNodeData,
  type WorkflowEdge,
} from "./types";

export function ConditionNodeProperties({
  node,
  nodes,
  edges,
  updateNodeData,
}: {
  node: FlowNode;
  nodes: FlowNode[];
  edges: WorkflowEdge[];
  updateNodeData: UpdateNodeData;
}) {
  return (
    <div className="space-y-4">
      <PredecessorInputs
        nodeId={node.id}
        nodes={nodes}
        edges={edges}
        onInsert={(v) =>
          updateNodeData("expression", (node.data.expression || "") + v)
        }
      />
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Expression
        </label>
        <div className="mb-2 rounded border border-neutral-200 bg-background-200/60 p-2 text-xs text-foreground-500">
          Evaluated as JavaScript. Reference predecessor outputs with{" "}
          <code className="font-mono text-primary-700">
            ${"{"}nodeId.field{"}"}
          </code>
          . Must return <code className="font-mono">true</code> or{" "}
          <code className="font-mono">false</code>.
        </div>
        <textarea
          value={node.data.expression || ""}
          onChange={(e) => updateNodeData("expression", e.target.value)}
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-warning-500 focus:border-transparent h-20"
          placeholder="e.g., output.status === 'success' && output.confidence > 0.8"
        />
        <p className="text-xs text-foreground-400 mt-1">
          Returns true/false to route execution.
        </p>
      </div>
    </div>
  );
}

export function DelayNodeProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode;
  updateNodeData: UpdateNodeData;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Duration (seconds)
        </label>
        <input
          type="number"
          value={node.data.duration || 1}
          onChange={(e) =>
            updateNodeData("duration", parseInt(e.target.value) || 1)
          }
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          min="1"
          step="1"
        />
      </div>
    </div>
  );
}

export function ParallelNodeProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode;
  updateNodeData: UpdateNodeData;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Agents (one per line)
        </label>
        <textarea
          value={node.data.agents?.join("\n") || ""}
          onChange={(e) =>
            updateNodeData(
              "agents",
              e.target.value.split("\n").filter((a) => a.trim())
            )
          }
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-secondary-500 focus:border-transparent h-24"
          placeholder="agent-1&#10;agent-2&#10;agent-3"
        />
      </div>
    </div>
  );
}

export function LabelNodeProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode;
  updateNodeData: UpdateNodeData;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Label Text
        </label>
        <textarea
          value={node.data.text || ""}
          onChange={(e) => updateNodeData("text", e.target.value)}
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent h-24"
          placeholder="Enter label text..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-2">
          Color
        </label>
        <div className="grid grid-cols-4 gap-2">
          {Object.keys(LABEL_COLORS).map((color) => (
            <button
              key={color}
              onClick={() => updateNodeData("color", color)}
              className={`w-8 h-8 rounded border-2 capitalize text-xs font-bold transition-all ${
                node.data.color === color
                  ? "border-primary-500 ring-2 ring-offset-1 ring-primary-500"
                  : "border-neutral-200"
              } ${LABEL_COLORS[color]}`}
              title={color}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
