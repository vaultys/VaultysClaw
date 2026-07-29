import { getWSServer } from "@/lib/ws-server";
import { ProxyDAO, ProxyUpstreamDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.proxies, {
  // ── GET /api/admin/proxies/:did/upstreams ────────────────────────────────
  listUpstreams: async ({ params }) => {
    const proxy = await ProxyDAO.findByDid(params.did);
    if (!proxy) throw new APIException("NOT_FOUND", "Proxy not found");
    const upstreams = await ProxyUpstreamDAO.listByProxy(params.did);
    return { status: 200, body: upstreams };
  },

  // ── POST /api/admin/proxies/:did/upstreams ───────────────────────────────
  createUpstream: async ({ params, body }) => {
    const proxy = await ProxyDAO.findByDid(params.did);
    if (!proxy) throw new APIException("NOT_FOUND", "Proxy not found");

    const upstream = await ProxyUpstreamDAO.create({
      proxyDid: params.did,
      name: body.name,
      baseUrl: body.baseUrl,
    });
    getWSServer()?.pushProxyConfig(params.did);

    return { status: 201, body: upstream };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
