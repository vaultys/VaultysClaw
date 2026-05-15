/**
 * GET /api/agents/[did]/chat-sessions          — list sessions
 * GET /api/agents/[did]/chat-sessions?session= — full history for one session
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const { did: rawDid } = await params;
  const did = decodeURIComponent(rawDid);

  if (!auth.canAccessAgent(did)) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: "WebSocket server not available" }, { status: 503 });
  }

  const sessionId = request.nextUrl.searchParams.get("session");

  try {
    if (sessionId) {
      const messages = await wsServer.getChatHistory(did, sessionId);
      return NextResponse.json({ messages });
    } else {
      const sessions = await wsServer.getChatSessions(did);
      return NextResponse.json({ sessions });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
