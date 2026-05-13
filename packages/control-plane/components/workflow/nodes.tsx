"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Bot, GitBranch, Zap, Clock, Code } from "lucide-react";
import { useWorkflowStore } from "./store";

// Base styles for all nodes
const baseNodeStyle =
  "px-4 py-3 rounded-lg border-2 min-w-[150px] shadow-md transition-all cursor-pointer";

/**
 * Agent Node — execute an agent with params
 */
export const AgentNode: React.FC<NodeProps> = ({ data }) => {
  const selectedNode = useWorkflowStore((s) => s.selectedNodeId);
  const isSelectedInStore = selectedNode === data.id;

  return (
    <div
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50" : "border-indigo-300 bg-indigo-50"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Bot size={16} className="text-indigo-600" />
        <span className="font-semibold text-xs text-indigo-900">Agent</span>
      </div>
      <p className="text-xs text-gray-700 font-medium">{(data as any).agentId || "Select agent"}</p>
      {(data as any).params && (
        <p className="text-xs text-gray-500 mt-1">
          {Object.keys((data as any).params).length} param{Object.keys((data as any).params).length !== 1 ? "s" : ""}
        </p>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

/**
 * Condition Node — branch based on expression
 */
export const ConditionNode: React.FC<NodeProps> = ({ data }) => {
  const selectedNode = useWorkflowStore((s) => s.selectedNodeId);
  const isSelectedInStore = selectedNode === data.id;

  return (
    <div
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50" : "border-orange-300 bg-orange-50"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <GitBranch size={16} className="text-orange-600" />
        <span className="font-semibold text-xs text-orange-900">Condition</span>
      </div>
      <p className="text-xs text-gray-700 font-mono break-words">
        {(data as any).expression || "if (...)"}
      </p>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} id="true" />
      <Handle type="source" position={Position.Right} id="false" />
    </div>
  );
};

/**
 * Parallel Node — execute multiple agents in parallel
 */
export const ParallelNode: React.FC<NodeProps> = ({ data }) => {
  const selectedNode = useWorkflowStore((s) => s.selectedNodeId);
  const isSelectedInStore = selectedNode === data.id;
  const parallelCount = ((data as any).agents as string[] | undefined)?.length ?? 0;

  return (
    <div
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50" : "border-purple-300 bg-purple-50"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Zap size={16} className="text-purple-600" />
        <span className="font-semibold text-xs text-purple-900">Parallel</span>
      </div>
      <p className="text-xs text-gray-700 font-medium">{parallelCount} agents</p>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

/**
 * Delay Node — wait for N seconds
 */
export const DelayNode: React.FC<NodeProps> = ({ data }) => {
  const selectedNode = useWorkflowStore((s) => s.selectedNodeId);
  const isSelectedInStore = selectedNode === data.id;
  const duration = ((data as any).duration as number) ?? 1;

  return (
    <div
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Clock size={16} className="text-gray-600" />
        <span className="font-semibold text-xs text-gray-900">Delay</span>
      </div>
      <p className="text-xs text-gray-700 font-medium">{duration}s</p>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

/**
 * Custom Node — arbitrary logic
 */
export const CustomNode: React.FC<NodeProps> = ({ data }) => {
  const selectedNode = useWorkflowStore((s) => s.selectedNodeId);
  const isSelectedInStore = selectedNode === data.id;

  return (
    <div
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50" : "border-green-300 bg-green-50"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Code size={16} className="text-green-600" />
        <span className="font-semibold text-xs text-green-900">Custom</span>
      </div>
      <p className="text-xs text-gray-700">Custom logic</p>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

/**
 * Label Node — visual annotation on the canvas
 */
export const LabelNode: React.FC<NodeProps> = ({ data }) => {
  const selectedNode = useWorkflowStore((s) => s.selectedNodeId);
  const isSelectedInStore = selectedNode === data.id;

  // Color palette for labels
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    yellow: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-900" },
    pink: { bg: "bg-pink-50", border: "border-pink-300", text: "text-pink-900" },
    blue: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-900" },
    green: { bg: "bg-green-50", border: "border-green-300", text: "text-green-900" },
    purple: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-900" },
    red: { bg: "bg-red-50", border: "border-red-300", text: "text-red-900" },
    amber: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900" },
    cyan: { bg: "bg-cyan-50", border: "border-cyan-300", text: "text-cyan-900" },
  };

  const color = colorMap[(data as any).color || "yellow"];
  const borderClass = isSelectedInStore ? "border-blue-500 border-2" : `${color.border} border-2`;

  return (
    <div
      className={`${baseNodeStyle} ${color.bg} ${borderClass} max-w-xs p-3`}
      style={{ minWidth: "120px" }}
    >
      <p className={`text-sm font-medium ${color.text} whitespace-pre-wrap`}>
        {(data as any).text || "Add label text..."}
      </p>
    </div>
  );
};

export const nodeTypes = {
  agent: AgentNode,
  condition: ConditionNode,
  parallel: ParallelNode,
  delay: DelayNode,
  custom: CustomNode,
  label: LabelNode,
};
