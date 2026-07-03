"use client";

import { useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { GraphData, GraphNode } from "@vaultysclaw/shared";
import { Maximize2 } from "lucide-react";
import Link from "next/link";

// Dynamic import to avoid loading React Flow on every page
const OrgChartFlowView = dynamic(() => import("./views/OrgChartFlowView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-foreground-500">
      Loading org chart...
    </div>
  ),
});

interface Props {
  /** API query string for fetching graph data, e.g. "?workspace=abc" */
  query?: string;
  /** Height in px (defaults to 500) */
  height?: number;
  /** Show a fullscreen button */
  showFullscreenBtn?: boolean;
  /** If provided, show focused view of this user + their parent + direct reports */
  currentUserId?: string;
  /** Called when a node is clicked */
  onNodeClick?: (node: GraphNode) => void;
}

/**
 * Embedded Org Chart component that can be placed in workspace detail pages, user profiles, etc.
 * Automatically fetches GraphData from the API and renders an interactive org chart using React Flow.
 */
export default function EmbeddedOrgChart({
  query = "",
  height = 500,
  showFullscreenBtn = true,
  currentUserId,
  onNodeClick,
}: Props) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/graph${query}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: GraphData) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-neutral-200 bg-background-100"
        style={{ height }}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-neutral-200 bg-background-100 text-danger-600"
        style={{ height }}
      >
        Failed to load org chart: {error}
      </div>
    );
  }

  if (!data || data.nodes.filter((n) => n.type === "user").length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-neutral-200 bg-background-100 text-foreground-500"
        style={{ height }}
      >
        No users to display
      </div>
    );
  }

  // Build fullscreen URL with query params preserved
  const fullscreenUrl = `/admin/graph${query}${query ? "&" : "?"}view=org-chart`;

  return (
    <div
      className="relative rounded-xl border border-neutral-200 overflow-hidden bg-background-100"
      style={{ height }}
    >
      {showFullscreenBtn && (
        <Link
          href={fullscreenUrl}
          className="absolute top-3 right-3 z-10 p-2 rounded-lg hover:bg-background-200 transition-colors text-foreground-500 hover:text-foreground"
          title="Open in fullscreen"
        >
          <Maximize2 size={18} />
        </Link>
      )}
      <OrgChartFlowView
        data={data}
        height={height}
        onNodeClick={onNodeClick}
        currentUserId={currentUserId}
      />
    </div>
  );
}
