"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { GraphData, GraphNode } from "@vaultysclaw/shared";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;

interface Props {
  data: GraphData;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
}

// ─── Layout constants ───────────────────────────────────────────────────────
const NODE_W = 192;
const NODE_H = 72;
const H_GAP = 24; // gap between sibling nodes
const V_GAP = 96; // gap between levels
const UNIT = NODE_W + H_GAP;

const AGENT_W = 172;
const AGENT_H = 52;
const AGENT_GAP = 16;
const AGENTS_MARGIN = 80; // extra vertical gap before agents row

// ─── Colour tokens (dark-mode first) ────────────────────────────────────────
const C = {
  userBg: "#0f172a",
  userBorder: "#1e293b",
  userBorderHov: "primary-600",
  avatarBg: "#3730a3",
  avatarText: "#ffffff",
  nameText: "#f1f5f9",
  mutedText: "#64748b",
  agentBg: "#042f1a",
  agentBgOffline: "#0f172a",
  agentBorderOn: "#166534",
  agentBorderOff: "#1e293b",
  agentText: "#6ee7b7",
  agentTextOff: "#64748b",
  edgeLine: "#1e293b",
  edgeHighlight: "#334155",
  grantLine: "#d97706",
  delegLine: "#dc2626",
  onlineDot: "success",
  offlineDot: "#475569",
  realmBadgeBg: "#1e1b4b",
  realmBadgeText: "#818cf8",
  separator: "#1e293b",
};

const ROLE_STYLE: Record<string, { bg: string; text: string; border: string }> =
  {
    owner: { bg: "#451a03", text: "#fbbf24", border: "#92400e" },
    admin: { bg: "#172554", text: "#93c5fd", border: "#1d4ed8" },
    manager: { bg: "#1e1b4b", text: "#a5b4fc", border: "#4338ca" },
    operator: { bg: "#052e16", text: "#6ee7b7", border: "#065f46" },
    member: { bg: "#0f172a", text: "#94a3b8", border: "#334155" },
  };

function roleStyle(role?: string) {
  return ROLE_STYLE[role ?? "member"] ?? ROLE_STYLE.member;
}

// ─── Tree layout ─────────────────────────────────────────────────────────────

interface TreePos {
  x: number;
  depth: number;
}

interface LayoutResult {
  positions: Map<string, TreePos>;
  parentMap: Map<string, string>; // child → parent (user IDs)
  childMap: Map<string, string[]>; // parent → [child]
  userMap: Map<string, GraphNode>;
  agentNodes: GraphNode[];
  agentPositions: Map<string, number>; // agent id → pixel left-edge x
  grantEdges: Array<{
    userId: string;
    agentId: string;
    caps: string[];
    isDelegation: boolean;
  }>;
  totalWidth: number; // pixels
  maxDepth: number;
}

function computeLayout(data: GraphData): LayoutResult {
  const userNodes = data.nodes.filter((n) => n.type === "user");
  const agentNodes = data.nodes.filter((n) => n.type === "agent");
  const userMap = new Map(userNodes.map((n) => [n.id, n]));

  // ── Build hierarchy from reports_to edges ──────────────────────────────
  // edge.source = subordinate (child), edge.target = supervisor (parent)
  const childMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  for (const e of data.edges) {
    if (e.type !== "reports_to") continue;
    const child = e.source,
      parent = e.target;
    if (!userMap.has(child) || !userMap.has(parent)) continue;
    parentMap.set(child, parent);
    if (!childMap.has(parent)) childMap.set(parent, []);
    childMap.get(parent)!.push(child);
  }

  const roots = userNodes.filter((n) => !parentMap.has(n.id));

  // ── Compute subtree leaf-counts ────────────────────────────────────────
  const widths = new Map<string, number>();
  function getWidth(id: string): number {
    if (widths.has(id)) return widths.get(id)!;
    const children = childMap.get(id) ?? [];
    const w =
      children.length === 0 ? 1 : children.reduce((s, c) => s + getWidth(c), 0);
    widths.set(id, w);
    return w;
  }
  userNodes.forEach((n) => getWidth(n.id));

  // ── Assign pixel positions (x = left edge of node) ────────────────────
  const positions = new Map<string, TreePos>();

  function assign(id: string, xOff: number, depth: number) {
    const w = widths.get(id) ?? 1;
    // Centre the node within its allocated space
    const x = xOff + (w * UNIT - NODE_W) / 2;
    positions.set(id, { x, depth });
    const children = childMap.get(id) ?? [];
    let cursor = xOff;
    for (const c of children) {
      assign(c, cursor, depth + 1);
      cursor += (widths.get(c) ?? 1) * UNIT;
    }
  }

  let totalUnits = 0;
  for (const root of roots) {
    assign(root.id, totalUnits * UNIT, 0);
    totalUnits += widths.get(root.id) ?? 1;
  }
  // Orphan users (not reachable from any root)
  for (const u of userNodes) {
    if (!positions.has(u.id)) {
      const x = totalUnits * UNIT + (UNIT - NODE_W) / 2;
      positions.set(u.id, { x, depth: 0 });
      totalUnits += 1;
    }
  }

  const maxDepth = Math.max(
    0,
    ...Array.from(positions.values()).map((p) => p.depth)
  );

  // ── Collect grant + delegation edges ──────────────────────────────────
  const grantEdges: LayoutResult["grantEdges"] = [];
  for (const e of data.edges) {
    if (e.type !== "grant" && e.type !== "delegation") continue;
    const userId = e.source;
    const agentId = e.target;
    if (!positions.has(userId)) continue;
    grantEdges.push({
      userId,
      agentId,
      caps: (e.capabilities ?? []) as string[],
      isDelegation: e.type === "delegation",
    });
  }

  // ── Position agents by centroid of their connected users ──────────────
  const agentUserXs = new Map<string, number[]>();
  for (const ge of grantEdges) {
    const pos = positions.get(ge.userId)!;
    const cx = pos.x + NODE_W / 2;
    if (!agentUserXs.has(ge.agentId)) agentUserXs.set(ge.agentId, []);
    agentUserXs.get(ge.agentId)!.push(cx);
  }

  const agentsSorted = [...agentNodes].sort((a, b) => {
    const ax = agentUserXs.has(a.id)
      ? agentUserXs.get(a.id)!.reduce((s, v) => s + v, 0) /
        agentUserXs.get(a.id)!.length
      : Infinity;
    const bx = agentUserXs.has(b.id)
      ? agentUserXs.get(b.id)!.reduce((s, v) => s + v, 0) /
        agentUserXs.get(b.id)!.length
      : Infinity;
    return ax - bx;
  });

  const agentPositions = new Map<string, number>();
  let agentCursor = 0;
  for (const a of agentsSorted) {
    agentPositions.set(a.id, agentCursor);
    agentCursor += AGENT_W + AGENT_GAP;
  }

  const totalWidth = Math.max(totalUnits * UNIT, agentCursor);

  return {
    positions,
    parentMap,
    childMap,
    userMap,
    agentNodes: agentsSorted,
    agentPositions,
    grantEdges,
    totalWidth,
    maxDepth,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nodeCenter(pos: TreePos) {
  return {
    cx: pos.x + NODE_W / 2,
    cy: pos.depth * (NODE_H + V_GAP) + NODE_H / 2,
  };
}

function nodeBottom(pos: TreePos) {
  return { cx: pos.x + NODE_W / 2, cy: pos.depth * (NODE_H + V_GAP) + NODE_H };
}

function nodeTop(pos: TreePos) {
  return { cx: pos.x + NODE_W / 2, cy: pos.depth * (NODE_H + V_GAP) };
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

// ─── Main component ───────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 6,
  color: "#94a3b8",
  cursor: "pointer",
  fontSize: 16,
  fontFamily: "system-ui",
};

export default function HierarchyView({ data, height, onNodeClick }: Props) {
  const layout = useMemo(() => computeLayout(data), [data]);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const didFit = useRef(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);

  const {
    positions,
    parentMap,
    agentNodes,
    agentPositions,
    grantEdges,
    totalWidth,
    maxDepth,
  } = layout;

  // Which agents are linked to the currently hovered user?
  const hoveredAgentIds = useMemo(() => {
    if (!hovered) return new Set<string>();
    // If an agent is hovered, show that agent
    if (agentPositions.has(hovered)) return new Set([hovered]);
    // If a user is hovered, show its connected agents
    const ids = new Set<string>();
    for (const ge of grantEdges) {
      if (ge.userId === hovered) ids.add(ge.agentId);
    }
    return ids;
  }, [hovered, grantEdges, agentPositions]);

  const showAgents = hoveredAgentIds.size > 0;

  const agentRowY = (maxDepth + 1) * (NODE_H + V_GAP) + AGENTS_MARGIN;
  const svgH =
    agentNodes.length > 0
      ? agentRowY + AGENT_H + 48
      : (maxDepth + 1) * (NODE_H + V_GAP) + 40;
  const svgW = Math.max(totalWidth + H_GAP, 500);

  // Fit to container width once on mount (or when svgW changes after a data reload)
  const svgWRef = useRef(0);
  useEffect(() => {
    if (!containerRef.current) return;
    if (didFit.current && svgWRef.current === svgW) return;
    const cw = containerRef.current.clientWidth;
    if (cw > 0 && svgW > 0) {
      const fit = Math.min(1, (cw - 24) / svgW);
      setZoom(parseFloat(fit.toFixed(3)));
      didFit.current = true;
      svgWRef.current = svgW;
    }
  }, [svgW]);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain scroll → normal scrolling
    e.preventDefault();
    setZoom((z) => clampZoom(parseFloat((z - e.deltaY * 0.005).toFixed(3))));
  }, []);

  const fitZoom = () => {
    if (!containerRef.current || svgW <= 0) return;
    const cw = containerRef.current.clientWidth;
    setZoom(clampZoom(parseFloat(Math.min(1, (cw - 24) / svgW).toFixed(3))));
  };

  if (data.nodes.filter((n) => n.type === "user").length === 0) {
    return (
      <div
        className="flex items-center justify-center text-foreground-500"
        style={{ height }}
      >
        No users to display
      </div>
    );
  }

  // The SVG uses viewBox — we just change its width/height attributes to zoom.
  // This avoids CSS transform and the layout issues that come with it.
  const renderedW = Math.round(svgW * zoom);
  const renderedH = Math.round(svgH * zoom);

  return (
    <div style={{ height, position: "relative" }}>
      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          display: "flex",
          gap: 4,
          alignItems: "center",
        }}
      >
        <button
          title="Zoom out"
          onClick={() =>
            setZoom((z) => clampZoom(parseFloat((z - ZOOM_STEP).toFixed(2))))
          }
          style={btnStyle}
        >
          −
        </button>
        <button title="Fit width" onClick={fitZoom} style={btnStyle}>
          ⊡
        </button>
        <button
          title="Zoom in"
          onClick={() =>
            setZoom((z) => clampZoom(parseFloat((z + ZOOM_STEP).toFixed(2))))
          }
          style={btnStyle}
        >
          +
        </button>
        <span
          style={{
            fontSize: 11,
            color: "#64748b",
            minWidth: 36,
            textAlign: "right",
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Scrollable area */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        style={{ height, overflow: "auto" }}
      >
        {/* Center the SVG horizontally; when it's wider than the container a scrollbar appears */}
        <div style={{ minWidth: "100%", width: renderedW, margin: "0 auto" }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgW} ${svgH}`}
            width={renderedW}
            height={renderedH}
            style={{ display: "block" }}
          >
            <defs>
              {/* Arrowhead markers */}
              <marker
                id="arrow-grant"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L6,3 z" fill={C.grantLine} />
              </marker>
              <marker
                id="arrow-deleg"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L6,3 z" fill={C.delegLine} />
              </marker>
              <marker
                id="arrow-hier"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L6,3 z" fill={C.edgeHighlight} />
              </marker>
            </defs>

            {/* ── Hierarchy edges (supervisor → subordinate) ── */}
            {Array.from(positions.entries()).map(([id, pos]) => {
              const parentId = parentMap.get(id);
              if (!parentId) return null;
              const pPos = positions.get(parentId);
              if (!pPos) return null;
              const from = nodeBottom(pPos);
              const to = nodeTop(pos);
              const midY = (from.cy + to.cy) / 2;
              return (
                <path
                  key={`hier-${id}`}
                  d={`M ${from.cx} ${from.cy} C ${from.cx} ${midY}, ${to.cx} ${midY}, ${to.cx} ${to.cy}`}
                  stroke={
                    hovered === id || hovered === parentId
                      ? C.edgeHighlight
                      : C.edgeLine
                  }
                  strokeWidth={hovered === id || hovered === parentId ? 2 : 1.5}
                  fill="none"
                  markerEnd="url(#arrow-hier)"
                  style={{ transition: "stroke 0.15s, stroke-width 0.15s" }}
                />
              );
            })}

            {/* ── Grant/delegation edges (user → agent) — only when hovered ── */}
            {grantEdges.map((ge, i) => {
              if (!hoveredAgentIds.has(ge.agentId)) return null;
              const uPos = positions.get(ge.userId);
              const aX = agentPositions.get(ge.agentId);
              if (!uPos || aX === undefined) return null;
              const from = nodeBottom(uPos);
              const toX = aX + AGENT_W / 2;
              const toY = agentRowY;
              const midY = (from.cy + toY) / 2;
              const isHov = hovered === ge.userId || hovered === ge.agentId;
              return (
                <path
                  key={`ge-${i}`}
                  d={`M ${from.cx} ${from.cy} C ${from.cx} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
                  stroke={ge.isDelegation ? C.delegLine : C.grantLine}
                  strokeWidth={isHov ? 2 : 1}
                  strokeDasharray={ge.isDelegation ? "5 3" : "7 3"}
                  fill="none"
                  opacity={isHov ? 0.85 : 0.4}
                  markerEnd={
                    ge.isDelegation ? "url(#arrow-deleg)" : "url(#arrow-grant)"
                  }
                  style={{ transition: "opacity 0.15s, stroke-width 0.15s" }}
                />
              );
            })}

            {/* ── Agent row label ── */}
            {agentNodes.length > 0 && showAgents && (
              <text
                x={svgW / 2}
                y={agentRowY - 26}
                textAnchor="middle"
                fill={C.mutedText}
                fontSize="10"
                letterSpacing="2"
                fontFamily="system-ui, sans-serif"
              >
                AGENTS
              </text>
            )}
            {agentNodes.length > 0 && showAgents && (
              <line
                x1={Math.max(0, svgW / 2 - 160)}
                y1={agentRowY - 22}
                x2={Math.min(svgW, svgW / 2 + 160)}
                y2={agentRowY - 22}
                stroke={C.separator}
                strokeWidth="1"
              />
            )}

            {/* ── User nodes ── */}
            {Array.from(positions.entries()).map(([id, pos]) => {
              const node = layout.userMap.get(id);
              if (!node) return null;
              const label = node.label || id.replace("user:", "");
              const role = node.role ?? "member";
              const rs = roleStyle(role);
              const ini = initials(label);
              const isHov = hovered === id;
              const x = pos.x,
                y = pos.depth * (NODE_H + V_GAP);

              // Avatar fill: use a hash of the label for consistent colour
              const avatarHue =
                Array.from(label).reduce((acc, c) => acc + c.charCodeAt(0), 0) %
                360;
              const avatarBg = `hsl(${avatarHue}, 50%, 30%)`;

              return (
                <g
                  key={id}
                  transform={`translate(${x},${y})`}
                  onClick={() => onNodeClick?.(node)}
                  onMouseEnter={() => setHovered(id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Card */}
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx="14"
                    fill={C.userBg}
                    stroke={isHov ? C.userBorderHov : C.userBorder}
                    strokeWidth={isHov ? 2 : 1.5}
                    style={{ transition: "stroke 0.15s" }}
                  />
                  {/* Subtle left accent bar */}
                  <rect
                    x="0"
                    y="14"
                    width="3"
                    height={NODE_H - 28}
                    rx="1.5"
                    fill={rs.border}
                  />

                  {/* Avatar */}
                  <circle cx="42" cy={NODE_H / 2} r="22" fill={avatarBg} />
                  <text
                    x="42"
                    y={NODE_H / 2 + 5}
                    textAnchor="middle"
                    fill="white"
                    fontSize="14"
                    fontWeight="700"
                    fontFamily="system-ui, sans-serif"
                  >
                    {ini}
                  </text>

                  {/* Name */}
                  <text
                    x="74"
                    y={NODE_H / 2 - 7}
                    fill={C.nameText}
                    fontSize="13"
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                  >
                    {truncate(label, 16)}
                  </text>

                  {/* Role badge */}
                  <rect
                    x="74"
                    y={NODE_H / 2 + 5}
                    width={role.length * 7 + 16}
                    height="17"
                    rx="8.5"
                    fill={rs.bg}
                    stroke={rs.border}
                    strokeWidth="0.5"
                  />
                  <text
                    x={74 + (role.length * 7 + 16) / 2}
                    y={NODE_H / 2 + 17}
                    textAnchor="middle"
                    fill={rs.text}
                    fontSize="10"
                    fontWeight="500"
                    fontFamily="system-ui, sans-serif"
                  >
                    {role}
                  </text>
                </g>
              );
            })}

            {/* ── Agent nodes — only visible when related user/agent is hovered ── */}
            {agentNodes.map((node) => {
              if (!hoveredAgentIds.has(node.id)) return null;
              const ax = agentPositions.get(node.id);
              if (ax === undefined) return null;
              const y = agentRowY;
              const label = node.label || node.id.replace("agent:", "");
              const online = node.isOnline;
              const isHov = hovered === node.id;

              return (
                <g
                  key={node.id}
                  transform={`translate(${ax},${y})`}
                  onClick={() => onNodeClick?.(node)}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    width={AGENT_W}
                    height={AGENT_H}
                    rx="10"
                    fill={online ? C.agentBg : C.agentBgOffline}
                    stroke={
                      isHov
                        ? online
                          ? "success"
                          : "#94a3b8"
                        : online
                          ? C.agentBorderOn
                          : C.agentBorderOff
                    }
                    strokeWidth={isHov ? 2 : 1.5}
                    style={{ transition: "stroke 0.15s" }}
                  />
                  {/* Icon placeholder — small bot rect */}
                  <rect
                    x="10"
                    y={AGENT_H / 2 - 13}
                    width="26"
                    height="26"
                    rx="7"
                    fill={online ? "#052e16" : "#0f172a"}
                  />
                  {/* Bot eyes */}
                  <circle
                    cx="20"
                    cy={AGENT_H / 2 - 1}
                    r="2.5"
                    fill={online ? "#6ee7b7" : "#475569"}
                  />
                  <circle
                    cx="27"
                    cy={AGENT_H / 2 - 1}
                    r="2.5"
                    fill={online ? "#6ee7b7" : "#475569"}
                  />
                  <rect
                    x="16"
                    y={AGENT_H / 2 + 4}
                    width="15"
                    height="2"
                    rx="1"
                    fill={online ? "#6ee7b7" : "#475569"}
                  />

                  {/* Name */}
                  <text
                    x="46"
                    y={AGENT_H / 2 + 5}
                    fill={online ? C.agentText : C.agentTextOff}
                    fontSize="12"
                    fontWeight="500"
                    fontFamily="system-ui, sans-serif"
                  >
                    {truncate(label, 14)}
                  </text>

                  {/* Online dot */}
                  <circle
                    cx={AGENT_W - 12}
                    cy={AGENT_H / 2}
                    r="5"
                    fill={online ? C.onlineDot : C.offlineDot}
                  />
                </g>
              );
            })}

            {/* ── Legend ── */}
            <LegendSVG x={12} y={12} />
          </svg>
        </div>
      </div>
    </div>
  );
}

function LegendSVG({ x, y }: { x: number; y: number }) {
  const items = [
    { color: C.edgeHighlight, label: "Reports to", dash: "" },
    { color: C.grantLine, label: "Grant", dash: "7 3" },
    { color: C.delegLine, label: "Delegation", dash: "5 3" },
  ];
  return (
    <g transform={`translate(${x},${y})`}>
      <rect
        width="110"
        height={items.length * 18 + 12}
        rx="8"
        fill="#0f172a"
        stroke="#1e293b"
        strokeWidth="1"
        opacity="0.9"
      />
      {items.map((item, i) => (
        <g key={item.label} transform={`translate(10, ${14 + i * 18})`}>
          <line
            x1="0"
            y1="0"
            x2="20"
            y2="0"
            stroke={item.color}
            strokeWidth="2"
            strokeDasharray={item.dash || undefined}
          />
          <text
            x="26"
            y="4"
            fill="#94a3b8"
            fontSize="10"
            fontFamily="system-ui, sans-serif"
          >
            {item.label}
          </text>
        </g>
      ))}
    </g>
  );
}
