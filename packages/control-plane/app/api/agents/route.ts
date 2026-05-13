import { NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAllAgents, getAgentRealms } from "@/lib/db";

/**
 * GET /api/agents
 * List all known agents (registered in DB) with live connection status
 */
export async function GET() {
  try {
    const wsServer = getWSServer();
    const dbAgents = getAllAgents();

    const connectedDids = new Set(
      wsServer?.getConnectedAgents().map((a) => a.id) ?? []
    );

    const agents = dbAgents.map((agent) => {
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
      total: agents.length,
      online: agents.filter((a) => a.online).length,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
