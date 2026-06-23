"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Maximize2, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { GraphNode } from "@vaultysclaw/shared";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { VIEW_OPTIONS, type GraphViewMode } from "./RealmGraph";

const RealmGraph = dynamic(() => import("./RealmGraph"), { ssr: false });

/**
 * The full-page relationship graph explorer. Owns view + fullscreen state and
 * drives the shared toolbar (view switcher + fullscreen) so the page itself
 * renders no header of its own.
 */
export function GraphExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const viewParam = searchParams.get("view") as GraphViewMode | null;
  const [view, setView] = useState<GraphViewMode>(viewParam ?? "org-chart");
  const [fullscreen, setFullscreen] = useState(false);
  const [winH, setWinH] = useState(720);
  const [stats, setStats] = useState<{ nodes: number; edges: number } | null>(
    null
  );

  useEffect(() => {
    const update = () => setWinH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Build the API query string from every param except 'view'.
  const queryParams = new URLSearchParams(searchParams);
  queryParams.delete("view");
  const graphQuery = queryParams.toString() ? `?${queryParams.toString()}` : "";

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.type === "agent")
        router.push(
          `/agents/${encodeURIComponent(node.id.replace("agent:", ""))}`
        );
      else if (node.type === "user")
        router.push(
          `/users/${encodeURIComponent(node.id.replace("user:", ""))}`
        );
      else if (node.type === "realm")
        router.push(`/realms/${node.id.replace("realm:", "")}`);
    },
    [router]
  );

  useBreadcrumbs([{ label: "Graph" }], []);

  useToolbar(
    {
      title: "Relationship Graph",
      description: stats
        ? `${stats.nodes} node${stats.nodes !== 1 ? "s" : ""} · ${stats.edges} edge${stats.edges !== 1 ? "s" : ""}`
        : "Users, agents and realms — and how they connect",
      actions: [
        {
          kind: "tabs" as const,
          id: "view",
          value: view,
          onChange: (v) => setView(v as GraphViewMode),
          options: VIEW_OPTIONS.map((o) => ({
            value: o.id,
            label: o.label,
            icon: o.icon,
          })),
        },
        {
          kind: "button" as const,
          id: "fullscreen",
          label: "Fullscreen",
          variant: "default" as const,
          icon: <Maximize2 className="w-3.5 h-3.5" />,
          onClick: () => setFullscreen(true),
        },
      ],
    },
    [stats, view]
  );

  const graphHeight = fullscreen ? winH - 80 : 720;

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-end px-4 pt-4 shrink-0">
          <button
            onClick={() => setFullscreen(false)}
            className="p-2 rounded-lg hover:bg-background-200 transition-colors text-foreground-500 hover:text-foreground"
            title="Exit fullscreen"
          >
            <Minimize2 size={18} />
          </button>
        </div>
        <div className="px-4 pb-4 flex-1 min-h-0">
          <RealmGraph
            query={graphQuery}
            height={graphHeight}
            view={view}
            onViewChange={setView}
            onStats={setStats}
            onNodeClick={handleNodeClick}
          />
        </div>
      </div>
    );
  }

  return (
    <RealmGraph
      query={graphQuery}
      height={graphHeight}
      view={view}
      onViewChange={setView}
      hideViewSwitcher
      onStats={setStats}
      onNodeClick={handleNodeClick}
    />
  );
}
