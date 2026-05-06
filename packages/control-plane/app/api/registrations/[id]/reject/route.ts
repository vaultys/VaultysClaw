import { NextRequest, NextResponse } from "next/server";
import { getPendingRegistration } from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";

/**
 * POST /api/registrations/[id]/reject
 * Reject a pending registration
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason: string = body.reason ?? "Registration rejected by admin";

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

    const success = wsServer.rejectRegistration(id, reason);
    if (!success) {
      return NextResponse.json(
        { error: "Agent connection no longer available" },
        { status: 410 }
      );
    }

    return NextResponse.json({ success: true, registrationId: id });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to reject registration" },
      { status: 500 }
    );
  }
}
