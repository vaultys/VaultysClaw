"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type {
  GraphData,
  GraphNode,
  GraphNodeType,
  GraphEdgeType,
} from "@vaultysclaw/shared";

// react-force-graph-3d doesn't ship ESM — dynamic import avoids SSR crash
let ForceGraph3DModule: any = null;
let THREE: any = null;

interface Props {
  data: GraphData;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
}

const NODE_COLORS: Record<GraphNodeType, string> = {
  workspace: "primary",
  user: "primary",
  agent: "success",
};

const EDGE_COLORS: Record<GraphEdgeType, string> = {
  workspace_member: "#94a3b8",
  grant: "warning",
  reports_to: "#a855f7",
  delegation: "danger",
  peer: "#06b6d4",
};

const NODE_SIZES: Record<GraphNodeType, number> = {
  workspace: 16,
  user: 8,
  agent: 8,
};

const ICON_PATHS: Record<GraphNodeType, { paths: string[]; viewBox: string }> =
  {
    workspace: {
      viewBox: "0 0 24 24",
      paths: [
        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
        "M2 12h20",
        "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
      ],
    },
    user: {
      viewBox: "0 0 24 24",
      paths: [
        "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
        "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
      ],
    },
    agent: {
      viewBox: "0 0 24 24",
      paths: [
        "M12 8V4H8",
        "M2 12h2",
        "M20 12h2",
        "M6 8h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8z",
        "M9.5 14a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z",
        "M14.5 14a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z",
      ],
    },
  };

const textureCache = new Map<string, any>();

function makeIconTexture(
  type: GraphNodeType,
  color: string,
  isOffline = false
): any {
  const key = `${type}:${color}:${isOffline}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const size = type === "workspace" ? 128 : 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2,
    cy = size / 2,
    r = size / 2 - 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = isOffline ? "#334155" : color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = isOffline ? "#475569" : lighten(color, -20);
  ctx.stroke();

  const icon = ICON_PATHS[type];
  const iconSize = size * 0.5;
  const offset = (size - iconSize) / 2;
  const scale = iconSize / 24;
  ctx.save();
  ctx.translate(offset, offset);
  ctx.scale(scale, scale);
  ctx.strokeStyle = isOffline ? "#94a3b8" : "#ffffff";
  ctx.fillStyle = "transparent";
  ctx.lineWidth = 2 / scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of icon.paths) ctx.stroke(new Path2D(d));
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function Force3DView({ data, height, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [ForceGraph3D, setForceGraph3D] = useState<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    if (ForceGraph3DModule && THREE) {
      setForceGraph3D(() => ForceGraph3DModule);
      return;
    }
    Promise.all([import("react-force-graph-3d"), import("three")]).then(
      ([fgMod, threeMod]) => {
        ForceGraph3DModule = fgMod.default;
        THREE = threeMod;
        setForceGraph3D(() => fgMod.default);
      }
    );
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries)
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(entry.contentRect.height, height),
        });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [height]);

  const fgData = useMemo(
    () => ({
      nodes: data.nodes
        .filter((n) => n.type !== "workspace")
        .map((n) => ({
          ...n,
          val: NODE_SIZES[n.type],
          _color: NODE_COLORS[n.type],
        })),
      links: data.edges
        .filter((e) => e.type !== "workspace_member")
        .map((e, i) => ({
          ...e,
          id: `edge-${i}`,
          _color: EDGE_COLORS[e.type],
        })),
    }),
    [data]
  );

  const handleNodeClick = useCallback(
    (node: any) => {
      const distance = 60;
      const distRatio =
        1 + distance / Math.hypot(node.x ?? 0, node.y ?? 0, node.z ?? 0);
      if (graphRef.current)
        graphRef.current.cameraPosition(
          {
            x: (node.x ?? 0) * distRatio,
            y: (node.y ?? 0) * distRatio,
            z: (node.z ?? 0) * distRatio,
          },
          node,
          1000
        );
      onNodeClick?.(node as GraphNode);
    },
    [onNodeClick]
  );

  if (!ForceGraph3D) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      {/* Legend */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 bg-background-100/80 backdrop-blur rounded-lg p-3 text-xs">
        <LegendItem color={NODE_COLORS.user} label="User" icon={<IconUser />} />
        <LegendItem
          color={NODE_COLORS.agent}
          label="Agent"
          icon={<IconBot />}
        />
        <hr className="border-neutral-200 my-1" />
        <LegendItem color={EDGE_COLORS.grant} label="Grant" shape="line" />
        <LegendItem
          color={EDGE_COLORS.delegation}
          label="Delegation"
          shape="line"
        />
        <LegendItem color={EDGE_COLORS.peer} label="Peer link" shape="line" />
        <LegendItem
          color={EDGE_COLORS.reports_to}
          label="Reports to"
          shape="line"
        />
      </div>

      <ForceGraph3D
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={fgData}
        backgroundColor="rgba(0,0,0,0)"
        nodeLabel={(n: any) =>
          `<div style="padding:4px 8px;background:#1e293b;border-radius:6px;color:#e2e8f0;font-size:12px"><b>${n.label}</b><br/><span style="opacity:0.7">${n.type}${n.role ? ` · ${n.role}` : ""}${n.isOnline !== undefined ? (n.isOnline ? " · online" : " · offline") : ""}</span></div>`
        }
        nodeThreeObject={(n: any) => {
          const color = n.isOnline === false ? "#64748b" : n._color;
          const texture = makeIconTexture(n.type, color, n.isOnline === false);
          const size = NODE_SIZES[n.type as GraphNodeType];
          const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
          });
          const sprite = new THREE.Sprite(material);
          sprite.scale.set(size, size, 1);
          return sprite;
        }}
        nodeThreeObjectExtend={false}
        linkColor={(l: any) => l._color}
        linkWidth={(l: any) =>
          l.type === "grant" || l.type === "delegation"
            ? 2
            : l.type === "peer"
              ? 2.5
              : 1
        }
        linkVisibility={(l: any) => {
          if (l.type !== "peer") return true;
          if (!hoveredNode) return false;
          return (
            l.source?.id === hoveredNode ||
            l.target?.id === hoveredNode ||
            l.source === hoveredNode ||
            l.target === hoveredNode
          );
        }}
        linkOpacity={0.6}
        linkDirectionalParticles={(l: any) =>
          l.type === "delegation"
            ? 3
            : l.type === "grant"
              ? 2
              : l.type === "peer"
                ? 4
                : 0
        }
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleColor={(l: any) => l._color}
        linkLabel={(l: any) =>
          l.label
            ? `<span style="padding:2px 6px;background:#1e293b;border-radius:4px;color:#e2e8f0;font-size:11px">${l.type}: ${l.label}</span>`
            : ""
        }
        onNodeClick={handleNodeClick}
        onNodeHover={(node: any) => setHoveredNode(node?.id ?? null)}
        enableNodeDrag
        enableNavigationControls
        showNavInfo={false}
      />
    </div>
  );
}

function LegendItem({
  color,
  label,
  shape,
  icon,
}: {
  color: string;
  label: string;
  shape?: "circle" | "line";
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon ? (
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full"
          style={{ backgroundColor: color }}
        >
          {icon}
        </span>
      ) : shape === "line" ? (
        <span
          className="inline-block w-4 h-0.5"
          style={{ backgroundColor: color }}
        />
      ) : (
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="text-foreground-500">{label}</span>
    </div>
  );
}

function IconUser() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconBot() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8V4H8" />
      <rect x="6" y="8" width="12" height="12" rx="2" />
      <circle cx="9.5" cy="13.5" r=".5" fill="white" />
      <circle cx="14.5" cy="13.5" r=".5" fill="white" />
    </svg>
  );
}
