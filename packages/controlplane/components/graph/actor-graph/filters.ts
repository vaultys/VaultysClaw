import { withDegrees } from "./ego";
import type { ActorGraphData, ActorGraphEdgeKind } from "./types";

export interface GraphFilters {
  /** Empty means "every kind" — a filter nobody has touched must not hide anything, including a
   *  kind added to `lib/actor-kinds.ts` after this UI was written. */
  kinds: string[];
  edgeKinds: ActorGraphEdgeKind[];
  /** Hide actors with no edges left after the other filters. On by default: a fleet's isolated
   *  agents are the bulk of the nodes and none of the relationships. */
  connectedOnly: boolean;
  workspaceNodes: boolean;
}

export const DEFAULT_FILTERS: GraphFilters = {
  kinds: [],
  edgeKinds: ["ownership", "link", "workspace"],
  connectedOnly: true,
  workspaceNodes: true,
};

/**
 * Apply the client-side filters.
 *
 * Pure, and the order is load-bearing: nodes are dropped first, then edges are re-filtered against
 * what survived, then degrees are recomputed, and only then does `connectedOnly` run — so an actor
 * whose only edge pointed at a hidden kind correctly counts as isolated. Skipping the recompute
 * would use degrees from the unfiltered graph and keep nodes with nothing attached to them.
 */
export function applyGraphFilters(data: ActorGraphData, filters: GraphFilters): ActorGraphData {
  const kinds = new Set(filters.kinds);
  const edgeKinds = new Set(filters.edgeKinds);

  const visibleIds = new Set(
    data.nodes
      .filter((n) =>
        n.nodeKind === "workspace"
          ? filters.workspaceNodes && edgeKinds.has("workspace")
          : kinds.size === 0 || kinds.has(n.kind)
      )
      .map((n) => n.id)
  );

  // Cloned, not just filtered: 3d-force-graph rewrites `source`/`target` on the objects it is
  // handed, so returning the caller's own link objects would hand the engine data it has already
  // mutated on the next pass — which it resolves into phantom edges.
  let links = data.links
    .filter((l) => edgeKinds.has(l.edgeKind) && visibleIds.has(l.source) && visibleIds.has(l.target))
    .map((l) => ({ ...l }));
  let nodes = withDegrees(
    data.nodes.filter((n) => visibleIds.has(n.id)).map((n) => ({ ...n })),
    links
  );

  if (filters.connectedOnly) {
    // A hub whose members were all filtered out is itself isolated, and goes too.
    const kept = new Set(nodes.filter((n) => n.degree > 0).map((n) => n.id));
    nodes = nodes.filter((n) => kept.has(n.id));
    links = links.filter((l) => kept.has(l.source) && kept.has(l.target));
    nodes = withDegrees(nodes, links);
  }

  return { nodes, links, totalActors: data.totalActors, truncated: data.truncated };
}
