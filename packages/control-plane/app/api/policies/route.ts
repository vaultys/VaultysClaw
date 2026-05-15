import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * POST /api/policies
 * Create a new policy for an agent. Global admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const body = await request.json();
    const { agentId, capabilities, resourceLimits, broadcast } = body;

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json(
        { error: "WebSocket server not initialized" },
        { status: 503 }
      );
    }

    const policyId = `policy-${Date.now()}`;

    // Create policy object
    const policy = {
      id: policyId,
      agentId,
      capabilities,
      resourceLimits,
      createdAt: new Date().toISOString(),
      // TODO: Sign with control plane private key
      signature: "temp-signature",
    };

    let sentTo: string[] = [];

    if (broadcast) {
      // Send to all connected agents
      sentTo = wsServer.broadcastPolicyUpdate(policy);
    } else if (agentId) {
      // Send to specific agent
      const success = wsServer.sendPolicyUpdate(agentId, policy);

      if (!success) {
        return NextResponse.json(
          { error: "Agent not found or not connected" },
          { status: 404 }
        );
      }

      sentTo = [agentId];
    } else {
      return NextResponse.json(
        { error: "Must specify agentId or broadcast: true" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        id: policyId,
        agentId,
        capabilities,
        sentTo,
        message: "Policy created and distributed",
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create policy" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/policies
 * List all policies. Global admin only.
 */
export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();
    // TODO: Query SQLite for policies

    return NextResponse.json({
      policies: [],
      message: "Policy storage and history coming soon",
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch policies" }, { status: 500 });
  }
}
