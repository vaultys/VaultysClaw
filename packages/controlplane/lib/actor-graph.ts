import { ActorDAO, ActorLinkDAO, WorkspaceDAO } from "@/db";
import { getWSServerInstance } from "./ws-server";
import { egoSubgraph, withDegrees } from "@/components/graph/actor-graph/ego";
import {
  EGO_NODE_CAP,
  ESTATE_NODE_CAP,
  workspaceNodeId,
  type ActorGraphData,
  type ActorGraphLink,
  type ActorGraphNode,
} from "@/components/graph/actor-graph/types";

/**
 * The relationship graph, assembled from what the database already records — `Actor.ownerDid`
 * (the `ActorOwnership` self-relation), `ActorLink` (a directed, freely-labeled edge) and
 * `Actor.workspaceId`. Same shape of thing as `lib/actor-map.ts`: a projection built per request,
 * not a persisted graph, and read-only.
 *
 * Ownership stays exactly what it is elsewhere in this codebase — descriptive, never consulted by
 * `packages/trust`'s `resolvePermission`. Drawing it changes nothing about what it means.
 */

/** Structural inputs rather than Prisma types, so `assembleActorGraph` is testable with no
 *  database and no generated client. A real `Actor`/`ActorLink`/`Workspace` row satisfies these. */
export interface GraphActorInput {
  did: string;
  name: string;
  kind: string;
  workspaceId: string | null;
  ownerDid: string | null;
  registeredAt: Date;
}
export interface GraphLinkInput {
  id: string;
  fromDid: string;
  toDid: string;
  label: string;
}
export interface GraphWorkspaceInput {
  id: string;
  name: string;
  color: string | null;
}

export interface AssembleOptions {
  /** Render each workspace as a hub node joined to its members. An *edge* needs two ends, so
   *  showing workspace membership as a relationship requires the hub to exist. */
  workspaceNodes?: boolean;
  nodeCap?: number;
  /** Live WS connection lookup — never `lastSeen`, same rule as the map. */
  isOnline?: (did: string) => boolean;
  /** Ids the cap may never drop (the ego view's focus actor). */
  pinned?: Iterable<string>;
}

export { WORKSPACE_NODE_PREFIX, workspaceNodeId } from "@/components/graph/actor-graph/types";

/**
 * Turn rows into `{nodes, links}`.
 *
 * Pure: no DAO, no `ws-server`, no clock. Everything I/O-shaped is injected via `opts`.
 */
export function assembleActorGraph(
  actors: GraphActorInput[],
  links: GraphLinkInput[],
  workspaces: GraphWorkspaceInput[],
  opts: AssembleOptions = {}
): ActorGraphData {
  const cap = opts.nodeCap ?? Infinity;
  const pinned = new Set(opts.pinned ?? []);
  const present = new Set(actors.map((a) => a.did));

  // "Connected" means: this actor takes part in at least one relationship whose *other end is also
  // in this set*. An ownerDid pointing at an actor excluded by a `kind`/`workspace` query is not a
  // relationship we can draw, so it must not earn a place under the cap either.
  const connected = new Set<string>();
  for (const actor of actors) {
    if (actor.ownerDid && present.has(actor.ownerDid)) {
      connected.add(actor.did);
      connected.add(actor.ownerDid);
    }
  }
  for (const link of links) {
    if (!present.has(link.fromDid) || !present.has(link.toDid)) continue;
    connected.add(link.fromDid);
    connected.add(link.toDid);
  }

  const kept = selectWithinCap(actors, cap, connected, pinned);
  const keptDids = new Set(kept.map((a) => a.did));
  const truncated = kept.length < actors.length;

  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));
  const nodes: ActorGraphNode[] = kept.map((actor) => ({
    id: actor.did,
    nodeKind: "actor",
    label: actor.name,
    kind: actor.kind,
    workspaceId: actor.workspaceId,
    workspaceColor: actor.workspaceId ? workspaceById.get(actor.workspaceId)?.color ?? null : null,
    online: opts.isOnline?.(actor.did),
    degree: 0,
  }));

  const graphLinks: ActorGraphLink[] = [];

  for (const actor of kept) {
    // Dropped rather than kept as a dangling edge: the force engine happily invents a node for an
    // id it has never seen, which would put a phantom, unclickable actor on screen.
    if (actor.ownerDid && keptDids.has(actor.ownerDid)) {
      graphLinks.push({
        id: `own:${actor.did}`,
        source: actor.ownerDid,
        target: actor.did,
        edgeKind: "ownership",
      });
    }
  }

  for (const link of links) {
    if (!keptDids.has(link.fromDid) || !keptDids.has(link.toDid)) continue;
    graphLinks.push({
      id: link.id,
      source: link.fromDid,
      target: link.toDid,
      edgeKind: "link",
      label: link.label,
    });
  }

  if (opts.workspaceNodes) {
    const membersByWorkspace = new Map<string, string[]>();
    for (const actor of kept) {
      if (!actor.workspaceId || !workspaceById.has(actor.workspaceId)) continue;
      const list = membersByWorkspace.get(actor.workspaceId) ?? [];
      list.push(actor.did);
      membersByWorkspace.set(actor.workspaceId, list);
    }
    for (const [workspaceId, members] of membersByWorkspace) {
      const workspace = workspaceById.get(workspaceId)!;
      nodes.push({
        id: workspaceNodeId(workspaceId),
        nodeKind: "workspace",
        label: workspace.name,
        kind: "",
        workspaceId,
        workspaceColor: workspace.color,
        degree: 0,
      });
      for (const did of members) {
        graphLinks.push({
          id: `ws:${workspaceId}:${did}`,
          source: workspaceNodeId(workspaceId),
          target: did,
          edgeKind: "workspace",
        });
      }
    }
  }

  return {
    nodes: withDegrees(nodes, graphLinks),
    links: graphLinks,
    totalActors: actors.length,
    truncated,
  };
}

/**
 * Which actors survive the cap.
 *
 * Connected actors first, then the most recently registered. The order matters on a real fleet:
 * a simulator estate is thousands of isolated agents and a few hundred related ones, and a cap that
 * took them in registration order would fill up entirely with dots that have nothing to relate to.
 */
function selectWithinCap<T extends GraphActorInput>(
  actors: T[],
  cap: number,
  connected: Set<string>,
  pinned: Set<string>
): T[] {
  if (actors.length <= cap) return actors;
  const rank = (a: T) => (pinned.has(a.did) ? 0 : connected.has(a.did) ? 1 : 2);
  return [...actors]
    .sort((a, b) => rank(a) - rank(b) || b.registeredAt.getTime() - a.registeredAt.getTime())
    .slice(0, cap);
}

/** The whole estate (optionally narrowed to one workspace in SQL — the only filter that actually
 *  shrinks the RSC payload, which is what breaks first at fleet scale). */
export async function buildEstateGraph(
  opts: { workspaceId?: string; nodeCap?: number } = {}
): Promise<ActorGraphData> {
  const [actors, links, workspaces] = await Promise.all([
    ActorDAO.list(opts.workspaceId ? { workspaceId: opts.workspaceId } : undefined),
    ActorLinkDAO.list(),
    WorkspaceDAO.list(),
  ]);
  const ws = getWSServerInstance();
  return assembleActorGraph(actors, links, workspaces, {
    workspaceNodes: true,
    nodeCap: opts.nodeCap ?? ESTATE_NODE_CAP,
    isOnline: (did) => ws?.isConnected(did) ?? false,
  });
}

/**
 * Everything within `depth` hops of one Actor.
 *
 * Deliberately not `buildEstateGraph(...)` then trimmed: the Actor detail page must not read every
 * `ActorLink` in the database to show five neighbours. Each hop costs a bounded, indexed set of
 * queries (`ActorLink` on either endpoint, Actors owned by the frontier, the frontier's own
 * owners), and the crawl stops at `EGO_NODE_CAP`.
 */
export async function buildEgoGraph(
  did: string,
  opts: { depth?: number; nodeCap?: number } = {}
): Promise<ActorGraphData> {
  const depth = Math.max(1, Math.min(2, opts.depth ?? 1));
  const cap = opts.nodeCap ?? EGO_NODE_CAP;

  const root = await ActorDAO.findByDid(did);
  if (!root) return { nodes: [], links: [], totalActors: 0, truncated: false };

  const actorsByDid = new Map<string, GraphActorInput>([[root.did, root]]);
  const linksById = new Map<string, GraphLinkInput>();
  let frontier: string[] = [root.did];
  let truncated = false;

  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    const ownerDids = frontier
      .map((f) => actorsByDid.get(f)?.ownerDid)
      .filter((o): o is string => !!o && !actorsByDid.has(o));

    const [linkRows, ownedRows, ownerRows] = await Promise.all([
      ActorLinkDAO.listForActors(frontier),
      ActorDAO.listByOwnerDids(frontier),
      ActorDAO.findManyByDid([...new Set(ownerDids)]),
    ]);

    const discovered: GraphActorInput[] = [...ownedRows, ...ownerRows];
    for (const link of linkRows) {
      linksById.set(link.id, link);
      discovered.push(link.from, link.to);
    }

    const next: string[] = [];
    for (const actor of discovered) {
      if (actorsByDid.has(actor.did)) continue;
      if (actorsByDid.size >= cap) {
        truncated = true;
        continue;
      }
      actorsByDid.set(actor.did, actor);
      next.push(actor.did);
    }
    frontier = next;
  }

  const workspaceIds = new Set(
    [...actorsByDid.values()].map((a) => a.workspaceId).filter((w): w is string => !!w)
  );
  const workspaces = workspaceIds.size > 0 ? await WorkspaceDAO.list() : [];
  const ws = getWSServerInstance();

  const assembled = assembleActorGraph([...actorsByDid.values()], [...linksById.values()], workspaces, {
    // Off here: a hub joins every member of a workspace, so at depth 1 it would drag a whole
    // workspace into a view that exists to be small. `egoSubgraph` enforces the leaf rule if a
    // caller ever turns them back on.
    workspaceNodes: false,
    pinned: [root.did],
    isOnline: (d) => ws?.isConnected(d) ?? false,
  });

  const trimmed = egoSubgraph(assembled, root.did, depth, { nodeCap: cap });
  return { ...trimmed, truncated: trimmed.truncated || truncated };
}
