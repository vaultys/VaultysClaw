import { getWSServer } from "@/lib/ws-server";
import { ProxyDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import type { ProxyInfo } from "@/lib/contracts";

const handlers = createNextRoute(adminContract.proxies, {
  // ── GET /api/admin/proxies ──────────────────────────────────────────────
  list: async () => {
    const proxies = await ProxyDAO.findAll();
    const wsServer = getWSServer();

    const body: ProxyInfo[] = proxies.map((proxy) => {
      const connected = wsServer?.getProxy(proxy.did);
      return {
        ...proxy,
        online: !!connected,
        connectedAt: connected?.connectedAt ?? null,
        lastHeartbeat: connected?.lastHeartbeat ?? null,
        transport: connected ? connected.transport : null,
      };
    });

    return { status: 200, body };
  },
});

export const GET = handlers.GET!;
