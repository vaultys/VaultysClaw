import { getWSServer } from "@/lib/ws-server";
import { ProxyDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import type { ProxyInfo } from "@/lib/contracts";

/**
 * Routes for /api/admin/proxies/:did — the `:did`-level slice of
 * `adminContract.proxies`. Sub-resources (upstreams/rules/principals/logs)
 * are served by their own route.ts files under this directory.
 */
const handlers = createNextRoute(adminContract.proxies, {
  // ── GET /api/admin/proxies/:did ──────────────────────────────────────────
  getProxy: async ({ params }) => {
    const proxy = await ProxyDAO.findByDid(params.did);
    if (!proxy) throw new APIException("NOT_FOUND", "Proxy not found");

    const connected = getWSServer()?.getProxy(params.did);
    const body: ProxyInfo = {
      ...proxy,
      online: !!connected,
      connectedAt: connected?.connectedAt ?? null,
      lastHeartbeat: connected?.lastHeartbeat ?? null,
      transport: connected ? connected.transport : null,
    };
    return { status: 200, body };
  },

  // ── PATCH /api/admin/proxies/:did ────────────────────────────────────────
  updateProxy: async ({ params, body }) => {
    const existing = await ProxyDAO.findByDid(params.did);
    if (!existing) throw new APIException("NOT_FOUND", "Proxy not found");

    if (body.defaultMode !== undefined) {
      await ProxyDAO.updateDefaultMode(params.did, body.defaultMode);
    }
    if (body.name !== undefined) {
      await ProxyDAO.upsert({ did: params.did, name: body.name });
    }

    getWSServer()?.pushProxyConfig(params.did);

    const updated = await ProxyDAO.findByDid(params.did);
    const connected = getWSServer()?.getProxy(params.did);
    return {
      status: 200,
      body: {
        ...updated!,
        online: !!connected,
        connectedAt: connected?.connectedAt ?? null,
        lastHeartbeat: connected?.lastHeartbeat ?? null,
        transport: connected ? connected.transport : null,
      },
    };
  },

  // ── DELETE /api/admin/proxies/:did ───────────────────────────────────────
  deleteProxy: async ({ params }) => {
    const existing = await ProxyDAO.findByDid(params.did);
    if (!existing) throw new APIException("NOT_FOUND", "Proxy not found");

    getWSServer()?.disconnectProxy(params.did);
    await ProxyDAO.delete(params.did);

    return { status: 204, body: undefined };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
