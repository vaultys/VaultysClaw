import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { GrantDao } from "@/lib/grant-dao";
import { getWSServer } from "@/lib/ws-server";

/**
 * POST /api/intents
 * Send an intent to one or more agents.
 * Owners can send any intent; non-owners must have an active grant covering
 * the target agent + action (capability).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { agentId, action, params, broadcastCapability } = body;

    // Non-owner delegation check
    if (!session.user.isAdmin) {
      const capability: string = action ?? broadcastCapability;
      if (!capability) {
        return NextResponse.json({ error: "action or broadcastCapability required" }, { status: 400 });
      }

      const targetAgentId: string | null = agentId ?? null;

      // Check if user has a grant covering this agent + capability
      const grants = GrantDao.listByUser(session.user.did);
      const hasGrant = grants.some((g) => {
        const caps = JSON.parse(g.capabilities) as string[];
        const agentMatch = g.agent_did === null || g.agent_did === targetAgentId;
        const capMatch = caps.includes(capability);
        const notExpired = !g.expires_at || new Date(g.expires_at) > new Date();
        return agentMatch && capMatch && notExpired;
      });

      if (!hasGrant) {
        return NextResponse.json(
          { error: "No grant found for this agent/capability" },
          { status: 403 },
        );
      }
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json(
        { error: "WebSocket server not initialized" },
        { status: 503 }
      );
    }

    const intentId = `intent-${Date.now()}`;
    let sentTo: string[] = [];
    // Pass userDid to agent for delegation verification when the caller is not the owner
    const intentUserDid = session.user.isAdmin ? undefined : session.user.did;

    if (broadcastCapability) {
      // Broadcast to all agents with specific capability
      sentTo = wsServer.broadcastIntentToCapability(
        broadcastCapability,
        intentId,
        action,
        params,
        intentUserDid,
      );

      if (sentTo.length === 0) {
        return NextResponse.json(
          { error: "No agents with required capability" },
          { status: 404 }
        );
      }
    } else if (agentId) {
      // Send to specific agent
      const success = wsServer.sendIntentToAgent(agentId, intentId, action, params, intentUserDid);

      if (!success) {
        return NextResponse.json(
          { error: "Agent not found or not connected" },
          { status: 404 }
        );
      }

      sentTo = [agentId];
    } else {
      return NextResponse.json(
        { error: "Must specify agentId or broadcastCapability" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        intentId,
        action,
        sentTo,
        count: sentTo.length,
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send intent" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/intents
 * List recent intents (placeholder)
 */
export async function GET() {
  try {
    // TODO: Query SQLite for recent intents with results

    return NextResponse.json({
      intents: [],
      message: "Intent history tracking coming soon",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch intents" },
      { status: 500 }
    );
  }
}
