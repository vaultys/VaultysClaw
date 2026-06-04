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
import type { GraphData, GraphNode } from "@vaultysclaw/shared";

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
    manager: {
      bg: "bg-primary-900/30",
      border: "border-primary-600",
      text: "text-primary-700",
    },
    operator: {
      bg: "bg-success-900/30",
      border: "border-success-600",
      text: "text-success-700",
    },
    member: {
      bg: "bg-neutral-900/30",
      border: "border-neutral-600",
      text: "text-neutral-700",
    },
  };

function roleStyle(role?: string) {
  return ROLE_STYLE[role ?? "member"] ?? ROLE_STYLE.member;
}

function initials(label: string): string {
  return (
    label
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ─── User Node Component ────────────────────────────────────────────────────

interface UserNodeData {
  label: string;
  role?: string;
  status?: "online" | "offline";
  realmId?: string;
}

const UserNode: React.FC<NodeProps<UserNodeData>> = ({ data, selected }) => {
  const style = roleStyle(data.role);
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
          className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
            data.role === "owner"
              ? "bg-warning-600"
              : data.role === "admin"
                ? "bg-primary-600"
                : data.role === "manager"
                  ? "bg-primary-600"
                  : data.role === "operator"
                    ? "bg-success-600"
                    : "bg-neutral-600"
          }`}
        >
          {initials(data.label)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            {truncate(data.label, 18)}
          </p>
          {data.role && (
            <p className={`text-xs font-medium ${style.text}`}>{data.role}</p>
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

// ─── Layout Algorithm (from HierarchyView) ──────────────────────────────────

interface TreePos {
  x: number;
  depth: number;
}

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

function computeLayout(data: GraphData, currentUserId?: string): LayoutResult {
  const userNodes = data.nodes.filter((n) => n.type === "user");
  const userMap = new Map(userNodes.map((n) => [n.id, n]));

  // Build hierarchy from reports_to edges
  const childMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  for (const e of data.edges) {
    if (e.type !== "reports_to") continue;
    const child = e.source;
    const parent = e.target;
    if (!userMap.has(child) || !userMap.has(parent)) continue;
    parentMap.set(child, parent);
    if (!childMap.has(parent)) childMap.set(parent, []);
    childMap.get(parent)!.push(child);
  }

  // If currentUserId is provided, ONLY show: parent + current + direct children (no grandparents/grandchildren)
  let visibleUserIds = new Set<string>();
  if (currentUserId && userMap.has(currentUserId)) {
    // Add current user
    visibleUserIds.add(currentUserId);
    // Add direct parent only
    const parentId = parentMap.get(currentUserId);
    if (parentId) visibleUserIds.add(parentId);
    // Add direct children only (not their children)
    const children = childMap.get(currentUserId) ?? [];
    children.forEach((id) => visibleUserIds.add(id));
  } else {
    // Show all users if no currentUserId specified
    userNodes.forEach((n) => visibleUserIds.add(n.id));
  }

  // Compute subtree widths (only for visible users)
  const widths = new Map<string, number>();
  function getWidth(id: string): number {
    if (!visibleUserIds.has(id)) return 0;
    if (widths.has(id)) return widths.get(id)!;
    const children = (childMap.get(id) ?? []).filter((c) =>
      visibleUserIds.has(c)
    );
    const w =
      children.length === 0 ? 1 : children.reduce((s, c) => s + getWidth(c), 0);
    widths.set(id, w);
    return w;
  }
  Array.from(visibleUserIds).forEach((id) => getWidth(id));

  // Assign positions
  const positions = new Map<string, TreePos>();

  function assign(id: string, xOff: number, depth: number) {
    if (!visibleUserIds.has(id)) return;
    const w = widths.get(id) ?? 1;
    const x = xOff + (w * UNIT - NODE_W) / 2;
    positions.set(id, { x, depth });
    const children = (childMap.get(id) ?? []).filter((c) =>
      visibleUserIds.has(c)
    );
    let cursor = xOff;
    for (const c of children) {
      assign(c, cursor, depth + 1);
      cursor += (widths.get(c) ?? 1) * UNIT;
    }
  }

  // If showing focused view, position current user at top (STRICT mode: only parent + self + direct children)
  const isFocusedView = currentUserId && visibleUserIds.has(currentUserId);

  if (isFocusedView) {
    assign(currentUserId, 0, 0);
    // Parent is positioned above, aligned with current user
    const parentId = parentMap.get(currentUserId);
    if (parentId && visibleUserIds.has(parentId)) {
      const currentUserPos = positions.get(currentUserId);
      if (currentUserPos) {
        positions.set(parentId, { x: currentUserPos.x, depth: -1 });
      }
    }
  } else {
    // Full tree layout - only when NOT in focused mode
    let totalUnits = 0;
    const roots = Array.from(visibleUserIds).filter((n) => !parentMap.has(n));
    for (const root of roots) {
      assign(root, totalUnits * UNIT, 0);
      totalUnits += widths.get(root) ?? 1;
    }
    // Orphans
    for (const u of visibleUserIds) {
      if (!positions.has(u)) {
        const x = totalUnits * UNIT + (UNIT - NODE_W) / 2;
        positions.set(u, { x, depth: 0 });
        totalUnits += 1;
      }
    }
  }

  // Create React Flow nodes (only visible users)
  const flowNodes: Node[] = [];

  // User nodes
  for (const [userId, pos] of positions.entries()) {
    if (!visibleUserIds.has(userId)) continue;
    const user = userMap.get(userId)!;
    flowNodes.push({
      id: userId,
      data: {
        label: user.label || user.id,
        role: user.role ?? "member",
        status: user.isOnline ? "online" : "offline",
      },
      position: {
        x: pos.x,
        y: pos.depth * (NODE_H + V_GAP),
      },
      type: "user",
    });
  }

  // Create edges (only between visible users)
  const flowEdges: Edge[] = [];

  // Hierarchy edges
  for (const [childId, parentId] of parentMap.entries()) {
    if (!visibleUserIds.has(childId) || !visibleUserIds.has(parentId)) continue;
    flowEdges.push({
      id: `hier-${childId}`,
      source: parentId,
      target: childId,
      animated: false,
      style: { stroke: "#64748b", strokeWidth: 2 },
    });
  }

  return { nodes: flowNodes, edges: flowEdges };
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface Props {
  data: GraphData;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  currentUserId?: string; // If provided, show focused view of this user + their parent + direct reports
}

export default function OrgChartFlowView({
  data,
  height,
  onNodeClick,
  currentUserId,
}: Props) {
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => computeLayout(data, currentUserId),
    [data, currentUserId]
  );
  const nodeTypes = useMemo(() => ({ user: UserNode }), []);

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
        <Background color="#64748b" gap={16} />
        <Controls className="react-flow-controls" />
        <MiniMap
          className="react-flow-minimap"
          nodeColor={(node: Node) => {
            const role = node.data?.role;
            if (role === "owner") return "#ca8a04";
            if (role === "admin") return "#2563eb";
            if (role === "manager") return "primary-600";
            if (role === "operator") return "#059669";
            return "#64748b";
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
 `}</style>
    </div>
  );
}
