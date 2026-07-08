"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { GraphData, GraphNode } from "@vaultysclaw/shared";
import {
  userApi,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";

// All views are code-split to avoid loading Three.js everywhere
const Force3DView = dynamic(() => import("./views/Force3DView"), {
  ssr: false,
});
const OrgChartFlowView = dynamic(() => import("./views/OrgChartFlowView"), {
  ssr: false,
});
const MatrixView = dynamic(() => import("./views/MatrixView"), { ssr: false });

export type GraphViewMode = "force3d" | "org-chart" | "matrix";

interface Props {
  /** API query string, e.g. "?workspace=abc" or "?agent=did:…" or empty for full graph */
  query?: string;
  /** Fixed height in px (defaults to 600) */
  height?: number;
  /** Called when a node is clicked */
  onNodeClick?: (node: GraphNode) => void;
  /** Optionally pin the view mode (no switcher shown) */
  defaultView?: GraphViewMode;
  /** Hide the view switcher */
  hideViewSwitcher?: boolean;
  /** If provided, show focused view in org-chart mode for this user */
  currentUserId?: string;
  /** Controlled view mode — when set, the parent owns view state (e.g. toolbar tabs) */
  view?: GraphViewMode;
  /** Called when the view mode changes (from the built-in switcher) */
  onViewChange?: (view: GraphViewMode) => void;
  /** Called after the graph data loads, with node/edge counts */
  onStats?: (stats: { nodes: number; edges: number }) => void;
}

export const VIEW_OPTIONS: {
  id: GraphViewMode;
  label: string;
  icon: React.ReactNode;
  tip: string;
}[] = [
  {
    id: "force3d",
    label: "3D Force",
    tip: "Interactive 3D force-directed graph — drag & rotate",
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <circle cx="10" cy="10" r="2.5" />
        <circle cx="3.5" cy="5" r="1.8" />
        <circle cx="16.5" cy="5" r="1.8" />
        <circle cx="3.5" cy="15" r="1.8" />
        <circle cx="16.5" cy="15" r="1.8" />
        <line x1="7.5" y1="9" x2="5" y2="6.5" />
        <line x1="12.5" y1="9" x2="15" y2="6.5" />
        <line x1="7.5" y1="11" x2="5" y2="13.5" />
        <line x1="12.5" y1="11" x2="15" y2="13.5" />
      </svg>
    ),
  },
  {
    id: "org-chart",
    label: "Org Chart (Flow)",
    tip: "Interactive org chart with React Flow — drag nodes, pan, zoom",
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <rect x="6.5" y="1" width="7" height="4" rx="1" />
        <rect x="1" y="10" width="6" height="4" rx="1" />
        <rect x="6.5" y="10" width="7" height="4" rx="1" />
        <rect x="13" y="10" width="6" height="4" rx="1" />
        <line x1="10" y1="5" x2="10" y2="7" />
        <line x1="10" y1="7" x2="4" y2="7" />
        <line x1="4" y1="7" x2="4" y2="10" />
        <line x1="10" y1="7" x2="10" y2="10" />
        <line x1="10" y1="7" x2="16" y2="7" />
        <line x1="16" y1="7" x2="16" y2="10" />
      </svg>
    ),
  },
  {
    id: "matrix",
    label: "Matrix",
    tip: "Users × agents access matrix — shows who has what capabilities",
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <rect x="1" y="1" width="18" height="18" rx="2" />
        <line x1="7" y1="1" x2="7" y2="19" />
        <line x1="13" y1="1" x2="13" y2="19" />
        <line x1="1" y1="7" x2="19" y2="7" />
        <line x1="1" y1="13" x2="19" y2="13" />
        <circle cx="4" cy="10" r="1.2" fill="currentColor" />
        <circle cx="10" cy="4" r="1.2" fill="currentColor" />
        <circle cx="16" cy="16" r="1.2" fill="currentColor" />
        <circle cx="10" cy="16" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
];

export default function WorkspaceGraph({
  query = "",
  height = 600,
  onNodeClick,
  defaultView = "force3d",
  hideViewSwitcher = false,
  currentUserId,
  view: controlledView,
  onViewChange,
  onStats,
}: Props) {
  const [internalView, setInternalView] = useState<GraphViewMode>(defaultView);
  const view = controlledView ?? internalView;
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function changeView(next: GraphViewMode) {
    onViewChange?.(next);
    if (controlledView === undefined) setInternalView(next);
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Parse the legacy query-string prop (e.g. "?workspace=abc") into typed params.
    const sp = new URLSearchParams(query.replace(/^\?/, ""));
    userApi.graph
      .get({
        query: {
          agent: sp.get("agent") ?? undefined,
          user: sp.get("user") ?? undefined,
          workspace: sp.get("workspace") ?? undefined,
        },
      })
      .then((res) => {
        const d = unwrap(res);
        setData(d);
        onStats?.({ nodes: d.nodes.length, edges: d.edges.length });
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load graph")
      )
      .finally(() => setLoading(false));
  }, [query, onStats]);

  // Derived content height (subtract switcher bar if shown)
  const switcherH = hideViewSwitcher ? 0 : 44;
  const contentH = height - switcherH;

  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-neutral-200"
        style={{ height }}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-neutral-200 text-danger-600"
        style={{ height }}
      >
        Failed to load graph: {error}
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-neutral-200 text-foreground-500"
        style={{ height }}
      >
        No data to display
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-neutral-200 overflow-hidden bg-background-100"
      style={{ height }}
    >
      {/* ── View switcher ── */}
      {!hideViewSwitcher && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-neutral-200 bg-background-100">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => changeView(opt.id)}
              title={opt.tip}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                view === opt.id
                  ? "bg-primary-100 text-primary-700 border border-primary-200"
                  : "text-foreground-500 hover:text-foreground hover:bg-background-200 border border-transparent"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Active view ── */}
      <div style={{ height: contentH }}>
        {view === "force3d" && (
          <Force3DView
            data={data}
            height={contentH}
            onNodeClick={onNodeClick}
          />
        )}
        {view === "org-chart" && (
          <OrgChartFlowView
            data={data}
            height={contentH}
            onNodeClick={onNodeClick}
            currentUserId={currentUserId}
          />
        )}
        {view === "matrix" && (
          <MatrixView data={data} height={contentH} onNodeClick={onNodeClick} />
        )}
      </div>
    </div>
  );
}
