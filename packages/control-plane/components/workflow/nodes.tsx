"use client";

import React, { useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Bot, GitBranch, Zap, Clock, Code, User, Wrench } from "lucide-react";
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
  const [agentName, setAgentName] = useState<string | null>(null);

  // Fetch agent display name when agentId changes
  useEffect(() => {
    const fetchAgentName = async () => {
      const agentId = (data as any).agentId;
      if (!agentId) {
        setAgentName(null);
        return;
      }

      try {
        const res = await fetch(`/api/agents/${agentId}`);
        if (res.ok) {
          const agent = (await res.json()) as { name: string };
          setAgentName(agent.name);
        }
      } catch (err) {
        console.error("Failed to fetch agent name:", err);
      }
    };

    fetchAgentName();
  }, [(data as any).agentId]);

  return (
    <div
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Bot size={16} className="text-indigo-600 dark:text-indigo-400" />
        <span className="font-semibold text-xs text-indigo-900 dark:text-indigo-200">Agent</span>
      </div>
      <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{agentName || (data as any).agentId || "Select agent"}</p>
      {(data as any).params && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <GitBranch size={16} className="text-orange-600 dark:text-orange-400" />
        <span className="font-semibold text-xs text-orange-900 dark:text-orange-200">Condition</span>
      </div>
      <p className="text-xs text-gray-700 dark:text-gray-300 font-mono break-words">
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
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Zap size={16} className="text-purple-600 dark:text-purple-400" />
        <span className="font-semibold text-xs text-purple-900 dark:text-purple-200">Parallel</span>
      </div>
      <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{parallelCount} agents</p>
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
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-neutral-200 bg-background-200"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Clock size={16} className="text-foreground-500" />
        <span className="font-semibold text-xs text-foreground">Delay</span>
      </div>
      <p className="text-xs text-foreground-700 font-medium">{duration}s</p>
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
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Code size={16} className="text-green-600 dark:text-green-400" />
        <span className="font-semibold text-xs text-green-900 dark:text-green-200">Custom</span>
      </div>
      <p className="text-xs text-gray-700 dark:text-gray-300">Custom logic</p>
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
    yellow: { bg: "bg-yellow-50 dark:bg-yellow-900/20", border: "border-yellow-300 dark:border-yellow-700", text: "text-yellow-900 dark:text-yellow-200" },
    pink: { bg: "bg-pink-50 dark:bg-pink-900/20", border: "border-pink-300 dark:border-pink-700", text: "text-pink-900 dark:text-pink-200" },
    blue: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700", text: "text-blue-900 dark:text-blue-200" },
    green: { bg: "bg-green-50 dark:bg-green-900/20", border: "border-green-300 dark:border-green-700", text: "text-green-900 dark:text-green-200" },
    purple: { bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-300 dark:border-purple-700", text: "text-purple-900 dark:text-purple-200" },
    red: { bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-300 dark:border-red-700", text: "text-red-900 dark:text-red-200" },
    amber: { bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-300 dark:border-amber-700", text: "text-amber-900 dark:text-amber-200" },
    cyan: { bg: "bg-cyan-50 dark:bg-cyan-900/20", border: "border-cyan-300 dark:border-cyan-700", text: "text-cyan-900 dark:text-cyan-200" },
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

/**
 * User Node — request user approval or notification
 */
export const UserNode: React.FC<NodeProps> = ({ data }) => {
  const selectedNode = useWorkflowStore((s) => s.selectedNodeId);
  const isSelectedInStore = selectedNode === data.id;
  const mode = (data as any).mode || "approval"; // approval or notification

  return (
    <div
      className={`${baseNodeStyle} ${isSelectedInStore ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900/20"
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <User size={16} className="text-cyan-600 dark:text-cyan-400" />
        <span className="font-semibold text-xs text-cyan-900 dark:text-cyan-200">User</span>
      </div>
      <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">
        {mode === "approval" ? "⏳ Awaits approval" : "📢 Notification"}
      </p>
      {((data as any).assignedUserName || (data as any).assignedUserId) && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
          {(data as any).assignedUserName || `…${((data as any).assignedUserId as string).slice(-8)}`}
        </p>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

/**
 * Skill Node — call a specific skill tool on an agent.
 *
 * data shape:
 *   skillName    {string}  e.g. "social-media"
 *   toolName     {string}  e.g. "post_to_x"
 *   agentId      {string}  which agent to dispatch to (optional — falls back to any capable agent)
 *   inputMapping {string}  dot-path into prev output to use as text input (optional)
 */
export const SkillNode: React.FC<NodeProps> = ({ data }) => {
  const selectedNode = useWorkflowStore((s) => s.selectedNodeId);
  const isSelectedInStore = selectedNode === data.id;

  const skillName = (data as any).skillName as string | undefined;
  const toolName  = (data as any).toolName  as string | undefined;

  return (
    <div
      className={`${baseNodeStyle} ${
        isSelectedInStore
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
          : "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Wrench size={16} className="text-emerald-600 dark:text-emerald-400" />
        <span className="font-semibold text-xs text-emerald-900 dark:text-emerald-200">Skill</span>
      </div>
      {skillName && (
        <p className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate">
          {skillName}
        </p>
      )}
      {toolName && (
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {toolName}
        </p>
      )}
      {!skillName && !toolName && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">configure skill…</p>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
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
  user: UserNode,
  skill: SkillNode,
};
