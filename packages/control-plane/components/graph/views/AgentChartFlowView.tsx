"use client";

import { useMemo, useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  NodeProps,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  getInitials,
  type GraphData,
  type GraphNode,
} from "@vaultysclaw/shared";

// ─── Constants ──────────────────────────────────────────────────────────────

const NODE_W = 220;
const NODE_H = 80;
const H_GAP = 40;
const V_GAP = 120;
const UNIT = NODE_W + H_GAP;

const ROLE_STYLE: Record<string, { bg: string; border: string; text: string }> =
  {
    owner: {
      bg: "bg-warning-900/30",
      border: "border-warning-600",
      text: "text-warning-700",
    },
    admin: {
      bg: "bg-primary-900/30",
      border: "border-primary-600",
      text: "text-primary-700",
    },
    member: {
      bg: "bg-neutral-900/30",
      border: "border-neutral-600",
      text: "text-neutral-700",
    },
  };

const AGENT_STYLE = {
  bg: "bg-secondary-900/30",
  border: "border-secondary-600",
  text: "text-secondary-700",
};

function roleStyle(role?: string) {
  return ROLE_STYLE[role ?? "member"] ?? ROLE_STYLE.member;
}
function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ─── Agent & User Node Components ───────────────────────────────────────────

interface NodeData {
  label: string;
  role?: string;
  status?: "online" | "offline";
  type: "agent" | "user";
  edgeLabel?: string;
}

const AgentUserNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => {
  const isAgent = data.type === "agent";
  const style = isAgent ? AGENT_STYLE : roleStyle(data.role);
  const bgColor = isAgent
    ? "bg-secondary-600"
    : data.role === "owner"
      ? "bg-warning-600"
      : data.role === "admin"
        ? "bg-primary-600"
        : "bg-neutral-600";

  return (
    <div
      className={`
        px-3 py-2 rounded-lg border-2 cursor-pointer
        ${style.bg} ${style.border}
        ${selected ? "ring-2 ring-primary-500" : ""}
        transition-all hover:shadow-lg
      `}
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-start gap-2">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${bgColor}`}
        >
          {getInitials(data.label)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            {truncate(data.label, 18)}
          </p>
          {data.role && (
            <p className={`text-xs font-medium ${style.text}`}>
              {isAgent ? "Agent" : data.role}
            </p>
          )}
        </div>
        {data.status === "online" && (
          <div
            className="w-2 h-2 rounded-full bg-success-500 flex-shrink-0 mt-1"
            title="Online"
          />
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

// ─── Layout Algorithm ───────────────────────────────────────────────────────

interface ComputedPosition {
  x: number;
  depth: number;
}

function computeLayout(
  data: GraphData,
  targetAgentId?: string
): { nodes: Node[]; edges: Edge[] } {
  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  const userMap = new Map<string, any>();
  const agentMap = new Map<string, any>();

  // Build maps
  for (const node of data.nodes) {
    if (node.type === "user") userMap.set(node.id, node);
    else if (node.type === "agent") agentMap.set(node.id, node);
  }

  // If no targetAgentId, show all nodes
  const visibleNodeIds = new Set(data.nodes.map((n) => n.id));

  // If targetAgentId provided, focus on that agent and its direct relationships
  if (targetAgentId && agentMap.has(targetAgentId)) {
    visibleNodeIds.clear();
    visibleNodeIds.add(targetAgentId);

    // Find all edges connected to this agent
    const connectedNodeIds = new Set<string>();
    for (const edge of data.edges) {
      if (edge.source === targetAgentId) {
        connectedNodeIds.add(edge.target);
      } else if (edge.target === targetAgentId) {
        connectedNodeIds.add(edge.source);
      }
    }
    connectedNodeIds.forEach((id) => visibleNodeIds.add(id));
  }

  // Build layout: target agent at center (depth 0), connected nodes above/below
  const positionMap = new Map<string, ComputedPosition>();

  if (targetAgentId && agentMap.has(targetAgentId)) {
    // ── FOCUSED VIEW: target agent at center ──
    // Place target agent at depth 0
    positionMap.set(targetAgentId, { x: 0, depth: 0 });

    // Place connected nodes: users providing grants above (depth -1), users receiving grants below (depth 1)
    let xOffsetAbove = -UNIT;
    let xOffsetBelow = -UNIT;
    let countAbove = 0;
    let countBelow = 0;

    for (const edge of data.edges) {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target))
        continue;

      if (edge.target === targetAgentId) {
        // User → Agent (grant/delegation): user above
        if (!positionMap.has(edge.source)) {
          positionMap.set(edge.source, { x: xOffsetAbove, depth: -1 });
          xOffsetAbove += UNIT;
          countAbove++;
        }
      } else if (edge.source === targetAgentId) {
        // Agent → User (unlikely in current model, but place below)
        if (!positionMap.has(edge.target)) {
          positionMap.set(edge.target, { x: xOffsetBelow, depth: 1 });
          xOffsetBelow += UNIT;
          countBelow++;
        }
      }
    }

    // Center agent
    const agentPos = positionMap.get(targetAgentId)!;
    agentPos.x = 0;

    // Center users around agent
    let i = 0;
    for (const [nodeId, pos] of positionMap.entries()) {
      if (nodeId === targetAgentId) continue;
      if (pos.depth === -1) {
        pos.x = (i - countAbove / 2) * UNIT;
      }
      i++;
    }

    i = 0;
    for (const [nodeId, pos] of positionMap.entries()) {
      if (pos.depth === 1) {
        pos.x = (i - countBelow / 2) * UNIT;
      }
      i++;
    }
  } else {
    // ── FULL VIEW: grid layout for all agents and users ──
    // Separate agents and users
    const agentIds = Array.from(visibleNodeIds).filter((id) =>
      agentMap.has(id)
    );
    const userIds = Array.from(visibleNodeIds).filter((id) => userMap.has(id));

    const COLS = Math.ceil(Math.sqrt(agentIds.length)) || 1;
    const ROWS = Math.ceil(agentIds.length / COLS) || 1;

    // Place agents in a grid
    agentIds.forEach((agentId, idx) => {
      const row = Math.floor(idx / COLS);
      const col = idx % COLS;
      positionMap.set(agentId, {
        x: (col - (COLS - 1) / 2) * UNIT,
        depth: row,
      });
    });

    // Place users near their connected agents
    const agentPositions = new Map<string, ComputedPosition>();
    agentIds.forEach((agentId) => {
      const pos = positionMap.get(agentId)!;
      agentPositions.set(agentId, pos);
    });

    userIds.forEach((userId) => {
      // Find connected agents
      const connectedAgents: string[] = [];
      for (const edge of data.edges) {
        if (edge.source === userId && agentIds.includes(edge.target)) {
          connectedAgents.push(edge.target);
        } else if (edge.target === userId && agentIds.includes(edge.source)) {
          connectedAgents.push(edge.source);
        }
      }

      if (connectedAgents.length > 0) {
        // Average position of connected agents
        const avgX =
          connectedAgents.reduce(
            (sum, agentId) => sum + (agentPositions.get(agentId)?.x ?? 0),
            0
          ) / connectedAgents.length;
        const avgDepth =
          connectedAgents.reduce(
            (sum, agentId) => sum + (agentPositions.get(agentId)?.depth ?? 0),
            0
          ) / connectedAgents.length;
        // Place user below its agents
        positionMap.set(userId, { x: avgX + UNIT / 2, depth: avgDepth + 1 });
      } else {
        // Place disconnected users in the last row
        const idx = userIds.indexOf(userId);
        const col = idx % COLS;
        positionMap.set(userId, {
          x: (col - (COLS - 1) / 2) * UNIT,
          depth: ROWS + 1,
        });
      }
    });
  }

  // Create nodes
  for (const nodeId of visibleNodeIds) {
    const pos = positionMap.get(nodeId) ?? { x: 0, depth: 0 };
    const node = agentMap.get(nodeId) ?? userMap.get(nodeId);
    if (!node) continue;

    flowNodes.push({
      id: nodeId,
      data: {
        label: node.label || node.id,
        role: node.type === "user" ? (node.role ?? "member") : undefined,
        status: node.isOnline ? "online" : "offline",
        type: node.type,
      },
      position: {
        x: pos.x,
        y: pos.depth * (NODE_H + V_GAP),
      },
      type: "agent-user",
    });
  }

  // Create edges
  for (const edge of data.edges) {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target))
      continue;
    flowEdges.push({
      id: edge.source + "->" + edge.target,
      source: edge.source,
      target: edge.target,
      animated: false,
      style: { stroke: "#64748b", strokeWidth: 2 },
      label: edge.label,
    });
  }

  return { nodes: flowNodes, edges: flowEdges };
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface Props {
  data: GraphData;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  targetAgentId?: string; // If provided, show focused view of this agent + their direct relationships
}

export default function AgentChartFlowView({
  data,
  height,
  onNodeClick,
  targetAgentId,
}: Props) {
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => computeLayout(data, targetAgentId),
    [data, targetAgentId]
  );
  const nodeTypes = useMemo(() => ({ "agent-user": AgentUserNode }), []);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: any) => {
      const originalNode = data.nodes.find((n) => n.id === node.id);
      if (originalNode && onNodeClick) {
        onNodeClick(originalNode);
      }
    },
    [data, onNodeClick]
  );

  return (
    <div className="w-full h-full" style={{ height }}>
      <ReactFlow
        nodes={layoutNodes}
        edges={layoutEdges}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="rgb(var(--neutral-500))" gap={16} />
        <Controls className="react-flow-controls" />
        <MiniMap
          className="react-flow-minimap"
          nodeColor={(node: Node) => {
            const type = node.data?.type;
            if (type === "agent") return "rgb(var(--secondary-500))";
            const role = node.data?.role;
            if (role === "owner") return "rgb(var(--warning-600))";
            if (role === "admin") return "rgb(var(--primary-600))";
            return "rgb(var(--neutral-500))";
          }}
          style={{
            backgroundColor: "var(--background-50)",
            border: "1px solid var(--neutral-200)",
          }}
          zoomable
          pannable
        />
      </ReactFlow>
      <style>{`
        .react-flow-controls {
          bottom: 16px !important;
          left: 16px !important;
        }
        .react-flow-minimap {
          bottom: 16px !important;
          right: 16px !important;
          border-radius: 0.5rem !important;
          background: var(--background-100) !important;
        }
        .react-flow__controls button {
          background: var(--background-100) !important;
          border: 1px solid var(--neutral-200) !important;
          color: var(--foreground-500) !important;
        }
        .react-flow__controls button:hover {
          background: var(--background-200) !important;
          color: var(--foreground-900) !important;
        }
        /* Hide edge labels by default */
        .react-flow__edge-label {
          opacity: 0;
          transition: opacity 0.2s ease-in-out;
          pointer-events: none;
        }
        /* Show edge labels on hover */
        .react-flow__edge:hover .react-flow__edge-label {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}
