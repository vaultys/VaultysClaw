/**
 * POST   /api/agents/[did]/schedules          — Upsert a schedule on an agent
 * DELETE /api/agents/[did]/schedules          — Delete a schedule on an agent
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const { did } = await params;
  const agentDid = decodeURIComponent(did);

  if (!auth.canAdminAgent(agentDid)) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: "WebSocket server not available" }, { status: 503 });
  }

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

  const ok = wsServer.sendScheduleToAgent(agentDid, {
    id, name, cron, action,
    params: schedParams ?? {},
    enabled: enabled !== false,
  });
  if (!ok) {
    return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
  }

  return NextResponse.json({ success: true, agentId: agentDid, scheduleId: id });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const { did } = await params;
  const agentDid = decodeURIComponent(did);

  if (!auth.canAdminAgent(agentDid)) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: "WebSocket server not available" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get("id");

  if (!scheduleId) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  const ok = wsServer.deleteScheduleOnAgent(agentDid, scheduleId);
  if (!ok) {
    return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
  }

  return NextResponse.json({ success: true, agentId: agentDid, scheduleId });
}
