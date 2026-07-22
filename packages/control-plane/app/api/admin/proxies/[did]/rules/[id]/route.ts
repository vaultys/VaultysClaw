import { getWSServer } from "@/lib/ws-server";
import { ProxyRuleDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.proxies, {
  // ── PATCH /api/admin/proxies/:did/rules/:id ──────────────────────────────
  updateRule: async ({ params, body }) => {
    const rule = await ProxyRuleDAO.update(params.id, body);
    getWSServer()?.pushProxyConfig(params.did);
    return { status: 200, body: rule };
  },

  // ── DELETE /api/admin/proxies/:did/rules/:id ─────────────────────────────
  deleteRule: async ({ params }) => {
    await ProxyRuleDAO.delete(params.id);
    getWSServer()?.pushProxyConfig(params.did);
    return { status: 204, body: undefined };
  },
});

export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
