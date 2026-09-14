"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { GraphLegend } from "./GraphLegend";
import { GraphTooltip } from "./GraphTooltip";
import { useActorForceGraph } from "./useActorForceGraph";
import type { ActorGraphProps } from "./types";

/** Whether this browser can actually render the scene. Checked before the engine is constructed, so
 *  a machine with WebGL disabled gets a useful panel instead of a blank box. */
function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

const BTN =
  "p-1.5 bg-background-100 border border-neutral-200 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors";

export function GraphInner({
  data,
  height = 600,
  className,
  focusDid,
  search = "",
  colorBy = "kind",
  onNodeNavigate,
}: ActorGraphProps) {
  const { resolvedTheme } = useTheme();
  const [webgl] = useState(hasWebGL);

  const { containerRef, tooltip, setTooltip, zoomIn, zoomOut, resetView, paused, togglePause } =
    useActorForceGraph({
      data,
      focusDid,
      search,
      colorBy,
      theme: resolvedTheme ?? "light",
      onNodeNavigate,
    });

  const summary = useMemo(() => {
    const actors = data.nodes.filter((n) => n.nodeKind === "actor").length;
    const workspaces = data.nodes.length - actors;
    return `Relationship graph: ${actors} actors, ${data.links.length} relationships, ${workspaces} workspaces`;
  }, [data]);

  if (!webgl) {
    return (
      <div
        className={`border border-dashed border-neutral-300 rounded-xl p-10 text-center ${className ?? ""}`}
      >
        <h2 className="text-sm font-semibold text-foreground mb-1">3D graph unavailable</h2>
        <p className="text-sm text-foreground-500">
          This browser has no WebGL context, so the graph can&apos;t be drawn. {summary}.
        </p>
        <Link
          href="/admin/actors"
          className="mt-3 inline-block text-sm font-medium text-primary-600 hover:text-primary-500"
        >
          Browse actors as a list →
        </Link>
      </div>
    );
  }

  return (
    <div className={`relative select-none ${className ?? ""}`} style={{ height }}>
      <div
        ref={containerRef}
        role="img"
        aria-label={summary}
        className="w-full h-full rounded-xl overflow-hidden"
      />

      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button onClick={zoomOut} className={BTN} title="Zoom out" aria-label="Zoom out">
          <Minus size={14} />
        </button>
        <button onClick={zoomIn} className={BTN} title="Zoom in" aria-label="Zoom in">
          <Plus size={14} />
        </button>
        <button onClick={resetView} className={BTN} title="Reset view" aria-label="Reset view">
          <RotateCcw size={14} />
        </button>
        <button
          onClick={togglePause}
          className={BTN}
          title={paused ? "Resume layout" : "Pause layout"}
          aria-label={paused ? "Resume layout" : "Pause layout"}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>

      <div className="absolute bottom-2 left-3 z-10 pointer-events-none">
        <GraphLegend colorBy={colorBy} />
      </div>

      {tooltip && <GraphTooltip tooltip={tooltip} onClose={() => setTooltip(null)} />}
    </div>
  );
}
