import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";
import type { GraphNode, GraphEdge, GraphData, AgentCapability, UserRole } from "@vaultysclaw/shared";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * GET /api/graph — return the full relationship graph (nodes + edges). Global admin only.
 *
 * Query params:
 *   ?agent=<did>       — scope to a single agent and its direct neighbours
 *   ?user=<did>        — scope to a single user and its direct neighbours
 *   ?realm=<id>        — scope to users and agents that are members of the realm
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { searchParams } = req.nextUrl;
    const agentDid = searchParams.get("agent");
    const userDid = searchParams.get("user");
    const realmId = searchParams.get("realm");

    // Full graph is global-admin only; scoped views require matching access
    if (!auth.isGlobalAdmin) {
      if (agentDid) {
        if (!auth.canAccessAgent(agentDid)) return forbidden();
      } else if (realmId) {
        if (!auth.canAccessRealm(realmId)) return forbidden();
      } else {
        return forbidden();
      }
    }

    const graph = buildGraph({ agentDid, userDid, realmId });
    return NextResponse.json(graph);
  } catch (err) {
    console.error("graph API error", err);
    return NextResponse.json({ error: "Failed to build graph" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------

interface Filters {
  agentDid: string | null;
  userDid: string | null;
  realmId: string | null;
}

function buildGraph(filters: Filters): GraphData {
  const db = getDb();
  const wsServer = getWSServer();
  const connectedDids = new Set(wsServer?.getConnectedAgents().map((a) => a.id) ?? []);

  const nodes: Map<string, GraphNode> = new Map();
  const edges: GraphEdge[] = [];

  // --- Users ---
  type UserRow = { did: string; name: string | null; role: string; reports_to: string | null; is_owner: number; is_admin: number };
  let users: UserRow[];
  if (filters.userDid) {
    // Fetch: the target user + their direct children (who report to them) + their manager
    users = db.prepare(
      "SELECT did, name, role, reports_to, is_owner, is_admin FROM users " +
      "WHERE did = ? OR reports_to = ?"
    ).all(filters.userDid, filters.userDid) as UserRow[];
  } else if (filters.agentDid) {
    // For focused agent view: fetch users that have grants or delegations to this agent
    const userDids = db.prepare(
      "SELECT DISTINCT user_did FROM (SELECT user_did FROM user_grants WHERE agent_did = ? UNION SELECT user_did FROM delegation_certs WHERE agent_did = ?)"
    ).all(filters.agentDid, filters.agentDid) as Array<{ user_did: string }>;
    users = userDids.length > 0 
      ? db.prepare("SELECT did, name, role, reports_to, is_owner, is_admin FROM users WHERE did IN (" + userDids.map(() => "?").join(",") + ")")
          .all(...userDids.map(u => u.user_did)) as UserRow[]
      : [];
  } else if (filters.realmId) {
    users = db.prepare(
      "SELECT u.did, u.name, u.role, u.reports_to, u.is_owner, u.is_admin FROM users u " +
      "INNER JOIN user_realms ur ON ur.user_did = u.did WHERE ur.realm_id = ?"
    ).all(filters.realmId) as UserRow[];
  } else {
    users = db.prepare("SELECT did, name, role, reports_to, is_owner, is_admin FROM users").all() as UserRow[];
  }
  for (const u of users) {
    const effectiveRole: UserRole = u.is_owner ? "owner" : u.is_admin ? "admin" : (u.role as UserRole) ?? "member";
    nodes.set(`user:${u.did}`, {
      id: `user:${u.did}`,
      label: u.name || u.did.slice(0, 12),
      type: "user",
      role: effectiveRole,
    });
  }
  const userDids = new Set(users.map((u) => u.did));

  // --- Agents ---
  type AgentRow = { did: string; name: string };
  let agents: AgentRow[];
  if (filters.agentDid) {
    // Fetch target agent + all agents involved in peer grants with it
    agents = db.prepare(
      "SELECT DISTINCT did, name FROM agents WHERE did = ? OR did IN " +
      "(SELECT source_did FROM agent_peer_grants WHERE target_did = ? UNION SELECT target_did FROM agent_peer_grants WHERE source_did = ?)"
    ).all(filters.agentDid, filters.agentDid, filters.agentDid) as AgentRow[];
  } else if (filters.userDid) {
    // For focused user view: fetch agents that this user has grants or delegations to
    const agentDids = db.prepare(
      "SELECT DISTINCT agent_did FROM (SELECT agent_did FROM user_grants WHERE user_did = ? AND agent_did IS NOT NULL UNION SELECT agent_did FROM delegation_certs WHERE user_did = ?)"
    ).all(filters.userDid, filters.userDid) as Array<{ agent_did: string }>;
    agents = agentDids.length > 0 
      ? db.prepare("SELECT did, name FROM agents WHERE did IN (" + agentDids.map(() => "?").join(",") + ")")
          .all(...agentDids.map(a => a.agent_did)) as AgentRow[]
      : [];
  } else if (filters.realmId) {
    agents = db.prepare(
      "SELECT a.did, a.name FROM agents a " +
      "INNER JOIN agent_realms ar ON ar.agent_did = a.did WHERE ar.realm_id = ?"
    ).all(filters.realmId) as AgentRow[];
  } else {
    agents = db.prepare("SELECT did, name FROM agents").all() as AgentRow[];
  }
  for (const a of agents) {
    nodes.set(`agent:${a.did}`, {
      id: `agent:${a.did}`,
      label: a.name,
      type: "agent",
      isOnline: connectedDids.has(a.did),
    });
  }
  const agentDids = new Set(agents.map((a) => a.did));

  // --- reports_to edges ---
  for (const u of users) {
    if (u.reports_to) {
      // Ensure the target user node exists
      if (!nodes.has(`user:${u.reports_to}`)) {
        const manager = db.prepare("SELECT did, name, role, is_owner, is_admin FROM users WHERE did = ?").get(u.reports_to) as UserRow | undefined;
        if (manager) {
          const mRole: UserRole = manager.is_owner ? "owner" : manager.is_admin ? "admin" : (manager.role as UserRole) ?? "member";
          nodes.set(`user:${manager.did}`, { id: `user:${manager.did}`, label: manager.name || manager.did.slice(0, 12), type: "user", role: mRole });
        }
      }
      edges.push({ source: `user:${u.did}`, target: `user:${u.reports_to}`, type: "reports_to" });
    }
  }

  // --- Grant edges (user → agent) ---
  type GrantRow = { user_did: string; agent_did: string | null; capabilities: string };
  let grants: GrantRow[];
  if (filters.userDid) {
    grants = db.prepare("SELECT user_did, agent_did, capabilities FROM user_grants WHERE user_did = ?").all(filters.userDid) as GrantRow[];
  } else if (filters.agentDid) {
    grants = db.prepare(
      "SELECT user_did, agent_did, capabilities FROM user_grants WHERE agent_did = ? OR agent_did IS NULL"
    ).all(filters.agentDid) as GrantRow[];
  } else if (filters.realmId) {
    // Only grants where both the user and agent are realm members
    grants = db.prepare(
      "SELECT g.user_did, g.agent_did, g.capabilities FROM user_grants g " +
      "INNER JOIN user_realms ur ON ur.user_did = g.user_did AND ur.realm_id = ? " +
      "WHERE g.agent_did IS NULL OR g.agent_did IN (SELECT agent_did FROM agent_realms WHERE realm_id = ?)"
    ).all(filters.realmId, filters.realmId) as GrantRow[];
  } else {
    grants = db.prepare("SELECT user_did, agent_did, capabilities FROM user_grants").all() as GrantRow[];
  }
  for (const g of grants) {
    const caps: AgentCapability[] = JSON.parse(g.capabilities);
    if (g.agent_did) {
      // Ensure both endpoints exist
      if (!nodes.has(`user:${g.user_did}`)) {
        // In focused agent view: pull in the user
        if (filters.agentDid) {
          const u = db.prepare("SELECT did, name, role, reports_to, is_owner, is_admin FROM users WHERE did = ?").get(g.user_did) as UserRow | undefined;
          if (u) {
            const r: UserRole = u.is_owner ? "owner" : u.is_admin ? "admin" : (u.role as UserRole) ?? "member";
            nodes.set(`user:${u.did}`, { id: `user:${u.did}`, label: u.name || u.did.slice(0, 12), type: "user", role: r });
          } else continue;
        } else continue;
      }
      if (!nodes.has(`agent:${g.agent_did}`)) {
        // In focused user view: pull in the agent
        const a = db.prepare("SELECT did, name FROM agents WHERE did = ?").get(g.agent_did) as AgentRow | undefined;
        if (a) nodes.set(`agent:${a.did}`, { id: `agent:${a.did}`, label: a.name, type: "agent", isOnline: connectedDids.has(a.did) });
        else continue;
      }
      edges.push({ source: `user:${g.user_did}`, target: `agent:${g.agent_did}`, type: "grant", label: caps.join(", "), capabilities: caps });
    } else if (!filters.agentDid && !filters.userDid && !filters.realmId) {
      // Wildcard grant — only expand in full view to avoid flooding focused views
      for (const aDid of agentDids) {
        edges.push({ source: `user:${g.user_did}`, target: `agent:${aDid}`, type: "grant", label: `* ${caps.join(", ")}`, capabilities: caps });
      }
    }
  }

  // --- Delegation edges ---
  type DelegRow = { user_did: string; agent_did: string; capabilities: string };
  let delegations: DelegRow[];
  if (filters.agentDid) {
    delegations = db.prepare("SELECT user_did, agent_did, capabilities FROM delegation_certs WHERE agent_did = ?").all(filters.agentDid) as DelegRow[];
  } else if (filters.userDid) {
    delegations = db.prepare("SELECT user_did, agent_did, capabilities FROM delegation_certs WHERE user_did = ?").all(filters.userDid) as DelegRow[];
  } else if (filters.realmId) {
    // Only delegations where both user and agent are realm members
    delegations = db.prepare(
      "SELECT d.user_did, d.agent_did, d.capabilities FROM delegation_certs d " +
      "INNER JOIN user_realms ur ON ur.user_did = d.user_did AND ur.realm_id = ? " +
      "INNER JOIN agent_realms ar ON ar.agent_did = d.agent_did AND ar.realm_id = ?"
    ).all(filters.realmId, filters.realmId) as DelegRow[];
  } else {
    delegations = db.prepare("SELECT user_did, agent_did, capabilities FROM delegation_certs").all() as DelegRow[];
  }
  for (const d of delegations) {
    if (!nodes.has(`user:${d.user_did}`) || !nodes.has(`agent:${d.agent_did}`)) continue;
    const caps: AgentCapability[] = JSON.parse(d.capabilities);
    edges.push({ source: `user:${d.user_did}`, target: `agent:${d.agent_did}`, type: "delegation", label: caps.join(", "), capabilities: caps });
  }

  // --- Peer edges (agent → agent) ---
  type PeerRow = { source_did: string; target_did: string; target_name: string; skill_description: string };
  let peers: PeerRow[];
  if (filters.agentDid) {
    peers = db.prepare(
      "SELECT source_did, target_did, target_name, skill_description FROM agent_peer_grants WHERE source_did = ? OR target_did = ?"
    ).all(filters.agentDid, filters.agentDid) as PeerRow[];
  } else {
    peers = db.prepare("SELECT source_did, target_did, target_name, skill_description FROM agent_peer_grants").all() as PeerRow[];
  }
  for (const p of peers) {
    const srcKey = `agent:${p.source_did}`;
    const tgtKey = `agent:${p.target_did}`;
    // Ensure both agent nodes exist (pull in if in focused view)
    if (!nodes.has(srcKey)) {
      if (filters.agentDid) {
        const a = db.prepare("SELECT did, name FROM agents WHERE did = ?").get(p.source_did) as AgentRow | undefined;
        if (a) nodes.set(srcKey, { id: srcKey, label: a.name, type: "agent", isOnline: connectedDids.has(a.did) });
        else continue;
      } else continue;
    }
    if (!nodes.has(tgtKey)) {
      if (filters.agentDid) {
        const a = db.prepare("SELECT did, name FROM agents WHERE did = ?").get(p.target_did) as AgentRow | undefined;
        if (a) nodes.set(tgtKey, { id: tgtKey, label: a.name, type: "agent", isOnline: connectedDids.has(a.did) });
        else continue;
      } else continue;
    }
    edges.push({ source: srcKey, target: tgtKey, type: "peer", label: p.skill_description });
  }

  // In the full view (no focus filter) drop isolated nodes — only show nodes
  // that participate in at least one edge.
  if (!filters.agentDid && !filters.userDid && !filters.realmId) {
    const referenced = new Set<string>();
    for (const e of edges) {
      referenced.add(e.source);
      referenced.add(e.target);
    }
    for (const id of nodes.keys()) {
      if (!referenced.has(id)) nodes.delete(id);
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}
