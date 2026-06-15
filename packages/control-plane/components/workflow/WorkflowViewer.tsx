"use client";

import React, { useMemo } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  MarkerType,
  Background,
  Controls,
} from "reactflow";
import "reactflow/dist/style.css";
import { nodeTypes } from "./nodes";
import type { WorkflowDefinition } from "@/lib/workflow-types";
import { needsLayout, computeLayout } from "@/lib/workflow-layout";

interface WorkflowViewerProps {
  definition: WorkflowDefinition;
  className?: string;
}

export const WorkflowViewer: React.FC<WorkflowViewerProps> = ({
  definition,
  className,
}) => {
  const rawNodes = ((definition?.nodes ?? []) as any[]).map((n: any) => ({
    id: n.id,
    type: n.type || "agent",
    data: n.data || {},
    position: n.position ?? { x: 0, y: 0 },
  }));

  const rawEdges = (definition?.edges ?? []).map((e) => ({
    source: e.source,
    target: e.target,
  }));

  const nodes: Node[] = useMemo(() => {
    const layoutNodes = needsLayout(rawNodes)
      ? computeLayout(rawNodes, rawEdges)
      : rawNodes;
    return layoutNodes as Node[];
  }, [definition]);

  const edges: Edge[] = useMemo(
    () =>
      (definition?.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: e.data,
      })),
    [definition]
  );

  return (
    <div className={className ?? "w-full h-full"}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};
