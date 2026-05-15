import { NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAllAgents, getAgentRealms, getRealmById } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * GET /api/agents/search?realm=[realmId]&q=[search query]
 * List agents filtered by realm. Requires auth and realm membership.
 */
export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { searchParams } = new URL(request.url);
    const realmId = searchParams.get("realm");
    const query = searchParams.get("q")?.toLowerCase() || "";

    if (!realmId) {
      return NextResponse.json({ error: "Missing realm parameter" }, { status: 400 });
    }

    if (!auth.canAccessRealm(realmId)) return forbidden();

    // Verify realm exists
    const realm = getRealmById(realmId);
    if (!realm) {
      return NextResponse.json({ error: "Realm not found" }, { status: 404 });
    }

    const wsServer = getWSServer();
    const dbAgents = getAllAgents();
    const connectedDids = new Set(
      wsServer?.getConnectedAgents().map((a) => a.id) ?? []
    );

    // Filter agents by realm, then by search query
    const agentsInRealm = dbAgents
      .filter((agent) => {
        const realms = getAgentRealms(agent.did);
        return realms.some((r) => r.realm_id === realmId);
      })
      .map((agent) => {
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
            id: r.realm_id,
            name: r.name,
            slug: r.slug,
            color: r.color,
            isPrimary: Boolean(r.is_primary),
          })),
        };
      });

    // Apply search filter if query is provided
    let filtered = agentsInRealm;
    if (query) {
      filtered = agentsInRealm.filter((agent) => {
        const nameMatch = agent.name.toLowerCase().includes(query);
        const capMatch = agent.capabilities.some((cap: string) =>
          cap.toLowerCase().includes(query)
        );
        return nameMatch || capMatch;
      });
    }

    return NextResponse.json({
      agents: filtered,
      total: filtered.length,
      online: filtered.filter((a) => a.online).length,
      realm: {
        id: realm.id,
        name: realm.name,
        slug: realm.slug,
        color: realm.color,
      },
    });
  } catch (error) {
    console.error("Failed to search agents:", error);
    return NextResponse.json({ error: "Failed to search agents" }, { status: 500 });
  }
}
