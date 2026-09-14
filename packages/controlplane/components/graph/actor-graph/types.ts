import { encodeDidParam } from "@/lib/actor-route";

/**
 * The relationship graph's view model — built server-side (lib/actor-graph.ts) from Actors,
 * ActorLinks and Workspaces already in the database. There is no persisted "graph" concept: this
 * is a projection, exactly like `MapMarker` is a projection of a located Actor.
 *
 * Read-only by design. Editing a relationship stays in the Actor detail page's forms
 * (`app/admin/actors/actions.ts`) — this is a way to *see* the estate, not a second way to change
 * it, so nothing here needs a Server Action or its own `requireAdmin` gate.
 */

export type ActorGraphNodeKind = "actor" | "workspace";

export interface ActorGraphNode {
  /** `Actor.did`, or `ws:<Workspace.id>` for a workspace hub. */
  id: string;
  nodeKind: ActorGraphNodeKind;
  /** `Actor.name` / `Workspace.name`. Untrusted display text — see the innerHTML note in
   *  `useActorForceGraph.ts` before putting it anywhere but a React tree. */
  label: string;
  /** `Actor.kind` (see lib/actor-kinds.ts); `""` for a workspace hub. */
  kind: string;
  workspaceId: string | null;
  /** `Workspace.color` — already a hex string in the schema, defaulted there. */
  workspaceColor: string | null;
  /** Live WS connection, never `lastSeen` — the same rule every "online" indicator here follows. */
  online?: boolean;
  /** Computed server-side: how many edges touch this node. Drives node size, the "connected only"
   *  filter, and the priority order the estate cap keeps. */
  degree: number;
}

/**
 * Prefix distinguishing a workspace hub's node id from an Actor DID.
 *
 * Lives here rather than next to the assembler in `lib/actor-graph.ts` on purpose: that module
 * imports the DAOs and the WS server, so a Client Component reaching for this one constant would
 * pull Prisma, BullMQ and ioredis into the browser bundle — which does not fail at type-check, it
 * fails at build time with "Can't resolve 'child_process'".
 */
export const WORKSPACE_NODE_PREFIX = "ws:";

export function workspaceNodeId(workspaceId: string): string {
  return `${WORKSPACE_NODE_PREFIX}${workspaceId}`;
}

/** Where a node leads. One definition, so the tooltip's `<a>` and the canvas click can never
 *  disagree about where the same node goes. */
export function graphNodeHref(node: { id: string; nodeKind: ActorGraphNodeKind }): string {
  return node.nodeKind === "workspace"
    ? `/admin/workspaces/${node.id.slice(WORKSPACE_NODE_PREFIX.length)}`
    : `/admin/actors/${encodeDidParam(node.id)}`;
}

export type ActorGraphEdgeKind = "ownership" | "link" | "workspace";

export const EDGE_KINDS: readonly ActorGraphEdgeKind[] = ["ownership", "link", "workspace"] as const;

export const EDGE_KIND_LABEL: Record<ActorGraphEdgeKind, string> = {
  ownership: "Ownership",
  link: "Relationship",
  workspace: "Workspace",
};

export interface ActorGraphLink {
  /** Stable across re-filters: `own:<did>` | `ActorLink.id` | `ws:<wsId>:<did>`. The engine mutates
   *  `source`/`target`, so this id is the only safe way to re-identify an edge. */
  id: string;
  /** DIDs/hub ids on the way in. ⚠ 3d-force-graph REPLACES these with node object references once
   *  it ingests the data — never re-feed a link object it has already seen. */
  source: string;
  target: string;
  edgeKind: ActorGraphEdgeKind;
  /** `ActorLink.label` only — ownership and workspace edges have no free text. */
  label?: string;
}

export interface ActorGraphData {
  nodes: ActorGraphNode[];
  links: ActorGraphLink[];
  /** Actors in the database matching the query, before the cap — the denominator of the
   *  truncation banner. */
  totalActors: number;
  truncated: boolean;
}

export const EMPTY_GRAPH: ActorGraphData = {
  nodes: [],
  links: [],
  totalActors: 0,
  truncated: false,
};

/**
 * How many Actor nodes the estate view will render.
 *
 * The binding constraint is not WebGL, it is the RSC payload: a simulator estate
 * (`pnpm simulator:demo` = 2,000 + 5,000 Actors) serializes to several MB of JSON in the flight
 * stream before a single frame is drawn. The cap keeps connected Actors first (see
 * `assembleActorGraph`) because the thousands of isolated agents a fleet accumulates are dots with
 * no edges — they are exactly what a *relationship* graph has nothing to say about.
 */
export const ESTATE_NODE_CAP = 1500;

/** The ego view is bounded far more tightly: it exists to be read, not surveyed. */
export const EGO_NODE_CAP = 300;

/** Above this, the renderer drops to low-poly nodes and a shorter simulation (see the hook). */
export const HEAVY_GRAPH_THRESHOLD = 800;

export interface ActorGraphProps {
  data: ActorGraphData;
  height?: number;
  className?: string;
  /** Which node the ego view is centred on — rendered larger, with a ring. */
  focusDid?: string;
  /** Highlights and re-centres the camera; deliberately does not filter (see GraphFilterBar). */
  search?: string;
  colorBy?: "kind" | "workspace";
  /** Node ids are DIDs or `ws:<id>` — the caller decides where each one navigates. */
  onNodeNavigate?: (node: ActorGraphNode) => void;
}
