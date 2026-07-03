import { getWSServer, initializeWSServer } from "@/lib/ws-server";
import { SettingsDAO } from "@/db";
import {
  AgentPeerjsServer,
  getPeerjsServer,
  initializePeerjsServer,
} from "@/lib/peerjs-server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

/**
 * Routes for /api/network — live transport stats plus runtime control of the
 * WebSocket and PeerJS servers.
 */
const handlers = createNextRoute(adminContract.network, {
  // ── GET /api/network ────────────────────────────────────────────────────
  get: async ({ query, request }) => {
    await getAuthContext(request); // throws UNAUTHORIZED when not signed in

    const logLimit = query.logLimit ?? 200;

    const wsServer = getWSServer();
    const stats = wsServer?.getNetworkStats() ?? null;
    const peerjsServer = getPeerjsServer();
    const peerId = await AgentPeerjsServer.getServerPeerId();
    const configuredServerUrl =
      (await SettingsDAO.get("peerjs_server_url")) ?? null;

    return {
      status: 200,
      body: {
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
      },
    };
  },

  // ── POST /api/network ───────────────────────────────────────────────────
  control: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { action, serverUrl } = body;

    // WS restart
    if (action === "restart-ws") {
      const wsServer = getWSServer();
      if (!wsServer)
        throw new APIException("UNAVAILABLE", "WebSocket server not initialized");
      const port = wsServer.wsPort;
      wsServer.shutdown();
      initializeWSServer(port);
      return { status: 200, body: { ok: true, restarted: true, port } };
    }

    // PeerJS stop
    if (action === "stop") {
      const server = getPeerjsServer();
      if (server) server.shutdown();
      await SettingsDAO.set("peerjs_enabled", "false");
      return { status: 200, body: { ok: true, running: false } };
    }

    // PeerJS start / restart
    const existing = getPeerjsServer();
    if (existing?.isRunning) existing.shutdown();

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not initialized");

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
    return { status: 200, body: { ok: true, running: true, peerId } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
