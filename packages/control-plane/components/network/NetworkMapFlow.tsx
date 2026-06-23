import { useMemo } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  Handle,
  Position,
  NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import type { ConnectedAgentRow } from "@/lib/contracts";

interface ServerNodeData {
  wsPort: number;
  peerjsRunning: boolean;
}

interface AgentNodeData {
  label: string;
  transport: "ws" | "peerjs";
}

const ServerNode: React.FC<NodeProps<ServerNodeData>> = ({ data }) => (
  <div
    style={{
      background: "linear-gradient(135deg, #312e81 0%, #4338ca 100%)",
      border: "2px solid #6366f1",
      borderRadius: "12px",
      padding: "14px 18px",
      minWidth: "180px",
      color: "#e0e7ff",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 4px 24px 0 rgba(99,102,241,0.25)",
    }}
  >
    {/* Explicit IDs so edges can pin to the correct side */}
    <Handle
      type="source"
      id="left"
      position={Position.Left}
      style={{ opacity: 0 }}
    />
    <Handle
      type="source"
      id="right"
      position={Position.Right}
      style={{ opacity: 0 }}
    />
    <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "6px" }}>
      Control Plane
    </div>
    <div
      style={{
        fontSize: "11px",
        color: "#a5b4fc",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <span>WebSocket :{data.wsPort}</span>
      <span>
        PeerJS{" "}
        <span
          style={{
            color: data.peerjsRunning ? "#86efac" : "#f87171",
            fontWeight: 600,
          }}
        >
          {data.peerjsRunning ? "● running" : "○ stopped"}
        </span>
      </span>
    </div>
  </div>
);

const AgentNode: React.FC<NodeProps<AgentNodeData>> = ({ data }) => {
  const isWs = data.transport === "ws";
  return (
    <div
      style={{
        background: isWs
          ? "linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)"
          : "linear-gradient(135deg, #2e1065 0%, #6d28d9 100%)",
        border: `2px solid ${isWs ? "rgb(var(--primary-500))" : "rgb(var(--secondary-500))"}`,
        borderRadius: "10px",
        padding: "10px 14px",
        minWidth: "130px",
        color: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
        boxShadow: isWs
          ? "0 2px 12px 0 rgba(14,165,233,0.2)"
          : "0 2px 12px 0 rgba(139,92,246,0.2)",
      }}
    >
      {/* WS agents sit to the RIGHT → handle on their left side facing the server.
          PeerJS agents sit to the LEFT → handle on their right side facing the server. */}
      <Handle
        type="target"
        id="conn"
        position={isWs ? Position.Left : Position.Right}
        style={{ opacity: 0 }}
      />
      <div style={{ fontWeight: 600, fontSize: "12px", marginBottom: "3px" }}>
        {data.label}
      </div>
      <div
        style={{
          fontSize: "10px",
          color: isWs ? "#7dd3fc" : "#c4b5fd",
          fontWeight: 500,
        }}
      >
        {isWs ? "WebSocket" : "WebRTC"}
      </div>
    </div>
  );
};

const SERVER_NODE_ID = "__control_plane__";
const SERVER_X = 340;
const SERVER_Y = 0;
const AGENT_GAP = 80;

function buildFlowGraph(
  agents: ConnectedAgentRow[],
  peerjsRunning: boolean
): { nodes: Node[]; edges: Edge[] } {
  const wsAgents = agents.filter((a) => a.transport === "ws");
  const pjAgents = agents.filter((a) => a.transport === "peerjs");

  const totalRows = Math.max(wsAgents.length, pjAgents.length, 1);
  const totalH = (totalRows - 1) * AGENT_GAP;
  const centerY = SERVER_Y + totalH / 2;

  const nodes: Node[] = [
    {
      id: SERVER_NODE_ID,
      type: "server",
      position: { x: SERVER_X, y: centerY - 40 },
      data: { wsPort: 8080, peerjsRunning },
      connectable: true,
      draggable: true,
    },
  ];

  const edges: Edge[] = [];

  // WS agents on the RIGHT — edge leaves server's right handle, enters agent's left handle
  wsAgents.forEach((agent, i) => {
    const y = i * AGENT_GAP;
    nodes.push({
      id: `ws-${agent.id}`,
      type: "agent",
      position: { x: SERVER_X + 280, y },
      data: { label: agent.name, transport: "ws" },
    });
    edges.push({
      id: `edge-ws-${agent.id}`,
      source: SERVER_NODE_ID,
      sourceHandle: "right",
      target: `ws-${agent.id}`,
      targetHandle: "conn",
      label: "ws",
      style: { stroke: "rgb(var(--primary-500))", strokeWidth: 2 },
      labelStyle: {
        fill: "rgb(var(--primary-500))",
        fontSize: 10,
        fontWeight: 600,
      },
      labelBgStyle: { fill: "transparent" },
      animated: true,
    });
  });

  // PeerJS agents on the LEFT — edge leaves server's left handle, enters agent's right handle
  pjAgents.forEach((agent, i) => {
    const y = i * AGENT_GAP;
    nodes.push({
      id: `pj-${agent.id}`,
      type: "agent",
      position: { x: SERVER_X - 260, y },
      data: { label: agent.name, transport: "peerjs" },
    });
    edges.push({
      id: `edge-pj-${agent.id}`,
      source: SERVER_NODE_ID,
      sourceHandle: "left",
      target: `pj-${agent.id}`,
      targetHandle: "conn",
      label: "webrtc",
      style: { stroke: "rgb(var(--secondary-500))", strokeWidth: 2 },
      labelStyle: {
        fill: "rgb(var(--secondary-500))",
        fontSize: 10,
        fontWeight: 600,
      },
      labelBgStyle: { fill: "transparent" },
      animated: true,
    });
  });

  return { nodes, edges };
}

export function NetworkMapFlow({
  agents,
  peerjsRunning,
}: {
  agents: ConnectedAgentRow[];
  peerjsRunning: boolean;
}) {
  const nodeTypes = useMemo(
    () => ({ server: ServerNode, agent: AgentNode }),
    []
  );
  const { nodes, edges } = useMemo(
    () => buildFlowGraph(agents, peerjsRunning),
    [agents, peerjsRunning]
  );

  return (
    <div style={{ width: "100%", height: "420px", position: "relative" }}>
      {agents.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              color: "var(--foreground-500, #94a3b8)",
              fontSize: "13px",
              background: "var(--background-100, #0f172a)",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--neutral-200, #1e293b)",
            }}
          >
            No agents connected — topology will appear here
          </span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <Background color="#334155" gap={20} />
      </ReactFlow>
      <style>{`
        .react-flow__controls button {
          background: var(--background-100, #1e293b) !important;
          border: 1px solid var(--neutral-200, #334155) !important;
          color: var(--foreground-500, #94a3b8) !important;
        }
        .react-flow__controls button:hover {
          background: var(--background-200, #1e293b) !important;
          color: var(--foreground-900, #f1f5f9) !important;
        }
        .react-flow__edge-label {
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
