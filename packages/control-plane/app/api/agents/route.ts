import { NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { AgentDAO, RealmDAO } from "@/db";

/**
 * GET /api/agents
 * List agents with optional pagination and filters.
 * Admins see all; members see only agents in their realms.
 *
 * Query params:
 *   q            – search by name or capability (case-insensitive)
 *   online       – "true" | "false"
 *   realm        – realm id or slug
 *   capabilities – comma-separated capability names (e.g., "file_access,code_execution")
 *   page         – page number (default 1)
 *   pageSize     – items per page (default 20, max 100)
 *   sortBy       – name | lastSeen | registeredAt (default lastSeen)
 *   sortDir      – asc | desc (default desc)
 */
/**
 * @openapi
 * /api/agents:
 *   get:
 *     summary: List agents with optional pagination and filters.
 *     tags: [Agents]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search by name or capability (case-insensitive).
 *       - in: query
 *         name: online
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by online status.
 *       - in: query
 *         name: realm
 *         schema:
 *           type: string
 *         description: Realm id or slug.
 *       - in: query
 *         name: capabilities
 *         schema:
 *           type: string
 *         description: Comma-separated capability names (e.g., "file_access,code_execution").
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number.
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, lastSeen, registeredAt]
 *           default: lastSeen
 *         description: Sort by field.
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction.
 *     responses:
 *       200:
 *         description: A list of agents.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Agent'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pageSize:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 online:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to fetch agents.
 */
export async function GET(request?: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();

    const { searchParams } = new URL(
      request?.url ?? "http://localhost/api/agents"
    );
    const q = searchParams.get("q") ?? undefined;
    const onlineFilter = searchParams.get("online");
    const realm = searchParams.get("realm") ?? undefined;
    const capStr = searchParams.get("capabilities");
    const capabilities = capStr
      ? capStr
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : undefined;
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") ?? "1", 10) || 1
    );
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );
    const sortBy = (searchParams.get("sortBy") ?? "lastSeen") as
      | "name"
      | "lastSeen"
      | "registeredAt";
    const sortDir = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";

    const wsServer = getWSServer();
    const connectedDids = new Set(
      wsServer?.getConnectedAgents().map((a) => a.id) ?? []
    );

    const online =
      onlineFilter === "true"
        ? true
        : onlineFilter === "false"
          ? false
          : undefined;

    const result = await AgentDAO.query({
      q,
      realm,
      capabilities,
      page,
      pageSize,
      sortBy,
      sortDir,
    });

    // For non-admins, filter to agents in the user's realms
    const userRealmIds = auth.isGlobalAdmin
      ? null
      : new Set((await RealmDAO.getUserRealms(auth.did)).map((r) => r.realmId));

    // Filter by realm access and online status, then enrich with runtime data
    const filteredAgents = (
      await Promise.all(
        result.agents.map(async (agent) => {
          if (userRealmIds !== null) {
            const agentRealms = await AgentDAO.getRealms(agent.did);
            if (!agentRealms.some((r) => userRealmIds.has(r.realmId)))
              return null;
          }
          return agent;
        })
      )
    ).filter((a) => a !== null);

    const onlineFiltered =
      online === undefined
        ? filteredAgents
        : filteredAgents.filter((agent) =>
            online
              ? connectedDids.has(agent.did)
              : !connectedDids.has(agent.did)
          );

    const agents = await Promise.all(
      onlineFiltered.map(async (agent) => {
        const connected = wsServer?.getAgent(agent.did);
        const realms = await AgentDAO.getRealms(agent.did);
        return {
          id: agent.did,
          name: connected?.name ?? agent.name,
          capabilities: agent.capabilities,
          registeredAt: agent.registeredAt,
          lastSeen: agent.lastSeen,
          online: connectedDids.has(agent.did),
          connectedAt: connected?.connectedAt?.toISOString() ?? null,
          lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
          reportedLlm: connected?.reportedLlm ?? null,
          tokenUsage: connected?.tokenUsage ?? null,
          transport: connected?.transport ?? null,
          realms: realms.map((r) => ({
            id: r.realmId,
            name: r.realm.name,
            slug: r.realm.slug,
            color: r.realm.color,
            isPrimary: Boolean(r.isPrimary),
          })),
        };
      })
    );

    return NextResponse.json({
      agents,
      total: userRealmIds !== null ? agents.length : result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages:
        userRealmIds !== null
          ? Math.ceil(agents.length / pageSize)
          : result.totalPages,
      online: agents.filter((a) => a.online).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}
