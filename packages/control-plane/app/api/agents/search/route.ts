import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { getAllAgents, getRealmAgents } from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";

/**
 * GET /api/agents/search?q=...&realm=<realmId>
 *
 * Search for agents by name or DID.
 * When `realm` is provided, only agents in that realm are returned.
 * Each agent is enriched with a real-time `online` field sourced from
 * the WebSocket server's in-memory connection map.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { searchParams } = new URL(req.url);
    const query  = searchParams.get("q")?.toLowerCase() ?? "";
    const realmId = searchParams.get("realm");

    // --- Fetch agent list ------------------------------------------------
    let agentList: { did: string; name: string; capabilities?: string | null }[];

    if (realmId && realmId !== "default") {
      // Realm-scoped: only members of this realm
      agentList = getRealmAgents(realmId).map((ra) => ({
        did:          ra.agent_did,
        name:         ra.agent_name,
        capabilities: (ra as any).capabilities ?? null,
      }));
    } else {
      agentList = getAllAgents().map((a) => ({
        did:          a.did,
        name:         a.name,
        capabilities: (a as any).capabilities ?? null,
      }));
    }

    // --- Real-time online status from WebSocket server -------------------
    const wsServer = getWSServer();
    const connectedDids = new Set(
      wsServer?.getConnectedAgents().map((ca) => ca.id) ?? [],
    );

    // --- Filter by query -------------------------------------------------
    const matches = agentList.filter((a) => {
      if (!query) return true;
      return (
        (a.name ?? "").toLowerCase().includes(query) ||
        (a.did ?? "").toLowerCase().includes(query)
      );
    });

    return NextResponse.json({
      agents: matches.slice(0, 20).map((a) => ({
        id:           a.did, // @deprecated use `did`
        did:          a.did,
        name:         a.name,
        capabilities: (() => { try { return JSON.parse(a.capabilities ?? "[]"); } catch { return []; } })(),
        online:       connectedDids.has(a.did),
      })),
    });
  } catch (err) {
    console.error("GET /api/agents/search error:", err);
    return NextResponse.json(
      { error: "Failed to search agents" },
      { status: 500 }
    );
  }
}
