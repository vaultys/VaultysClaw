import { NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAllAgents, getAgentRealms, queryAgents } from "@/lib/db";

/**
 * GET /api/agents
 * List agents with optional pagination and filters.
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
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const onlineFilter = searchParams.get("online");
    const realm = searchParams.get("realm") ?? undefined;
    const capStr = searchParams.get("capabilities");
    const capabilities = capStr ? capStr.split(",").map((c) => c.trim()).filter(Boolean) : undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));
    const sortBy = (searchParams.get("sortBy") ?? "lastSeen") as "name" | "lastSeen" | "registeredAt";
    const sortDir = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";

    const wsServer = getWSServer();
    const connectedDids = new Set(wsServer?.getConnectedAgents().map((a) => a.id) ?? []);

    const online = onlineFilter === "true" ? true : onlineFilter === "false" ? false : undefined;

    const result = queryAgents({ q, online, onlineDids: connectedDids, realm, capabilities, page, pageSize, sortBy, sortDir });

    const agents = result.agents.map((agent) => {
      const connected = wsServer?.getAgent(agent.did);
      const realms = getAgentRealms(agent.did);
      return {
        id: agent.did,
        name: connected?.name ?? agent.name,
        capabilities: JSON.parse(agent.capabilities),
        registeredAt: agent.registered_at,
        lastSeen: agent.last_seen,
        online: connectedDids.has(agent.did),
        connectedAt: connected?.connectedAt?.toISOString() ?? null,
        lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
        reportedLlm: connected?.reportedLlm ?? null,
        tokenUsage: connected?.tokenUsage ?? null,
        realms: realms.map((r) => ({
          id: r.realm_id, name: r.name, slug: r.slug,
          color: r.color, isPrimary: Boolean(r.is_primary),
        })),
      };
    });

    return NextResponse.json({
      agents,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      online: agents.filter((a) => a.online).length,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
