import { Edge, MarkerType } from "reactflow";

interface XY {
  x: number;
  y: number;
}

interface EdgeOpts {
  animated?: boolean;
  dashed?: boolean;
  markerEnd?: boolean;
}

/**
 * Choose which handle faces an edge should exit/enter so it points toward the
 * target rather than always right→left. Dominant axis wins (diagonal threshold
 * 0.7 of the other axis).
 */
export function handleSides(
  srcPos: XY,
  tgtPos: XY
): { sourceHandle: string; targetHandle: string } {
  const dx = tgtPos.x - srcPos.x;
  const dy = tgtPos.y - srcPos.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (adx >= ady * 0.7) {
    return dx >= 0
      ? { sourceHandle: "right-src", targetHandle: "left-tgt" }
      : { sourceHandle: "left-src", targetHandle: "right-tgt" };
  }
  return dy >= 0
    ? { sourceHandle: "bottom-src", targetHandle: "top-tgt" }
    : { sourceHandle: "top-src", targetHandle: "bottom-tgt" };
}

function baseEdge(
  id: string,
  source: string,
  target: string,
  label: string,
  color: string,
  sourceHandle: string,
  targetHandle: string,
  opts: EdgeOpts
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    label,
    animated: opts.animated ?? true,
    style: {
      stroke: color,
      strokeWidth: 1.8,
      strokeDasharray: opts.dashed ? "5,4" : undefined,
    },
    labelStyle: { fill: color, fontSize: 10, fontWeight: 600 },
    labelBgStyle: { fill: "transparent" },
    markerEnd:
      opts.markerEnd !== false
        ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 }
        : undefined,
  };
}

/** Edge whose handle sides are derived from the relative node positions. */
export function makeEdge(
  id: string,
  source: string,
  target: string,
  label: string,
  color: string,
  srcPos: XY,
  tgtPos: XY,
  opts: EdgeOpts = {}
): Edge {
  const { sourceHandle, targetHandle } = handleSides(srcPos, tgtPos);
  return baseEdge(id, source, target, label, color, sourceHandle, targetHandle, opts);
}

/** Edge forced to exit/enter the left↔right faces regardless of exact positions. */
export function makeHorizontalEdge(
  id: string,
  source: string,
  target: string,
  label: string,
  color: string,
  srcX: number,
  tgtX: number,
  opts: EdgeOpts = {}
): Edge {
  const sourceHandle = srcX < tgtX ? "right-src" : "left-src";
  const targetHandle = srcX < tgtX ? "left-tgt" : "right-tgt";
  return baseEdge(id, source, target, label, color, sourceHandle, targetHandle, opts);
}
