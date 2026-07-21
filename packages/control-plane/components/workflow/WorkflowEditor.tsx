"use client";

import React, { useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  MarkerType,
  Background,
  MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";
import { nodeTypes } from "./nodes";
import { PropertiesPanel } from "./PropertiesPanel";
import { WorkflowToolbox } from "./WorkflowToolbox";
import { useWorkflowStore } from "./store";
import type { WorkflowDefinition } from "@/lib/workflow-types";
import { needsLayout, computeLayout } from "@/lib/workflow-layout";
import { useConfirm } from "@/components/shared/ConfirmContext";

interface WorkflowEditorProps {
  initialDefinition?: WorkflowDefinition;
}

export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({
  initialDefinition,
}) => {
  const confirm = useConfirm();
  const {
    definition,
    setDefinition,
    workflowInput,
    setWorkflowInput,
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

  const handleClearCanvas = async () => {
    if (
      await confirm({
        title: "Clear canvas",
        message: "Clear all nodes and edges?",
        variant: "danger",
      })
    ) {
      setNodes([]);
      setEdges([]);
      setDefinition({ nodes: [], edges: [] });
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-background-100">
      {/* React Flow Canvas */}
      <div className="flex-1 relative">
        <WorkflowToolbox
          onAddNode={handleAddNode}
          onClear={handleClearCanvas}
          defaultInput={workflowInput}
          onDefaultInputChange={setWorkflowInput}
        />
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
  );
};
