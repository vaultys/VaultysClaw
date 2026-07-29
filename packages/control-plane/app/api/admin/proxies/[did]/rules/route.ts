import { getWSServer } from "@/lib/ws-server";
import { ProxyDAO, ProxyRuleDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.proxies, {
  // ── GET /api/admin/proxies/:did/rules ────────────────────────────────────
  listRules: async ({ params }) => {
    const proxy = await ProxyDAO.findByDid(params.did);
    if (!proxy) throw new APIException("NOT_FOUND", "Proxy not found");
    const rules = await ProxyRuleDAO.listByProxy(params.did);
    return { status: 200, body: rules };
  },

  // ── POST /api/admin/proxies/:did/rules ───────────────────────────────────
  createRule: async ({ params, body }) => {
    const proxy = await ProxyDAO.findByDid(params.did);
    if (!proxy) throw new APIException("NOT_FOUND", "Proxy not found");

    const rule = await ProxyRuleDAO.create({
      proxyDid: params.did,
      method: body.method,
      urlPattern: body.urlPattern,
      mode: body.mode,
      governanceRule: body.governanceRule,
      principalIdSource: body.principalIdSource,
    });
    getWSServer()?.pushProxyConfig(params.did);

    return { status: 201, body: rule };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
