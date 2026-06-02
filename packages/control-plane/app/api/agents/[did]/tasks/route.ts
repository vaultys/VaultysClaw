/**
 * POST /api/agents/[did]/tasks — Enqueue a task on an agent via WS
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { did } = await params;
  const agentDid = decodeURIComponent(did);

  if (!auth.canAccessAgent(agentDid)) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: "WebSocket server not available" }, { status: 503 });
  }

  const body = await request.json();
  const { action, params: taskParams } = body as {
    action?: string;
    params?: Record<string, unknown>;
  };

  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "action (string) is required" }, { status: 400 });
  }

  const ok = wsServer.sendTaskToAgent(agentDid, action, taskParams ?? {});
  if (!ok) {
    return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
  }

  return NextResponse.json({ success: true, agentId: agentDid, action });
}
