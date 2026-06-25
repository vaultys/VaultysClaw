"use client";

/**
 * AgentEnvironmentGraph
 * ─────────────────────
 * A ReactFlow graph showing the full runtime environment of a single agent:
 *
 *   Control Plane ──ws/webrtc──▶ Agent ──policy──▶ Internet / Files / LLM
 *                                       ──peer───▶ Other agents
 *                                       ──rag────▶ Knowledge sources
 *
 * Read-only and security-oriented: at a glance an operator sees what the agent
 * is allowed to do and how it is connected.
 */

import { useMemo } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAgentEnvironmentData } from "@/hooks/useAgentEnvironmentData";
import { buildEnvironmentGraph } from "./agent-environment/buildGraph";
import { nodeTypes } from "./agent-environment/EnvironmentNode";
import type { AgentEnvironmentGraphProps } from "./agent-environment/types";

export default function AgentEnvironmentGraph({
  agentId,
  agentName,
  transport,
  online,
  reportedLlm,
}: AgentEnvironmentGraphProps) {
  const { data, loading, err } = useAgentEnvironmentData(agentId);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    return buildEnvironmentGraph(data, {
      agentName,
      transport,
      online,
      reportedLlm,
    });
  }, [data, agentName, transport, online, reportedLlm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[520px]">
        <Loader2 size={24} className="animate-spin text-primary-400" />
      </div>
    );
  }
  if (err) {
    return (
      <div className="flex items-center gap-2 h-[520px] justify-center text-sm text-danger-400">
        <AlertTriangle size={14} />
        {err}
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: "560px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgb(var(--neutral-200))" gap={24} />
        <Controls />
      </ReactFlow>

      <style>{`
        .react-flow__controls button {
          background: rgb(var(--background-100)) !important;
          border: 1px solid rgb(var(--neutral-200)) !important;
          color: rgb(var(--foreground-500)) !important;
        }
        .react-flow__controls button:hover {
          background: rgb(var(--background-200)) !important;
          color: rgb(var(--foreground-900)) !important;
        }
        .react-flow__edge-label { pointer-events: none; }
      `}</style>
    </div>
  );
}
