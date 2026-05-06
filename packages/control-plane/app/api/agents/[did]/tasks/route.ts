/**
 * POST /api/agents/[did]/tasks — Enqueue a task on an agent via WS
 */

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWSServer } from "@/lib/ws-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: "WebSocket server not available" }, { status: 503 });
  }

  const { did } = await params;
  const body = await request.json();
  const { action, params: taskParams } = body as {
    action?: string;
    params?: Record<string, unknown>;
  };

  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "action (string) is required" }, { status: 400 });
  }

  const ok = wsServer.sendTaskToAgent(did, action, taskParams ?? {});
  if (!ok) {
    return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
  }

  return NextResponse.json({ success: true, agentId: did, action });
}
