"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { useWorkflowStore } from "./store";
import { useWorkflowMembers } from "@/hooks/useWorkflowMembers";
import { AgentNodeProperties } from "./properties/AgentNodeProperties";
import {
  ConditionNodeProperties,
  DelayNodeProperties,
  LabelNodeProperties,
  ParallelNodeProperties,
} from "./properties/SimpleNodeProperties";
import { SkillNodeProperties } from "./properties/SkillNodeProperties";
import { UserNodeProperties } from "./properties/UserNodeProperties";
import { WorkflowProperties } from "./properties/WorkflowProperties";
import type {
  FlowNode,
  WorkflowEdge,
  WorkflowNodeData,
} from "./properties/types";

export function PropertiesPanel({
  nodes,
  setNodes,
  edges,
}: {
  nodes: FlowNode[];
  setNodes: (nodes: FlowNode[]) => void;
  edges: WorkflowEdge[];
}) {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const workflowWorkspaceId = useWorkflowStore((s) => s.workflowWorkspaceId);

  const members = useWorkflowMembers(workflowWorkspaceId);
  const paramsTextRef = useRef<HTMLTextAreaElement | null>(null);

  if (!selectedNodeId) return <WorkflowProperties />;

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) {
    return (
      <div className="w-64 bg-background-200 border-l border-neutral-200 p-4 text-center text-foreground-500 text-sm">
        Node not found
      </div>
    );
  }

  const patchNode = (data: WorkflowNodeData) =>
    setNodes(
      nodes.map((n) => (n.id === selectedNodeId ? { ...n, data } : n))
    );

  const updateNodeData = (key: keyof WorkflowNodeData, value: unknown) =>
    patchNode({ ...node.data, [key]: value } as WorkflowNodeData);

  const updateNodeFields = (patch: Partial<WorkflowNodeData>) =>
    patchNode({ ...node.data, ...patch });

  /** Insert a variable token at the cursor position in the params textarea. */
  const insertIntoParams = (variable: string) => {
    const ta = paramsTextRef.current;
    const currentRaw = JSON.stringify(node.data?.params || {}, null, 2);
    if (!ta) {
      // Fallback: append as a new "input" key
      try {
        updateNodeData("params", { ...JSON.parse(currentRaw), input: variable });
      } catch {
        /* ignore */
      }
      return;
    }
    const start = ta.selectionStart ?? currentRaw.length;
    const end = ta.selectionEnd ?? currentRaw.length;
    const next = currentRaw.slice(0, start) + variable + currentRaw.slice(end);
    try {
      updateNodeData("params", JSON.parse(next));
    } catch {
      // If inserting broke JSON, leave it — user can fix manually
    }
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const renderNodeProperties = () => {
    switch (node.type) {
      case "agent":
        return (
          <AgentNodeProperties
            node={node}
            nodes={nodes}
            edges={edges}
            members={members}
            updateNodeData={updateNodeData}
            updateNodeFields={updateNodeFields}
            insertIntoParams={insertIntoParams}
            paramsTextRef={paramsTextRef}
          />
        );
      case "skill":
        return (
          <SkillNodeProperties
            node={node}
            nodes={nodes}
            edges={edges}
            members={members}
            updateNodeData={updateNodeData}
            updateNodeFields={updateNodeFields}
            insertIntoParams={insertIntoParams}
            paramsTextRef={paramsTextRef}
          />
        );
      case "condition":
        return (
          <ConditionNodeProperties
            node={node}
            nodes={nodes}
            edges={edges}
            updateNodeData={updateNodeData}
          />
        );
      case "delay":
        return <DelayNodeProperties node={node} updateNodeData={updateNodeData} />;
      case "parallel":
        return (
          <ParallelNodeProperties node={node} updateNodeData={updateNodeData} />
        );
      case "label":
        return <LabelNodeProperties node={node} updateNodeData={updateNodeData} />;
      case "user":
        return (
          <UserNodeProperties
            node={node}
            members={members}
            updateNodeData={updateNodeData}
            updateNodeFields={updateNodeFields}
          />
        );
      default:
        return (
          <div className="text-sm text-foreground-500">
            No properties available for {node.type} nodes
          </div>
        );
    }
  };

  return (
    <div className="w-64 bg-background-100 border-l border-neutral-200 flex flex-col h-full overflow-hidden">
      <div className="border-b border-neutral-200 p-4 flex justify-between items-center">
        <h3 className="font-semibold text-foreground text-sm">Properties</h3>
        <button
          onClick={() => setSelectedNode(null)}
          className="p-1 hover:bg-background-200 rounded"
        >
          <X size={16} className="text-foreground-500" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-neutral-200 bg-background-200">
        <p className="text-xs text-foreground-500">Node type</p>
        <p className="font-medium text-sm text-foreground capitalize">
          {node.type}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">{renderNodeProperties()}</div>
    </div>
  );
}
