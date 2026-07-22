import { ProxyDAO, ProxyPrincipalDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.proxies, {
  // ── GET /api/admin/proxies/:did/principals ───────────────────────────────
  listPrincipals: async ({ params }) => {
    const proxy = await ProxyDAO.findByDid(params.did);
    if (!proxy) throw new APIException("NOT_FOUND", "Proxy not found");
    const principals = await ProxyPrincipalDAO.listByProxy(params.did);
    return { status: 200, body: principals };
  },
});

export const GET = handlers.GET!;
