import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";
import type { GraphNode, GraphEdge, GraphData, AgentCapability, UserRole } from "@vaultysclaw/shared";

/**
 * GET /api/graph — return the full relationship graph (nodes + edges).
 *
 * Query params:
 *   ?realm=<id>        — scope to a single realm
 *   ?agent=<did>       — scope to a single agent and its neighbours
 *   ?user=<did>        — scope to a single user and its neighbours
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const realmId = searchParams.get("realm");
    const agentDid = searchParams.get("agent");
    const userDid = searchParams.get("user");

    const graph = buildGraph({ realmId, agentDid, userDid });
    return NextResponse.json(graph);
  } catch (err) {
    console.error("graph API error", err);
    return NextResponse.json({ error: "Failed to build graph" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------

interface Filters {
  realmId: string | null;
  agentDid: string | null;
  userDid: string | null;
}

function buildGraph(filters: Filters): GraphData {
  const db = getDb();
  const wsServer = getWSServer();
  const connectedDids = new Set(wsServer?.getConnectedAgents().map((a) => a.id) ?? []);

  const nodes: Map<string, GraphNode> = new Map();
  const edges: GraphEdge[] = [];

  // --- Realm nodes ---
  type RealmRow = { id: string; name: string; color: string };
  let realms: RealmRow[];
  if (filters.realmId) {
    realms = db.prepare("SELECT id, name, color FROM realms WHERE id = ?").all(filters.realmId) as RealmRow[];
  } else {
    realms = db.prepare("SELECT id, name, color FROM realms").all() as RealmRow[];
  }
  for (const r of realms) {
    nodes.set(`realm:${r.id}`, { id: `realm:${r.id}`, label: r.name, type: "realm", color: r.color });
  }
  const realmIds = realms.map((r) => r.id);

  // --- Users ---
  type UserRow = { did: string; name: string | null; role: string; reports_to: string | null; is_owner: number; is_admin: number };
  let users: UserRow[];
  if (filters.userDid) {
    users = db.prepare("SELECT did, name, role, reports_to, is_owner, is_admin FROM users WHERE did = ?").all(filters.userDid) as UserRow[];
  } else if (filters.realmId) {
    users = db.prepare(
      "SELECT u.did, u.name, u.role, u.reports_to, u.is_owner, u.is_admin FROM users u JOIN user_realms ur ON u.did = ur.user_did WHERE ur.realm_id = ?"
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
    agents = db.prepare("SELECT did, name FROM agents WHERE did = ?").all(filters.agentDid) as AgentRow[];
  } else if (filters.realmId) {
    agents = db.prepare(
      "SELECT a.did, a.name FROM agents a JOIN agent_realms ar ON a.did = ar.agent_did WHERE ar.realm_id = ?"
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

  // --- Realm membership edges ---
  if (realmIds.length > 0) {
    const placeholders = realmIds.map(() => "?").join(",");
    type MembershipRow = { user_did?: string; agent_did?: string; realm_id: string };

    const userMemberships = db.prepare(
      `SELECT user_did, realm_id FROM user_realms WHERE realm_id IN (${placeholders})`
    ).all(...realmIds) as MembershipRow[];
    for (const m of userMemberships) {
      if (userDids.has(m.user_did!)) {
        edges.push({ source: `user:${m.user_did}`, target: `realm:${m.realm_id}`, type: "realm_member" });
      }
    }

    const agentMemberships = db.prepare(
      `SELECT agent_did, realm_id FROM agent_realms WHERE realm_id IN (${placeholders})`
    ).all(...realmIds) as MembershipRow[];
    for (const m of agentMemberships) {
      if (agentDids.has(m.agent_did!)) {
        edges.push({ source: `agent:${m.agent_did}`, target: `realm:${m.realm_id}`, type: "realm_member" });
      }
    }
  }

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
  } else {
    grants = db.prepare("SELECT user_did, agent_did, capabilities FROM user_grants").all() as GrantRow[];
  }
  for (const g of grants) {
    const caps: AgentCapability[] = JSON.parse(g.capabilities);
    if (g.agent_did) {
      // Ensure both endpoints exist
      if (!nodes.has(`user:${g.user_did}`)) continue;
      if (!nodes.has(`agent:${g.agent_did}`)) {
        // If scoped to a user, pull in the agent
        const a = db.prepare("SELECT did, name FROM agents WHERE did = ?").get(g.agent_did) as AgentRow | undefined;
        if (a) nodes.set(`agent:${a.did}`, { id: `agent:${a.did}`, label: a.name, type: "agent", isOnline: connectedDids.has(a.did) });
        else continue;
      }
      edges.push({ source: `user:${g.user_did}`, target: `agent:${g.agent_did}`, type: "grant", label: caps.join(", "), capabilities: caps });
    } else {
      // Wildcard grant — link user to all known agents in scope
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
  } else {
    delegations = db.prepare("SELECT user_did, agent_did, capabilities FROM delegation_certs").all() as DelegRow[];
  }
  for (const d of delegations) {
    if (!nodes.has(`user:${d.user_did}`) || !nodes.has(`agent:${d.agent_did}`)) continue;
    const caps: AgentCapability[] = JSON.parse(d.capabilities);
    edges.push({ source: `user:${d.user_did}`, target: `agent:${d.agent_did}`, type: "delegation", label: caps.join(", "), capabilities: caps });
  }

  // If scoped to a single agent or user, pull in extra realm memberships for the focus node
  if (filters.agentDid && !filters.realmId) {
    addRealmEdgesFor("agent", filters.agentDid, nodes, edges, db);
  }
  if (filters.userDid && !filters.realmId) {
    addRealmEdgesFor("user", filters.userDid, nodes, edges, db);
  }

  return { nodes: Array.from(nodes.values()), edges };
}

function addRealmEdgesFor(
  kind: "agent" | "user",
  did: string,
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
  db: ReturnType<typeof getDb>,
) {
  const table = kind === "agent" ? "agent_realms" : "user_realms";
  const col = kind === "agent" ? "agent_did" : "user_did";
  type Row = { realm_id: string };
  const memberships = db.prepare(`SELECT realm_id FROM ${table} WHERE ${col} = ?`).all(did) as Row[];
  for (const m of memberships) {
    if (!nodes.has(`realm:${m.realm_id}`)) {
      const r = db.prepare("SELECT id, name, color FROM realms WHERE id = ?").get(m.realm_id) as { id: string; name: string; color: string } | undefined;
      if (r) nodes.set(`realm:${r.id}`, { id: `realm:${r.id}`, label: r.name, type: "realm", color: r.color });
    }
    edges.push({ source: `${kind}:${did}`, target: `realm:${m.realm_id}`, type: "realm_member" });
  }
}
