import { NextRequest, NextResponse } from "next/server";
import { getWSServer, initializeWSServer } from "@/lib/ws-server";
import { SettingsDAO } from "@/db";
import {
  AgentPeerjsServer,
  getPeerjsServer,
  initializePeerjsServer,
} from "@/lib/peerjs-server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, unavailable } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * GET /api/network
 * Returns live transport stats, per-transport logs, and PeerJS server state.
 */
/**
 * @openapi
 * /api/network:
 *   get:
 *     summary: Retrieve live transport stats and server state.
 *     tags: [Network]
 *     responses:
 *       200:
 *         description: Successful response with network stats and logs.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   nullable: true
 *                 logs:
 *                   type: object
 *                   properties:
 *                     ws:
 *                       type: array
 *                       items:
 *                         type: string
 *                     peerjs:
 *                       type: array
 *                       items:
 *                         type: string
 *                 peerjs:
 *                   type: object
 *                   properties:
 *                     peerId:
 *                       type: string
 *                       nullable: true
 *                     running:
 *                       type: boolean
 *                     startedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     serverUrl:
 *                       type: string
 *                       nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const GET = withError(async (req: Request) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { searchParams } = new URL(req.url);
  const logLimit = Math.min(
    500,
    parseInt(searchParams.get("logLimit") ?? "200", 10) || 200
  );

  const wsServer = getWSServer();
  const stats = wsServer?.getNetworkStats() ?? null;
  const peerjsServer = getPeerjsServer();
  const peerId = await AgentPeerjsServer.getServerPeerId();
  const configuredServerUrl =
    (await SettingsDAO.get("peerjs_server_url")) ?? null;

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
      serverUrl:
        peerjsServer?.signalingServerUrl ?? configuredServerUrl ?? null,
    },
  });
});

/**
 * POST /api/network
 * Control WS and PeerJS servers at runtime.
 * Body: { action: "start" | "stop" | "restart-ws" | "restart-peerjs", serverUrl?: string }
 */
/**
 * @openapi
 * /api/network:
 *   post:
 *     summary: Control WS and PeerJS servers at runtime.
 *     tags: [Network]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: ["start", "stop", "restart-ws", "restart-peerjs"]
 *               serverUrl:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Successfully controlled the servers.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         description: WebSocket server not initialized.
 *       500:
 *         description: Failed to start PeerJS server.
 */
export const POST = withError(async (req: NextRequest) => {
  const auth = await getAuthContext(req);
  if (!auth || !auth.isGlobalAdmin) return unauthorized();

  const body = (await req.json()) as {
    action: "start" | "stop" | "restart-ws" | "restart-peerjs";
    serverUrl?: string | null;
  };
  const { action, serverUrl } = body;

  // ── WS restart ──────────────────────────────────────────────────────────────
  if (action === "restart-ws") {
    const wsServer = getWSServer();
    if (!wsServer) {
      return unavailable("WebSocket server not initialized");
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
    await SettingsDAO.set("peerjs_enabled", "false");
    return NextResponse.json({ ok: true, running: false });
  }

  // ── PeerJS start ─────────────────────────────────────────────────────────────
  if (action === "start" || action === "restart-peerjs") {
    // Stop if already running
    const existing = getPeerjsServer();
    if (existing?.isRunning) existing.shutdown();

    const wsServer = getWSServer();
    if (!wsServer) {
      return unavailable("WebSocket server not initialized");
    }

    const resolvedUrl =
      serverUrl !== undefined
        ? (serverUrl ?? undefined)
        : (await SettingsDAO.get("peerjs_server_url")) || undefined;

    if (serverUrl !== undefined) {
      await SettingsDAO.set("peerjs_server_url", serverUrl ?? "");
    }
    await SettingsDAO.set("peerjs_enabled", "true");

    const server = initializePeerjsServer(wsServer, resolvedUrl || undefined);
    const peerId = await server.start();
    return NextResponse.json({ ok: true, running: true, peerId });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
});
