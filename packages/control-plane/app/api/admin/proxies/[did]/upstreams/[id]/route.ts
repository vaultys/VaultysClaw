import { getWSServer } from "@/lib/ws-server";
import { ProxyUpstreamDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.proxies, {
  // ── PATCH /api/admin/proxies/:did/upstreams/:id ──────────────────────────
  updateUpstream: async ({ params, body }) => {
    const upstream = await ProxyUpstreamDAO.update(params.id, body);
    getWSServer()?.pushProxyConfig(params.did);
    return { status: 200, body: upstream };
  },

  // ── DELETE /api/admin/proxies/:did/upstreams/:id ─────────────────────────
  deleteUpstream: async ({ params }) => {
    await ProxyUpstreamDAO.delete(params.id);
    getWSServer()?.pushProxyConfig(params.did);
    return { status: 204, body: undefined };
  },
});

export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
