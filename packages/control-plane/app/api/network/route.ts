import { NextRequest, NextResponse } from "next/server";
import { getWSServer, initializeWSServer } from "@/lib/ws-server";
import { AgentPeerjsServer, getPeerjsServer, initializePeerjsServer } from "@/lib/peerjs-server";
import { getSetting, setSetting } from "@/lib/db";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";

/**
 * GET /api/network
 * Returns live transport stats, per-transport logs, and PeerJS server state.
 */
export async function GET(req: Request) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { searchParams } = new URL(req.url);
  const logLimit = Math.min(500, parseInt(searchParams.get("logLimit") ?? "200", 10) || 200);

  const wsServer = getWSServer();
  const stats = wsServer?.getNetworkStats() ?? null;
  const peerjsServer = getPeerjsServer();
  const peerId = AgentPeerjsServer.getServerPeerId();
  const configuredServerUrl = getSetting("peerjs_server_url") ?? null;

  return NextResponse.json({
    stats,
    logs: {
      ws: wsServer?.getLogs("ws", logLimit) ?? [],
      peerjs: wsServer?.getLogs("peerjs", logLimit) ?? [],
    },
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
 * Control WS and PeerJS servers at runtime.
 * Body: { action: "start" | "stop" | "restart-ws" | "restart-peerjs", serverUrl?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth || !auth.isGlobalAdmin) return unauthorized();

  const body = await req.json() as {
    action: "start" | "stop" | "restart-ws" | "restart-peerjs";
    serverUrl?: string | null;
  };
  const { action, serverUrl } = body;

  // ── WS restart ──────────────────────────────────────────────────────────────
  if (action === "restart-ws") {
    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json({ error: "WebSocket server not initialized" }, { status: 503 });
    }
    const port = wsServer.wsPort;
    wsServer.shutdown();
    initializeWSServer(port);
    return NextResponse.json({ ok: true, restarted: true, port });
  }

  // ── PeerJS stop ─────────────────────────────────────────────────────────────
  if (action === "stop") {
    const server = getPeerjsServer();
    if (server) server.shutdown();
    setSetting("peerjs_enabled", "false");
    return NextResponse.json({ ok: true, running: false });
  }

  // ── PeerJS start ─────────────────────────────────────────────────────────────
  if (action === "start" || action === "restart-peerjs") {
    // Stop if already running
    const existing = getPeerjsServer();
    if (existing?.isRunning) existing.shutdown();

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json({ error: "WebSocket server not initialized" }, { status: 503 });
    }

    const resolvedUrl =
      serverUrl !== undefined
        ? serverUrl ?? undefined
        : getSetting("peerjs_server_url") || undefined;

    if (serverUrl !== undefined) {
      setSetting("peerjs_server_url", serverUrl ?? "");
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
