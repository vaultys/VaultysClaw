import { getWSServer } from "@/lib/ws-server";
import { ProxyPrincipalDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.proxies, {
  // ── PATCH /api/admin/proxies/:did/principals/:id ─────────────────────────
  // Admin grants/revokes governance rules, sets a descriptive tag, or changes
  // status here — the push afterward makes the change effective immediately.
  updatePrincipal: async ({ params, body }) => {
    const principal = await ProxyPrincipalDAO.update(params.id, body);
    getWSServer()?.pushProxyConfig(params.did);
    return { status: 200, body: principal };
  },

  // ── DELETE /api/admin/proxies/:did/principals/:id ────────────────────────
  deletePrincipal: async ({ params }) => {
    await ProxyPrincipalDAO.delete(params.id);
    getWSServer()?.pushProxyConfig(params.did);
    return { status: 204, body: undefined };
  },
});

export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
