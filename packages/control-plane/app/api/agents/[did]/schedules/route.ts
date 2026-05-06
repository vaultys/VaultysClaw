/**
 * POST   /api/agents/[did]/schedules          — Upsert a schedule on an agent
 * DELETE /api/agents/[did]/schedules          — Delete a schedule on an agent
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
  const { id, name, cron, action, params: schedParams, enabled } = body as {
    id?: string;
    name?: string;
    cron?: string;
    action?: string;
    params?: Record<string, unknown>;
    enabled?: boolean;
  };

  if (!id || !name || !cron || !action) {
    return NextResponse.json(
      { error: "id, name, cron, and action are required strings" },
      { status: 400 },
    );
  }

  const ok = wsServer.sendScheduleToAgent(did, {
    id, name, cron, action,
    params: schedParams ?? {},
    enabled: enabled !== false,
  });
  if (!ok) {
    return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
  }

  return NextResponse.json({ success: true, agentId: did, scheduleId: id });
}

export async function DELETE(
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
  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get("id");

  if (!scheduleId) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  const ok = wsServer.deleteScheduleOnAgent(did, scheduleId);
  if (!ok) {
    return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
  }

  return NextResponse.json({ success: true, agentId: did, scheduleId });
}
