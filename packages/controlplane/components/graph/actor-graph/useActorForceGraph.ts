"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConfigOptions, ForceGraph3DInstance } from "3d-force-graph";
import { readPalette, type GraphPalette } from "./colors";
import {
  HEAVY_GRAPH_THRESHOLD,
  type ActorGraphData,
  type ActorGraphEdgeKind,
  type ActorGraphLink,
  type ActorGraphNode,
} from "./types";

/** What the engine actually holds: our node, plus the position/velocity fields it maintains. */
type SimNode = ActorGraphNode & { x?: number; y?: number; z?: number };
type SimLink = Omit<ActorGraphLink, "source" | "target"> & {
  source: string | SimNode;
  target: string | SimNode;
};

export interface GraphTooltipState {
  node: ActorGraphNode;
  x: number;
  y: number;
}

/** The engine replaces a link's string endpoints with node references as soon as it ingests the
 *  data, so anything reading an endpoint afterwards has to cope with both shapes. */
function endpointId(value: string | SimNode | undefined): string {
  return typeof value === "string" ? value : String(value?.id ?? "");
}

function matchesSearch(node: ActorGraphNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return node.label.toLowerCase().includes(q) || node.id.toLowerCase().includes(q);
}

/**
 * Owns the 3d-force-graph instance: construction, incremental data sync, theme, resize, and the
 * interaction state the React tree renders around it. Same division of labour as
 * `components/map/world-map/useOlMap.ts` — the view component stays declarative, every imperative
 * call lives here.
 */
export function useActorForceGraph({
  data,
  focusDid,
  search = "",
  colorBy = "kind",
  theme,
  onNodeNavigate,
}: {
  data: ActorGraphData;
  focusDid?: string;
  search?: string;
  colorBy?: "kind" | "workspace";
  /** `resolvedTheme` from `components/ThemeProvider` — only used to know *when* to re-read the
   *  tokens; the values themselves come from the CSS variables, which the theme already swaps. */
  theme: string;
  onNodeNavigate?: (node: ActorGraphNode) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph3DInstance<SimNode, SimLink> | null>(null);
  /** Node objects by id, kept across data changes so `x/y/z/vx/vy/vz` survive a re-filter. Without
   *  this, unchecking a kind restarts the simulation from scratch and the camera ends up nowhere. */
  const nodesRef = useRef(new Map<string, SimNode>());
  const paletteRef = useRef<GraphPalette>(readPalette(colorBy));
  const matchedRef = useRef(new Set<string>());
  const pointerRef = useRef({ x: 0, y: 0 });
  const onNavigateRef = useRef(onNodeNavigate);
  const heavyRef = useRef(false);
  const hasFramedRef = useRef(false);

  /** Latest props for the async init below, which can resolve after any number of re-renders. */
  const dataRef = useRef(data);
  const focusRef = useRef(focusDid);
  dataRef.current = data;
  focusRef.current = focusDid;

  const [tooltip, setTooltip] = useState<GraphTooltipState | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    onNavigateRef.current = onNodeNavigate;
  }, [onNodeNavigate]);

  // ── Initialize ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let graph: ForceGraph3DInstance<SimNode, SimLink> | null = null;

    // Dynamically imported inside the effect rather than at module scope: this module is only ever
    // reached through `dynamic(..., { ssr: false })`, but an await here also keeps three.js off the
    // critical path of the first paint.
    void import("3d-force-graph").then(({ default: ForceGraph3D }) => {
      if (disposed || !containerRef.current) return;

      // The package exports the constructor as a non-generic `const`, so the node/link types can
      // only be bound by re-typing it here — `new ForceGraph3D<SimNode, SimLink>(...)` does not
      // compile against its own declaration.
      const Ctor = ForceGraph3D as unknown as new (
        element: HTMLElement,
        options?: ConfigOptions
      ) => ForceGraph3DInstance<SimNode, SimLink>;

      const instance = new Ctor(containerRef.current, {
        controlType: "orbit",
        rendererConfig: { antialias: true, alpha: false },
      });
      instance
        .backgroundColor(paletteRef.current.background)
        .showNavInfo(false)
        // The library's built-in tooltip sets `innerHTML` from this accessor, and both `Actor.name`
        // and `ActorLink.label` are operator-entered text. Disabled outright; hover is rendered by
        // `GraphTooltip.tsx`, where React escapes it.
        .nodeLabel(() => "")
        .linkLabel(() => "")
        .nodeRelSize(4)
        // The ego view's centre is drawn larger so it stays findable once the layout has moved it
        // off the middle of the screen.
        .nodeVal((node) => (node.id === focusRef.current ? 10 : 1 + Math.min(node.degree, 12)))
        .nodeColor((node) => {
          if (matchedRef.current.size > 0) {
            return matchedRef.current.has(node.id) ? paletteRef.current.highlight : paletteRef.current.dim;
          }
          return paletteRef.current.node(node);
        })
        .nodeOpacity(0.92)
        .linkColor((link) => paletteRef.current.edge(link.edgeKind as ActorGraphEdgeKind))
        .linkWidth((link) => (link.edgeKind === "workspace" ? 0.4 : 1))
        .linkOpacity(0.8)
        // Ownership and free-form links are directed; workspace membership is not.
        .linkDirectionalArrowLength((link) => (link.edgeKind === "workspace" ? 0 : 3))
        .linkDirectionalArrowRelPos(1)
        .onNodeHover((node) => {
          setTooltip(node ? { node, x: pointerRef.current.x, y: pointerRef.current.y } : null);
        })
        .onNodeClick((node) => onNavigateRef.current?.(node))
        .onBackgroundClick(() => setTooltip(null));

      graph = instance;
      graphRef.current = instance;
      applyTuning(instance, dataRef.current.nodes.length);
      syncSize(instance, containerRef.current);
      // The data effect below has already run by the time this promise resolves, so the initial
      // load is pushed here rather than waited for.
      pushData(instance, nodesRef, dataRef.current);
      frameOnce(instance, hasFramedRef);
    });

    return () => {
      disposed = true;
      // `reactStrictMode` runs this effect twice in dev. Without a real teardown that leaves two
      // canvases stacked in the container and two live WebGL contexts — and a browser silently
      // kills the oldest context once a page holds too many.
      graph?._destructor();
      graphRef.current = null;
      nodesRef.current.clear();
      hasFramedRef.current = false;
      container.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data sync ──
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    applyTuning(graph, data.nodes.length);
    pushData(graph, nodesRef, data);
    frameOnce(graph, hasFramedRef);
  }, [data]);

  // ── Theme ──
  // Setters only — re-reading the tokens must never rebuild the instance, or switching theme would
  // reset every node position and the camera along with them.
  useEffect(() => {
    paletteRef.current = readPalette(colorBy);
    const graph = graphRef.current;
    if (!graph) return;
    graph.backgroundColor(paletteRef.current.background);
    graph.nodeColor(graph.nodeColor());
    graph.linkColor(graph.linkColor());
  }, [theme, colorBy]);

  // ── Search highlight ──
  useEffect(() => {
    matchedRef.current = new Set(
      search.trim() ? data.nodes.filter((n) => matchesSearch(n, search)).map((n) => n.id) : []
    );
    const graph = graphRef.current;
    if (!graph) return;
    graph.nodeColor(graph.nodeColor()); // re-evaluate the accessor against the new match set

    const first = data.nodes.find((n) => matchedRef.current.has(n.id)) as SimNode | undefined;
    const live = first ? nodesRef.current.get(first.id) : undefined;
    if (live?.x !== undefined) lookAt(graph, live, 600);
  }, [search, data]);

  // ── Resize ──
  // The library listens on `window.resize`, which never fires when the sidebar collapses — the
  // container changes size and the window does not.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (graphRef.current) syncSize(graphRef.current, container);
      });
    });
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // ── Pointer tracking ──
  // `onNodeHover` reports which node, never where the pointer is, and the tooltip needs both.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    container.addEventListener("pointermove", onMove);
    return () => container.removeEventListener("pointermove", onMove);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const graph = graphRef.current;
    if (!graph) return;
    const { x, y, z } = graph.cameraPosition();
    graph.cameraPosition({ x: x * factor, y: y * factor, z: z * factor }, undefined, 250);
  }, []);

  const zoomIn = useCallback(() => zoomBy(0.75), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1.35), [zoomBy]);
  const resetView = useCallback(() => graphRef.current?.zoomToFit(500, 60), []);
  const togglePause = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    setPaused((was) => {
      if (was) graph.resumeAnimation();
      else graph.pauseAnimation();
      return !was;
    });
  }, []);

  return { containerRef, tooltip, setTooltip, zoomIn, zoomOut, resetView, paused, togglePause };
}

/**
 * Hand the engine the new data while keeping the node objects it already knows.
 *
 * Reusing a node object preserves its simulated position; links are always fresh clones because the
 * engine rewrites their endpoints into object references, and re-feeding an already-rewritten link
 * makes it resolve endpoints against stale nodes.
 */
function pushData(
  graph: ForceGraph3DInstance<SimNode, SimLink>,
  nodesRef: { current: Map<string, SimNode> },
  data: ActorGraphData
) {
  const existing = nodesRef.current;
  const nodes = data.nodes.map((node) => {
    const prev = existing.get(node.id);
    if (prev) {
      Object.assign(prev, node); // never carries x/y/z — those exist only on the engine's copy
      return prev;
    }
    const fresh: SimNode = { ...node };
    existing.set(node.id, fresh);
    return fresh;
  });
  for (const id of [...existing.keys()]) {
    if (!data.nodes.some((n) => n.id === id)) existing.delete(id);
  }

  const links: SimLink[] = data.links.map((link) => ({
    ...link,
    source: endpointId(link.source as string | SimNode),
    target: endpointId(link.target as string | SimNode),
  }));

  graph.graphData({ nodes, links });
}

/** Cheaper geometry and a shorter simulation once the graph is big enough that the default
 *  settings stop being interactive. */
function applyTuning(graph: ForceGraph3DInstance<SimNode, SimLink>, nodeCount: number) {
  const heavy = nodeCount > HEAVY_GRAPH_THRESHOLD;
  graph
    .nodeResolution(heavy ? 6 : 12)
    .warmupTicks(heavy ? 40 : 0)
    .cooldownTicks(heavy ? 200 : Infinity)
    .enableNodeDrag(!heavy);
}

function syncSize(graph: ForceGraph3DInstance<SimNode, SimLink>, container: HTMLElement) {
  const { width, height } = container.getBoundingClientRect();
  if (width > 0 && height > 0) graph.width(width).height(height);
}

/**
 * Frame the graph once, when nodes first arrive.
 *
 * Exactly once, not on every data change: re-fitting when a filter is toggled would yank the view
 * back the moment anybody explored it. Deferred so the layout has spread out first — fitting at
 * tick zero frames the phyllotaxis seed positions rather than the graph.
 */
function frameOnce(
  graph: ForceGraph3DInstance<SimNode, SimLink>,
  hasFramedRef: { current: boolean }
) {
  if (hasFramedRef.current || graph.graphData().nodes.length === 0) return;
  hasFramedRef.current = true;
  setTimeout(() => graph.zoomToFit(600, 60), 900);
}

function lookAt(graph: ForceGraph3DInstance<SimNode, SimLink>, node: SimNode, ms: number) {
  const distance = 140;
  const { x = 0, y = 0, z = 0 } = node;
  const ratio = 1 + distance / Math.hypot(x, y, z || 1);
  graph.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, ms);
}
