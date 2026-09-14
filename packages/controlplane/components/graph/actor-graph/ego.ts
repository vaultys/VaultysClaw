import type { ActorGraphData, ActorGraphLink, ActorGraphNode } from "./types";

/** An edge endpoint as it arrives from the server: always an id, never a node reference yet. */
function endpoints(link: ActorGraphLink): [string, string] {
  return [link.source, link.target];
}

/**
 * Trim an assembled graph to everything within `depth` hops of `focusId`.
 *
 * Pure and synchronous — `lib/actor-graph.ts` already bounds *what it fetches*; this decides what
 * is actually shown, and is where the depth semantics are pinned by tests.
 *
 * **Workspace hubs are leaves.** They are reachable (a hub is one hop from every member) but never
 * expanded from, because a hub is not a relationship between two actors — it is a shorthand for a
 * set. Expanding one would pull a 2,000-member workspace into a view whose entire purpose is to be
 * small enough to read, and would do it at depth 1.
 */
export function egoSubgraph(
  data: ActorGraphData,
  focusId: string,
  depth: number,
  opts: { nodeCap?: number } = {}
): ActorGraphData {
  const cap = opts.nodeCap ?? Infinity;
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  if (!byId.has(focusId)) return { nodes: [], links: [], totalActors: data.totalActors, truncated: false };

  const adjacency = new Map<string, string[]>();
  for (const link of data.links) {
    const [a, b] = endpoints(link);
    if (!byId.has(a) || !byId.has(b)) continue;
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
    (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
  }

  const kept = new Set<string>([focusId]);
  let frontier = [focusId];
  let truncated = false;

  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      // The leaf rule: a hub is reached, then never departed from.
      if (byId.get(id)?.nodeKind === "workspace") continue;
      for (const neighbour of adjacency.get(id) ?? []) {
        if (kept.has(neighbour)) continue;
        if (kept.size >= cap) {
          truncated = true;
          continue;
        }
        kept.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }

  const keptLinks = data.links.filter((l) => {
    const [a, b] = endpoints(l);
    return kept.has(a) && kept.has(b);
  });

  return {
    // Cloned, never the caller's objects: `withDegrees` rewrites `degree`, and a subgraph has
    // different degrees than the graph it was cut from.
    nodes: withDegrees(
      data.nodes.filter((n) => kept.has(n.id)).map((n) => ({ ...n })),
      keptLinks
    ),
    links: keptLinks,
    totalActors: data.totalActors,
    truncated: truncated || data.truncated,
  };
}

/** Rewrites each node's `degree` against a link subset and returns the nodes. The "connected only"
 *  filter and the node-size accessor both read it, so it has to follow the edges actually shown. */
export function withDegrees(nodes: ActorGraphNode[], links: ActorGraphLink[]): ActorGraphNode[] {
  const counts = new Map<string, number>();
  for (const link of links) {
    const [a, b] = endpoints(link);
    counts.set(a, (counts.get(a) ?? 0) + 1);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  for (const node of nodes) node.degree = counts.get(node.id) ?? 0;
  return nodes;
}
