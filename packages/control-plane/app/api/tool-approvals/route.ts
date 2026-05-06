/**
 * GET  /api/tool-approvals          — List pending tool approval requests
 * POST /api/tool-approvals          — Respond to a tool approval request
 */

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWSServer } from "@/lib/ws-server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: "WebSocket server not available" }, { status: 503 });
  }

  const approvals = wsServer.getPendingToolApprovals();
  return NextResponse.json({ approvals });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: "WebSocket server not available" }, { status: 503 });
  }

  const body = await request.json();
  const { requestId, approved, reason } = body as {
    requestId?: string;
    approved?: boolean;
    reason?: string;
  };

  if (!requestId || typeof approved !== "boolean") {
    return NextResponse.json(
      { error: "requestId (string) and approved (boolean) are required" },
      { status: 400 },
    );
  }

  const ok = wsServer.respondToToolApproval(requestId, approved, reason);
  if (!ok) {
    return NextResponse.json(
      { error: "Approval request not found or agent disconnected" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, requestId, approved });
}
