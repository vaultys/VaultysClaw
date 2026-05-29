import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { AgentPeerjsServer, getPeerjsServer, initializePeerjsServer } from "@/lib/peerjs-server";
import { getSetting, setSetting } from "@/lib/db";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";

/**
 * GET /api/network
 * Returns live transport stats (WS + PeerJS) and PeerJS server state.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const wsServer = getWSServer();
  const stats = wsServer?.getNetworkStats() ?? null;
  const peerjsServer = getPeerjsServer();
  const peerId = AgentPeerjsServer.getServerPeerId();
  const configuredServerUrl = getSetting("peerjs_server_url") ?? null;

  return NextResponse.json({
    stats,
    peerjs: {
      peerId,
      running: peerjsServer?.isRunning ?? false,
      startedAt: peerjsServer?.startedAt ?? null,
      serverUrl: peerjsServer?.signalingServerUrl ?? configuredServerUrl ?? null,
    },
  });
}

/**
 * POST /api/network
 * Control PeerJS server at runtime.
 * Body: { action: "start" | "stop", serverUrl?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth || !auth.isGlobalAdmin) return unauthorized();

  const body = await req.json() as { action: "start" | "stop"; serverUrl?: string | null };
  const { action, serverUrl } = body;

  if (action === "stop") {
    const server = getPeerjsServer();
    if (server) server.shutdown();
    setSetting("peerjs_enabled", "false");
    return NextResponse.json({ ok: true, running: false });
  }

  if (action === "start") {
    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json({ error: "WebSocket server not initialized" }, { status: 503 });
    }

    const resolvedUrl = serverUrl !== undefined ? (serverUrl ?? undefined) : (getSetting("peerjs_server_url") ?? undefined);
    if (serverUrl !== undefined) {
      if (serverUrl) setSetting("peerjs_server_url", serverUrl);
      else {
        // clear it — use public relay
        try { setSetting("peerjs_server_url", ""); } catch { /* key may not exist yet */ }
      }
    }
    setSetting("peerjs_enabled", "true");

    const server = initializePeerjsServer(wsServer, resolvedUrl || undefined);
    try {
      const peerId = await server.start();
      return NextResponse.json({ ok: true, running: true, peerId });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to start PeerJS server" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
