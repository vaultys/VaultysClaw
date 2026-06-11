/** Simple topological layer-based auto-layout for workflow graphs.
 *  Returns a copy of nodes with computed positions. Edges are unchanged.
 */

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const GAP_X = 100;
const GAP_Y = 60;

export interface LayoutNode {
  id: string;
  position: { x: number; y: number };
}

export interface LayoutEdge {
  source: string;
  target: string;
}

/** Returns true when all nodes are piled at the origin (positions missing/zero). */
export function needsLayout(nodes: LayoutNode[]): boolean {
  if (nodes.length === 0) return false;
  return nodes.every(
    (n) => (!n.position || (n.position.x === 0 && n.position.y === 0))
  );
}

/** Assign left-to-right layer positions via Kahn's topological sort. */
export function computeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[]
): LayoutNode[] {
  if (nodes.length === 0) return nodes;

  // Build adjacency structures
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  // Kahn's BFS — process layer by layer to assign columns
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let col = 0;
  let currentLayer = [...queue];
  while (currentLayer.length > 0) {
    const nextLayer: string[] = [];
    for (const id of currentLayer) {
      layer.set(id, col);
      for (const next of adj.get(id) ?? []) {
        const nd = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, nd);
        if (nd === 0) nextLayer.push(next);
      }
    }
    currentLayer = nextLayer;
    col++;
  }

  // Nodes not reached by traversal (isolated) get their own columns
  for (const n of nodes) {
    if (!layer.has(n.id)) {
      layer.set(n.id, col++);
    }
  }

  // Group nodes by layer, then assign row within each layer
  const byLayer = new Map<number, string[]>();
  for (const [id, c] of layer) {
    const list = byLayer.get(c) ?? [];
    list.push(id);
    byLayer.set(c, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [c, ids] of byLayer) {
    const totalH = ids.length * NODE_HEIGHT + (ids.length - 1) * GAP_Y;
    const startY = -totalH / 2;
    ids.forEach((id, row) => {
      positions.set(id, {
        x: c * (NODE_WIDTH + GAP_X),
        y: startY + row * (NODE_HEIGHT + GAP_Y),
      });
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
  }));
}
