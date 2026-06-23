"use client";

import React, { useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Bot, GitBranch, Zap, Clock, Code, User, Wrench } from "lucide-react";
import { useWorkflowStore } from "./store";
import { agentsClient, usersClient, unwrap } from "@/lib/api/ts-rest/client";

// Base styles for all nodes
const baseNodeStyle =
  "px-4 py-3 rounded-lg border-2 min-w-[150px] shadow-md transition-all cursor-pointer";

// Module-level cache of user id → display name, shared across all UserNodes so
// the users list is only fetched once per page.
let usersNamePromise: Promise<Map<string, string>> | null = null;
function resolveUserName(id: string): Promise<string | null> {
  if (!usersNamePromise) {
    usersNamePromise = usersClient
      .list({ query: { pageSize: 1000 } })
      .then((res) => {
        const map = new Map<string, string>();
        for (const u of unwrap(res).users) {
          if (u.name) map.set(u.id, u.name);
        }
        return map;
      })
      .catch(() => new Map<string, string>());
  }
  return usersNamePromise.then((map) => map.get(id) ?? null);
}

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
        const agent = unwrap(
          await agentsClient.getAgent({ params: { did: agentId } })
        );
        setAgentName(agent.name);
      } catch (err) {
        console.error("Failed to fetch agent name:", err);
      }
    };

    fetchAgentName();
  }, [(data as any).agentId]);

  return (
    <div
      className={`${baseNodeStyle} ${
        isSelectedInStore
          ? "border-primary-500 bg-primary-50"
          : "border-primary-300 bg-primary-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Bot size={16} className="text-primary-600" />
        <span className="font-semibold text-xs text-primary-900">Agent</span>
      </div>
      <p className="text-xs text-neutral-700 font-medium">
        {agentName || (data as any).agentId || "Select agent"}
      </p>
      {(data as any).params && (
        <p className="text-xs text-neutral-500 mt-1">
          {Object.keys((data as any).params).length} param
          {Object.keys((data as any).params).length !== 1 ? "s" : ""}
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
      className={`${baseNodeStyle} ${
        isSelectedInStore
          ? "border-primary-500 bg-primary-50"
          : "border-warning-300 bg-warning-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <GitBranch size={16} className="text-warning-600" />
        <span className="font-semibold text-xs text-warning-900">
          Condition
        </span>
      </div>
      <p className="text-xs text-neutral-700 font-mono break-words">
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
  const parallelCount =
    ((data as any).agents as string[] | undefined)?.length ?? 0;

  return (
    <div
      className={`${baseNodeStyle} ${
        isSelectedInStore
          ? "border-primary-500 bg-primary-50"
          : "border-secondary-300 bg-secondary-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Zap size={16} className="text-secondary-600" />
        <span className="font-semibold text-xs text-secondary-900">
          Parallel
        </span>
      </div>
      <p className="text-xs text-neutral-700 font-medium">
        {parallelCount} agents
      </p>
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
      className={`${baseNodeStyle} ${
        isSelectedInStore
          ? "border-primary-500 bg-primary-50"
          : "border-neutral-200 bg-background-200"
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
      className={`${baseNodeStyle} ${
        isSelectedInStore
          ? "border-primary-500 bg-primary-50"
          : "border-success-300 bg-success-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Code size={16} className="text-success-600" />
        <span className="font-semibold text-xs text-success-900">Custom</span>
      </div>
      <p className="text-xs text-neutral-700">Custom logic</p>
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
  const colorMap: Record<string, { bg: string; border: string; text: string }> =
    {
      yellow: {
        bg: "bg-warning-50",
        border: "border-warning-300",
        text: "text-warning-900",
      },
      pink: {
        bg: "bg-danger-50",
        border: "border-danger-300",
        text: "text-danger-900",
      },
      blue: {
        bg: "bg-primary-50",
        border: "border-primary-300",
        text: "text-primary-900",
      },
      green: {
        bg: "bg-success-50",
        border: "border-success-300",
        text: "text-success-900",
      },
      purple: {
        bg: "bg-secondary-50",
        border: "border-secondary-300",
        text: "text-secondary-900",
      },
      red: {
        bg: "bg-danger-50",
        border: "border-danger-300",
        text: "text-danger-900",
      },
      amber: {
        bg: "bg-warning-50",
        border: "border-warning-300",
        text: "text-warning-900",
      },
      cyan: {
        bg: "bg-primary-50",
        border: "border-primary-300",
        text: "text-primary-900",
      },
    };

  const color = colorMap[(data as any).color || "yellow"];
  const borderClass = isSelectedInStore
    ? "border-primary-500 border-2"
    : `${color.border} border-2`;

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

  const assignedUserId = (data as any).assignedUserId as string | undefined;
  const storedName = (data as any).assignedUserName as string | undefined;
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  // Resolve the display name from the assigned user id when it wasn't stored
  // on the node (e.g. imported / templated workflows that only carry the id).
  useEffect(() => {
    if (storedName || !assignedUserId) {
      setResolvedName(null);
      return;
    }
    let active = true;
    resolveUserName(assignedUserId).then((name) => {
      if (active) setResolvedName(name);
    });
    return () => {
      active = false;
    };
  }, [assignedUserId, storedName]);

  const displayName =
    storedName ||
    resolvedName ||
    (assignedUserId ? `…${assignedUserId.slice(-8)}` : null);

  return (
    <div
      className={`${baseNodeStyle} ${
        isSelectedInStore
          ? "border-primary-500 bg-primary-50"
          : "border-primary-300 bg-primary-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <User size={16} className="text-primary-600" />
        <span className="font-semibold text-xs text-primary-900">User</span>
      </div>
      <p className="text-xs text-neutral-700 font-medium">
        {mode === "approval" ? "⏳ Awaits approval" : "📢 Notification"}
      </p>
      {displayName && (
        <p className="text-xs text-neutral-600 mt-1 truncate">{displayName}</p>
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
 * skillName {string} e.g. "social-media"
 * toolName {string} e.g. "post_to_x"
 * agentId {string} which agent to dispatch to (optional — falls back to any capable agent)
 * inputMapping {string} dot-path into prev output to use as text input (optional)
 */
export const SkillNode: React.FC<NodeProps> = ({ data }) => {
  const selectedNode = useWorkflowStore((s) => s.selectedNodeId);
  const isSelectedInStore = selectedNode === data.id;

  const skillName = (data as any).skillName as string | undefined;
  const toolName = (data as any).toolName as string | undefined;

  return (
    <div
      className={`${baseNodeStyle} ${
        isSelectedInStore
          ? "border-primary-500 bg-primary-50"
          : "border-success-300 bg-success-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Wrench size={16} className="text-success-600" />
        <span className="font-semibold text-xs text-success-900">Skill</span>
      </div>
      {skillName && (
        <p className="text-xs text-neutral-700 font-medium truncate">
          {skillName}
        </p>
      )}
      {toolName && (
        <p className="text-xs text-neutral-500 truncate">{toolName}</p>
      )}
      {!skillName && !toolName && (
        <p className="text-xs text-neutral-400 italic">configure skill…</p>
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
