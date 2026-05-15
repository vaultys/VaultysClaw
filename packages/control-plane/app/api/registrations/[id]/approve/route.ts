import { NextRequest, NextResponse } from "next/server";
import { getPendingRegistration, addAgentToRealm, getAllRealms } from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";
import type { AgentCapability } from "@vaultysclaw/shared";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * POST /api/registrations/[id]/approve
 * Approve a pending registration with selected capabilities and optional realm assignments
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    const body = await request.json();
    const capabilities: AgentCapability[] = body.capabilities;
    const realmIds: string[] = Array.isArray(body.realmIds) ? body.realmIds : [];

    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      return NextResponse.json(
        { error: "At least one capability must be assigned" },
        { status: 400 }
      );
    }

    const registration = getPendingRegistration(id);
    if (!registration) {
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    if (registration.status !== "pending") {
      return NextResponse.json(
        { error: `Registration already ${registration.status}` },
        { status: 409 }
      );
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json(
        { error: "WebSocket server not available" },
        { status: 503 }
      );
    }

    const success = wsServer.approveRegistration(id, capabilities);
    if (!success) {
      return NextResponse.json(
        { error: "Agent connection no longer available" },
        { status: 410 }
      );
    }

    // Enroll agent in additional selected realms (default realm is already enrolled via ws-server)
    if (realmIds.length > 0) {
      const allRealms = getAllRealms();
      const defaultRealm = allRealms.find((r) => r.is_default === 1);
      for (const rid of realmIds) {
        // Skip if it's the default realm (already enrolled)
        if (defaultRealm && rid === defaultRealm.id) continue;
        try { addAgentToRealm(registration.agent_did, rid, false); } catch { /* already member */ }
      }
    }

    return NextResponse.json({ success: true, registrationId: id, capabilities });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to approve registration" },
      { status: 500 }
    );
  }
}
