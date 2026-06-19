"use client";

import React, { useCallback, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  MarkerType,
  Background,
  Controls,
  MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Plus,
  Save,
  Play,
  Trash2,
  RotateCcw,
  Bot,
  GitBranch,
  Clock,
  Type,
  User,
  Wrench,
} from "lucide-react";
import { nodeTypes } from "./nodes";
import { PropertiesPanel } from "./PropertiesPanel";
import { useWorkflowStore } from "./store";
import type { WorkflowDefinition } from "@/lib/workflow-types";
import { needsLayout, computeLayout } from "@/lib/workflow-layout";
import { workflowsClient, unwrap } from "@/lib/api/ts-rest/client";

interface WorkflowEditorProps {
  initialDefinition?: WorkflowDefinition;
}

export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({
  initialDefinition,
}) => {
  const {
    definition,
    setDefinition,
    setWorkflow,
    workflowName,
    workflowId,
    workflowRealmId,
    workflowInput,
    setWorkflowInput,
    isExecuting,
    startExecution,
    setSelectedNode,
  } = useWorkflowStore();

  // Use initialDefinition if provided, otherwise use definition from store
  const activeDefinition = initialDefinition || definition;

  const [nodes, setNodes, onNodesChange] = useNodesState(
    (() => {
      const raw = ((activeDefinition?.nodes ?? []) as any[]).map((n: any) => ({
        id: n.id,
        type: n.type || "agent",
        data: n.data || {},
        position: n.position ?? { x: 0, y: 0 },
      }));
      const rawEdges = (activeDefinition?.edges ?? []).map((e: any) => ({
        source: e.source,
        target: e.target,
      }));
      return (needsLayout(raw) ? computeLayout(raw, rawEdges) : raw) as any;
    })()
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    activeDefinition?.edges?.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: e.data,
    })) ?? []
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [showInputModal, setShowInputModal] = useState(false);
  const [pendingInput, setPendingInput] = useState("");

  // When template definition changes (from store), update React Flow canvas
  React.useEffect(() => {
    if (activeDefinition && activeDefinition.nodes.length > 0) {
      const rawNodes = (activeDefinition.nodes as any[]).map((n: any) => ({
        id: n.id,
        type: n.type || "agent",
        data: n.data || {},
        position: n.position ?? { x: 0, y: 0 },
      }));
      const rawEdges = (activeDefinition.edges || []).map((e: any) => ({
        source: e.source,
        target: e.target,
      }));
      const newNodes = needsLayout(rawNodes)
        ? computeLayout(rawNodes, rawEdges)
        : rawNodes;
      const newEdges = (activeDefinition.edges || []).map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: e.data,
      }));
      setNodes(newNodes as any);
      setEdges(newEdges as any);
    }
  }, [initialDefinition?.nodes?.length]); // Only re-run if nodes count changes

  // Sync store definition with React Flow nodes/edges when they change
  React.useEffect(() => {
    const newDefinition: WorkflowDefinition = {
      nodes: nodes.map((n: any) => ({
        id: n.id,
        type: n.type || "agent",
        data: n.data || {},
        position: n.position,
      })),
      edges: edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      })),
      // Preserve the stored default input
      input: workflowInput || undefined,
    };
    setDefinition(newDefinition);
  }, [nodes, edges, setDefinition, workflowInput]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: `${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source!,
        target: connection.target!,
        markerEnd: { type: MarkerType.ArrowClosed },
      };
      setEdges((eds) => addEdge(newEdge, eds));

      // Auto-wire: if the target node has no params (or no `input` param), set its
      // input to the full output of the source node using the template syntax.
      const sourceId = connection.source!;
      const targetId = connection.target!;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== targetId) return n;
          const existing = (n.data?.params as Record<string, unknown>) ?? {};
          // Only auto-wire if `input` is not already set
          if (existing.input !== undefined && existing.input !== "") return n;
          return {
            ...n,
            data: {
              ...n.data,
              params: { ...existing, input: `\${${sourceId}}` },
            },
          };
        })
      );
    },
    [setEdges, setNodes]
  );

  const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
  };

  const handleAddNode = (type: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      data: {
        label: type.charAt(0).toUpperCase() + type.slice(1),
        agentId: type === "agent" ? undefined : undefined,
      },
      position: { x: Math.random() * 400, y: Math.random() * 400 },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleSaveWorkflow = async () => {
    setIsSaving(true);
    setSaveStatus("saving");
    try {
      // Definition is already synced via useEffect, just construct it again for the API call
      const newDefinition: WorkflowDefinition = {
        nodes: nodes.map((n: any) => ({
          id: n.id,
          type: n.type || "agent",
          data: n.data || {},
          position: n.position,
        })),
        edges: edges.map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          data: e.data,
        })),
        input: workflowInput || undefined,
      };

      if (workflowId) {
        // Update existing workflow
        unwrap(
          await workflowsClient.update({
            params: { id: workflowId },
            body: {
              name: workflowName,
              definition: newDefinition as unknown as Record<string, unknown>,
              realmId: workflowRealmId,
            },
          })
        );
      } else {
        // Create new workflow
        const data = unwrap(
          await workflowsClient.create({
            body: {
              name: workflowName,
              definition: newDefinition as unknown as Record<string, unknown>,
              realmId: workflowRealmId,
            },
          })
        );
        // Update store with new workflow ID
        setWorkflow(
          data.workflow.id,
          workflowName,
          data.workflow.description ?? "",
          data.workflow.definition as unknown as WorkflowDefinition,
          data.workflow.realmId ?? "default"
        );
      }

      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save workflow:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteWorkflow = async () => {
    if (!workflowId) {
      alert("Please save the workflow first");
      return;
    }

    // If there's no default input stored, prompt the user
    if (!workflowInput) {
      setPendingInput("");
      setShowInputModal(true);
      return;
    }

    await runExecution(workflowInput);
  };

  const runExecution = async (input: string) => {
    if (!workflowId) return;
    try {
      const data = unwrap(
        await workflowsClient.execute({
          params: { id: workflowId },
          body: { input: input || undefined },
        })
      );
      startExecution(data.runId);
    } catch (err) {
      console.error("Failed to execute workflow:", err);
      alert("Failed to execute workflow");
    }
  };

  const handleClearCanvas = () => {
    if (confirm("Clear all nodes and edges?")) {
      setNodes([]);
      setEdges([]);
      setDefinition({ nodes: [], edges: [] });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-100">
      {/* Toolbar */}
      <div className="border-b border-neutral-200 bg-background-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {workflowName}
            </h2>
            <p className="text-xs text-foreground-500">
              {nodes.length} nodes, {edges.length} edges
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAddNode("agent")}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
            >
              <Bot size={14} /> Agent
            </button>
            <button
              onClick={() => handleAddNode("condition")}
              className="flex items-center gap-1 px-3 py-1.5 bg-warning-600 text-white text-sm rounded hover:bg-warning-700"
            >
              <GitBranch size={14} /> Condition
            </button>
            <button
              onClick={() => handleAddNode("delay")}
              className="flex items-center gap-1 px-3 py-1.5 bg-foreground-700 text-white text-sm rounded hover:opacity-80"
            >
              <Clock size={14} /> Delay
            </button>
            <button
              onClick={() => handleAddNode("label")}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary-400 text-white text-sm rounded hover:bg-primary-500"
            >
              <Type size={14} /> Label
            </button>
            <button
              onClick={() => handleAddNode("user")}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
            >
              <User size={14} /> User
            </button>
            <button
              onClick={() => handleAddNode("skill")}
              className="flex items-center gap-1 px-3 py-1.5 bg-success-600 text-white text-sm rounded hover:bg-success-700"
            >
              <Wrench size={14} /> Skill
            </button>
            <button
              onClick={handleSaveWorkflow}
              disabled={isSaving}
              className="flex items-center gap-1 px-3 py-1.5 bg-success-600 text-white text-sm rounded hover:bg-success-700 disabled:opacity-50"
            >
              <Save size={14} /> Save
            </button>
            <button
              onClick={handleExecuteWorkflow}
              disabled={isExecuting || !workflowId}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white text-sm rounded hover:bg-primary-700 disabled:opacity-50"
            >
              <Play size={14} /> Execute
            </button>
            <button
              onClick={handleClearCanvas}
              className="flex items-center gap-1 px-3 py-1.5 bg-danger-600 text-white text-sm rounded hover:bg-danger-700"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Status message */}
        {saveStatus === "success" && (
          <div className="text-xs text-success-600 font-medium">
            ✓ Workflow saved
          </div>
        )}
        {saveStatus === "error" && (
          <div className="text-xs text-danger-600 font-medium">
            ✗ Failed to save workflow
          </div>
        )}

        {/* Default workflow input */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-500 whitespace-nowrap">
            Default input:
          </label>
          <input
            type="text"
            value={workflowInput}
            onChange={(e) => setWorkflowInput(e.target.value)}
            placeholder="Enter default input for the first agent (optional)…"
            className="flex-1 text-xs bg-background-100 text-foreground border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
        </div>
      </div>

      {/* Editor area with Properties Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* React Flow Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes as any}
            fitView
          >
            <Background />
            <MiniMap zoomable pannable />
          </ReactFlow>
        </div>

        {/* Properties Panel */}
        <PropertiesPanel nodes={nodes} setNodes={setNodes} edges={edges} />
      </div>

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
};
