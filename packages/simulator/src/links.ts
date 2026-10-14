/**
 * Relationships between simulated Actors: the `ActorLink` edges `/admin/graph` draws next to
 * ownership.
 *
 * Ownership alone renders an estate as one star per person — every agent pointing at its owner and
 * at nothing else. A real estate has structure inside each star: an agent runs on somebody's laptop,
 * an OpenClaw agent calls an MCP server, a host sends its traffic through a proxy. Those are exactly
 * the free-labeled edges `ActorLink` exists for, so this file decides them.
 *
 * Pure on purpose, like `ownership.ts`: `db.ts` applies the plan, this file computes it, and the
 * tests check it without a database. Deterministic and keyed on DIDs, so a rerun plans the same
 * links and writes nothing.
 */
import { createHash } from "node:crypto";
import { unitHash } from "./ownership.js";

export interface LinkableActor {
  did: string;
  kind: string;
  ownerDid: string | null;
}

export interface PlannedLink {
  /** Deterministic, so a rerun is a no-op and `db.ts` can tell its own links from hand-made ones. */
  id: string;
  fromDid: string;
  toDid: string;
  label: string;
}

/** Every link this simulator writes has an id with this prefix — never a UUID, so never a link an
 *  operator made in the console. */
export const SIM_LINK_ID_PREFIX = "sim-link-";

export const LINK_LABELS = {
  runsOn: "runs on",
  usesTool: "uses tool",
  egressVia: "egress via",
} as const;

const AGENT_KINDS = new Set(["openclaw", "mcp"]);
const HOST_KINDS = new Set(["sensor", "device"]);

/**
 * The relationships for a fleet:
 *
 * - every agent (`openclaw`, `mcp`) **runs on** one host (`sensor` or `device`) — one its owner
 *   holds when they have any, so the edge stays inside that person's star, otherwise any host;
 * - every `openclaw` agent **uses tool** one `mcp` server, preferring its owner's;
 * - every host sends **egress via** one `proxy`, when the fleet has proxies.
 *
 * At most one edge of each kind per Actor. More would turn a small fleet into a hairball and say
 * nothing extra about the estate.
 */
export function planLinks(actors: LinkableActor[]): PlannedLink[] {
  const hosts = actors.filter((a) => HOST_KINDS.has(a.kind));
  const mcps = actors.filter((a) => a.kind === "mcp");
  const proxies = actors.filter((a) => a.kind === "proxy");
  const hostsByOwner = groupByOwner(hosts);
  const mcpsByOwner = groupByOwner(mcps);

  const links: PlannedLink[] = [];
  for (const actor of actors) {
    if (AGENT_KINDS.has(actor.kind)) {
      const host = pickPreferringOwner(actor, LINK_LABELS.runsOn, hostsByOwner, hosts);
      if (host) links.push(link(actor.did, host.did, LINK_LABELS.runsOn));
    }
    if (actor.kind === "openclaw") {
      const tool = pickPreferringOwner(actor, LINK_LABELS.usesTool, mcpsByOwner, mcps);
      if (tool) links.push(link(actor.did, tool.did, LINK_LABELS.usesTool));
    }
    if (HOST_KINDS.has(actor.kind) && proxies.length > 0) {
      const proxy = pick(proxies, actor.did, LINK_LABELS.egressVia);
      links.push(link(actor.did, proxy.did, LINK_LABELS.egressVia));
    }
  }
  return links;
}

export function linkId(fromDid: string, toDid: string, label: string): string {
  const digest = createHash("sha256").update(`${fromDid}\n${label}\n${toDid}`).digest("hex");
  return `${SIM_LINK_ID_PREFIX}${digest.slice(0, 32)}`;
}

function link(fromDid: string, toDid: string, label: string): PlannedLink {
  return { id: linkId(fromDid, toDid, label), fromDid, toDid, label };
}

function groupByOwner(actors: LinkableActor[]): Map<string, LinkableActor[]> {
  const out = new Map<string, LinkableActor[]>();
  for (const a of actors) {
    if (!a.ownerDid) continue;
    const list = out.get(a.ownerDid);
    if (list) list.push(a);
    else out.set(a.ownerDid, [a]);
  }
  return out;
}

function pickPreferringOwner(
  actor: LinkableActor,
  salt: string,
  byOwner: Map<string, LinkableActor[]>,
  all: LinkableActor[]
): LinkableActor | null {
  const own = actor.ownerDid ? byOwner.get(actor.ownerDid) : undefined;
  const pool = own && own.length > 0 ? own : all;
  return pool.length > 0 ? pick(pool, actor.did, salt) : null;
}

/** Salted by the edge kind, so an agent's host and its MCP server are not chosen by the same draw. */
function pick<T>(pool: T[], did: string, salt: string): T {
  return pool[Math.min(pool.length - 1, Math.floor(unitHash(`${salt}:${did}`) * pool.length))];
}
