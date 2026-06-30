import { getWSServer } from "@/lib/ws-server";
import { prisma } from "@/db/client";
import type {
  GraphNode,
  GraphEdge,
  GraphData,
  AgentCapability,
  UserRole,
} from "@vaultysclaw/shared";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  AgentRecord,
  Filters,
  graphContract,
  UserRecord,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { normalizeRole } from "@/lib/roles";

/**
 * GET /api/graph — return the full relationship graph (nodes + edges). Global admin only.
 *
 * Query params:
 *   ?agent=<did>       — scope to a single agent and its direct neighbours
 *   ?user=<did>        — scope to a single user and its direct neighbours
 *   ?realm=<id>        — scope to users and agents that are members of the realm
 */
/**
 * @openapi
 * /api/graph:
 *   get:
 *     summary: Retrieve the full relationship graph of nodes and edges.
 *     tags: [Graph]
 *     parameters:
 *       - name: agent
 *         in: query
 *         description: Scope to a single agent and its direct neighbours.
 *         required: false
 *         schema:
 *           type: string
 *       - name: user
 *         in: query
 *         description: Scope to a single user and its direct neighbours.
 *         required: false
 *         schema:
 *           type: string
 *       - name: realm
 *         in: query
 *         description: Scope to users and agents that are members of the realm.
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved the graph data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nodes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GraphNode'
 *                 edges:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GraphEdge'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to build graph.
 */
const handlers = createNextRoute(graphContract, {
  // ── GET /api/graph?agent=&user=&realm= ────────────────────────────────────
  get: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const agentDid = query.agent ?? null;
    const userDid = query.user ?? null;
    const realmId = query.realm ?? null;

    // Full graph is global-admin only; scoped views require matching access
    if (!auth.isGlobalAdmin) {
      if (agentDid) {
        if (!(await auth.canAccessAgent(agentDid)))
          throw new APIException("FORBIDDEN");
      } else if (realmId) {
        if (!(await auth.canAccessRealm(realmId)))
          throw new APIException("FORBIDDEN");
      } else {
        throw new APIException("FORBIDDEN");
      }
    }

    const graph = await buildGraph({ agentDid, userDid, realmId });
    return { status: 200, body: graph };
  },
});

export const GET = handlers.GET!;

// ---------------------------------------------------------------------------

function effectiveUserRole(u: UserRecord): UserRole {
  // Graph node roles are the lowercase presentation enum (shared UserRole).
  return normalizeRole(u.role).toLowerCase() as UserRole;
}

function addUserNode(nodes: Map<string, GraphNode>, u: UserRecord): void {
  if (!u.did) return;
  nodes.set(`user:${u.did}`, {
    id: `user:${u.did}`,
    label: u.name || u.did.slice(0, 12),
    type: "user",
    role: effectiveUserRole(u),
  });
}

function addAgentNode(
  nodes: Map<string, GraphNode>,
  a: AgentRecord,
  connectedDids: Set<string>
): void {
  nodes.set(`agent:${a.did}`, {
    id: `agent:${a.did}`,
    label: a.name,
    type: "agent",
    isOnline: connectedDids.has(a.did),
  });
}

async function buildGraph(filters: Filters): Promise<GraphData> {
  const wsServer = getWSServer();
  const connectedDids = new Set(
    wsServer?.getConnectedAgents().map((a) => a.id) ?? []
  );

  const nodes: Map<string, GraphNode> = new Map();
  const edges: GraphEdge[] = [];

  // --- Users ---
  let users: UserRecord[];
  if (filters.userDid) {
    // Fetch: the target user + their direct children (who report to them)
    // reportsTo on User stores the manager's id (User.id), not did
    const targetUser = await prisma.user.findUnique({
      where: { did: filters.userDid },
      select: {
        id: true,
        did: true,
        name: true,
        role: true,
        reportsTo: true,
      },
    });
    const children = targetUser
      ? await prisma.user.findMany({
          where: { reportsTo: targetUser.id },
          select: {
            id: true,
            did: true,
            name: true,
            role: true,
            reportsTo: true,
          },
        })
      : [];
    users = targetUser ? [targetUser, ...children] : [];
  } else if (filters.agentDid) {
    // For focused agent view: fetch users that have grants or delegations to this agent
    const [grantUsers, delegUsers] = await Promise.all([
      prisma.userGrant.findMany({
        where: { agentDid: filters.agentDid },
        select: {
          user: {
            select: {
              id: true,
              did: true,
              name: true,
              role: true,
              reportsTo: true,
            },
          },
        },
      }),
      prisma.delegationCert.findMany({
        where: { agentDid: filters.agentDid },
        select: { userDid: true },
      }),
    ]);
    const didSet = new Set<string>(
      grantUsers.map((g) => g.user.did).filter(Boolean) as string[]
    );
    for (const d of delegUsers) didSet.add(d.userDid);
    users =
      didSet.size > 0
        ? await prisma.user.findMany({
            where: { did: { in: Array.from(didSet) } },
            select: {
              id: true,
              did: true,
              name: true,
              role: true,
              reportsTo: true,
            },
          })
        : [];
  } else if (filters.realmId) {
    const userRealms = await prisma.userRealm.findMany({
      where: { realmId: filters.realmId },
      select: {
        user: {
          select: {
            id: true,
            did: true,
            name: true,
            role: true,
            reportsTo: true,
          },
        },
      },
    });
    users = userRealms.map((ur) => ur.user);
  } else {
    users = await prisma.user.findMany({
      select: {
        id: true,
        did: true,
        name: true,
        role: true,
        reportsTo: true,
      },
    });
  }

  for (const u of users) {
    addUserNode(nodes, u);
  }
  const userDids = new Set(users.map((u) => u.did).filter(Boolean) as string[]);

  // --- Agents ---
  let agents: AgentRecord[];
  if (filters.agentDid) {
    const a = await prisma.agent.findUnique({
      where: { did: filters.agentDid },
      select: { did: true, name: true },
    });
    agents = a ? [a] : [];
  } else if (filters.userDid) {
    // For focused user view: fetch agents that this user has grants or delegations to
    const [grantAgents, delegAgents] = await Promise.all([
      prisma.userGrant.findMany({
        where: { userDid: filters.userDid, agentDid: { not: null } },
        select: { agentDid: true },
      }),
      prisma.delegationCert.findMany({
        where: { userDid: filters.userDid },
        select: { agentDid: true },
      }),
    ]);
    const agentDidSet = new Set<string>(
      [
        ...grantAgents.map((g) => g.agentDid),
        ...delegAgents.map((d) => d.agentDid),
      ].filter(Boolean) as string[]
    );
    agents =
      agentDidSet.size > 0
        ? await prisma.agent.findMany({
            where: { did: { in: Array.from(agentDidSet) } },
            select: { did: true, name: true },
          })
        : [];
  } else if (filters.realmId) {
    const agentRealms = await prisma.agentRealm.findMany({
      where: { realmId: filters.realmId },
      select: { agent: { select: { did: true, name: true } } },
    });
    agents = agentRealms.map((ar) => ar.agent);
  } else {
    agents = await prisma.agent.findMany({ select: { did: true, name: true } });
  }

  for (const a of agents) {
    addAgentNode(nodes, a, connectedDids);
  }
  const agentDids = new Set(agents.map((a) => a.did));

  // --- reports_to edges ---
  // reportsTo on a User stores the manager's User.id (not did).
  // Build a lookup from User.id -> User record so we can resolve manager did efficiently.
  const userById = new Map<string, UserRecord>(users.map((u) => [u.id, u]));

  for (const u of users) {
    if (!u.did || !u.reportsTo) continue;
    let manager = userById.get(u.reportsTo);
    if (!manager) {
      // Manager not in our current set — fetch from DB
      manager =
        (await prisma.user.findUnique({
          where: { id: u.reportsTo },
          select: {
            id: true,
            did: true,
            name: true,
            role: true,
            reportsTo: true,
          },
        })) ?? undefined;
      if (manager) {
        userById.set(manager.id, manager);
        addUserNode(nodes, manager);
      }
    }
    if (manager?.did) {
      edges.push({
        source: `user:${u.did}`,
        target: `user:${manager.did}`,
        type: "reports_to",
      });
    }
  }

  // --- Grant edges (user → agent) ---
  let grants: Array<{
    userDid: string;
    agentDid: string | null;
    capabilities: unknown;
  }>;
  if (filters.userDid) {
    grants = await prisma.userGrant.findMany({
      where: { userDid: filters.userDid },
      select: { userDid: true, agentDid: true, capabilities: true },
    });
  } else if (filters.agentDid) {
    grants = await prisma.userGrant.findMany({
      where: { OR: [{ agentDid: filters.agentDid }, { agentDid: null }] },
      select: { userDid: true, agentDid: true, capabilities: true },
    });
  } else if (filters.realmId) {
    // Only grants where both the user and agent are realm members
    const realmUserDids = Array.from(userDids);
    const realmAgentDids = Array.from(agentDids);
    grants = await prisma.userGrant.findMany({
      where: {
        userDid: { in: realmUserDids },
        OR: [{ agentDid: null }, { agentDid: { in: realmAgentDids } }],
      },
      select: { userDid: true, agentDid: true, capabilities: true },
    });
  } else {
    grants = await prisma.userGrant.findMany({
      select: { userDid: true, agentDid: true, capabilities: true },
    });
  }

  for (const g of grants) {
    const caps: AgentCapability[] = (g.capabilities as AgentCapability[]) ?? [];
    if (g.agentDid) {
      // Ensure both endpoints exist
      if (!nodes.has(`user:${g.userDid}`)) {
        // In focused agent view: pull in the user
        if (filters.agentDid) {
          const u = await prisma.user.findUnique({
            where: { did: g.userDid },
            select: {
              id: true,
              did: true,
              name: true,
              role: true,
              reportsTo: true,
            },
          });
          if (u) {
            addUserNode(nodes, u);
          } else continue;
        } else continue;
      }
      if (!nodes.has(`agent:${g.agentDid}`)) {
        // In focused user view: pull in the agent
        const a = await prisma.agent.findUnique({
          where: { did: g.agentDid },
          select: { did: true, name: true },
        });
        if (a) {
          addAgentNode(nodes, a, connectedDids);
        } else continue;
      }
      edges.push({
        source: `user:${g.userDid}`,
        target: `agent:${g.agentDid}`,
        type: "grant",
        label: caps.join(", "),
        capabilities: caps,
      });
    } else if (!filters.agentDid && !filters.userDid && !filters.realmId) {
      // Wildcard grant — only expand in full view to avoid flooding focused views
      for (const aDid of agentDids) {
        edges.push({
          source: `user:${g.userDid}`,
          target: `agent:${aDid}`,
          type: "grant",
          label: `* ${caps.join(", ")}`,
          capabilities: caps,
        });
      }
    }
  }

  // --- Delegation edges ---
  let delegations: Array<{
    userDid: string;
    agentDid: string;
    capabilities: unknown;
  }>;
  if (filters.agentDid) {
    delegations = await prisma.delegationCert.findMany({
      where: { agentDid: filters.agentDid },
      select: { userDid: true, agentDid: true, capabilities: true },
    });
  } else if (filters.userDid) {
    delegations = await prisma.delegationCert.findMany({
      where: { userDid: filters.userDid },
      select: { userDid: true, agentDid: true, capabilities: true },
    });
  } else if (filters.realmId) {
    // Only delegations where both user and agent are realm members
    delegations = await prisma.delegationCert.findMany({
      where: {
        userDid: { in: Array.from(userDids) },
        agentDid: { in: Array.from(agentDids) },
      },
      select: { userDid: true, agentDid: true, capabilities: true },
    });
  } else {
    delegations = await prisma.delegationCert.findMany({
      select: { userDid: true, agentDid: true, capabilities: true },
    });
  }

  for (const d of delegations) {
    if (!nodes.has(`user:${d.userDid}`) || !nodes.has(`agent:${d.agentDid}`))
      continue;
    const caps: AgentCapability[] = (d.capabilities as AgentCapability[]) ?? [];
    edges.push({
      source: `user:${d.userDid}`,
      target: `agent:${d.agentDid}`,
      type: "delegation",
      label: caps.join(", "),
      capabilities: caps,
    });
  }

  return { nodes: Array.from(nodes.values()), edges };
}
