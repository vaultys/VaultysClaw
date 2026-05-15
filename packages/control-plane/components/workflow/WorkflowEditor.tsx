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
import { Plus, Save, Play, Trash2, RotateCcw, Bot, GitBranch, Clock, Type, User } from "lucide-react";
import { nodeTypes } from "./nodes";
import { PropertiesPanel } from "./PropertiesPanel";
import { useWorkflowStore } from "./store";
import type { WorkflowDefinition } from "@/lib/db";

interface WorkflowEditorProps {
  initialDefinition?: WorkflowDefinition;
}

export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ initialDefinition }) => {
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
    ((activeDefinition?.nodes ?? []) as any[]).map((n: any) => ({
      id: n.id,
      type: n.type || "agent",
      data: n.data || {},
      position: n.position ?? { x: 0, y: 0 },
    })) as any,
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    activeDefinition?.edges?.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: e.data,
    })) ?? [],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [showInputModal, setShowInputModal] = useState(false);
  const [pendingInput, setPendingInput] = useState("");

  // When template definition changes (from store), update React Flow canvas
  React.useEffect(() => {
    if (activeDefinition && activeDefinition.nodes.length > 0) {
      const newNodes = (activeDefinition.nodes as any[]).map((n: any) => ({
        id: n.id,
        type: n.type || "agent",
        data: n.data || {},
        position: n.position ?? { x: 0, y: 0 },
      }));
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
            data: { ...n.data, params: { ...existing, input: `\${${sourceId}}` } },
          };
        })
      );
    },
    [setEdges, setNodes],
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
        const res = await fetch(`/api/workflows/${workflowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: workflowName, definition: newDefinition, realmId: workflowRealmId }),
        });
        if (!res.ok) throw new Error("Failed to update workflow");
      } else {
        // Create new workflow
        const res = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: workflowName, definition: newDefinition, realmId: workflowRealmId }),
        });
        if (!res.ok) throw new Error("Failed to create workflow");
        const data = (await res.json()) as { id: string };
        // Update store with new workflow ID
        setWorkflow(data.id, workflowName, "", newDefinition, workflowRealmId);
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
    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input || undefined }),
      });
      if (!res.ok) throw new Error("Failed to start execution");
      const data = (await res.json()) as { runId: string };
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
    <div className="flex flex-col h-full bg-vc-surface">
      {/* Toolbar */}
      <div className="border-b border-vc-border bg-vc-raised px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-vc-text">{workflowName}</h2>
            <p className="text-xs text-vc-muted">{nodes.length} nodes, {edges.length} edges</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAddNode("agent")}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
            >
              <Bot size={14} /> Agent
            </button>
            <button
              onClick={() => handleAddNode("condition")}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white text-sm rounded hover:bg-orange-700"
            >
              <GitBranch size={14} /> Condition
            </button>
            <button
              onClick={() => handleAddNode("delay")}
              className="flex items-center gap-1 px-3 py-1.5 bg-vc-text-2 text-white text-sm rounded hover:opacity-80"
            >
              <Clock size={14} /> Delay
            </button>
            <button
              onClick={() => handleAddNode("label")}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-400 text-white text-sm rounded hover:bg-indigo-500"
            >
              <Type size={14} /> Label
            </button>
            <button
              onClick={() => handleAddNode("user")}
              className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 text-white text-sm rounded hover:bg-cyan-700"
            >
              <User size={14} /> User
            </button>
            <button
              onClick={handleSaveWorkflow}
              disabled={isSaving}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              <Save size={14} /> Save
            </button>
            <button
              onClick={handleExecuteWorkflow}
              disabled={isExecuting || !workflowId}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <Play size={14} /> Execute
            </button>
            <button
              onClick={handleClearCanvas}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Status message */}
        {saveStatus === "success" && (
          <div className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Workflow saved</div>
        )}
        {saveStatus === "error" && (
          <div className="text-xs text-red-600 dark:text-red-400 font-medium">✗ Failed to save workflow</div>
        )}

        {/* Default workflow input */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-vc-muted whitespace-nowrap">Default input:</label>
          <input
            type="text"
            value={workflowInput}
            onChange={(e) => setWorkflowInput(e.target.value)}
            placeholder="Enter default input for the first agent (optional)…"
            className="flex-1 text-xs bg-vc-surface text-vc-text border border-vc-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
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
          <div className="bg-vc-surface rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 border border-vc-border">
            <h3 className="text-base font-semibold text-vc-text mb-1">Workflow Input</h3>
            <p className="text-sm text-vc-muted mb-4">Provide an input for the first agent in this workflow.</p>
            <textarea
              autoFocus
              rows={4}
              value={pendingInput}
              onChange={(e) => setPendingInput(e.target.value)}
              placeholder="Type your input here…"
              className="w-full bg-vc-raised text-vc-text border border-vc-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <div className="flex items-center gap-2 mt-4 justify-end">
              <label className="flex items-center gap-1.5 text-xs text-vc-muted mr-auto cursor-pointer">
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
                className="px-3 py-1.5 text-sm rounded-lg border border-vc-border text-vc-text hover:bg-vc-raised"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowInputModal(false);
                  runExecution(pendingInput);
                }}
                className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
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
