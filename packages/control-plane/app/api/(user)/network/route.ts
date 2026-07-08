import { getWSServer } from "@/lib/ws-server";
import { AgentPeerjsServer, getPeerjsServer } from "@/lib/peerjs-server";
import { SettingsDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

/**
 * GET /api/network — live transport stats and server state. Any authenticated
 * user can read; runtime control (POST) is admin-only, see
 * app/api/admin/network/route.ts.
 */
const handlers = createNextRoute(userContract.network, {
  get: async ({ query, request }) => {

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
});

export const GET = handlers.GET!;
