import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { RealmDAO } from "@/db";
import { realmsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/realms/:id/default — the `setDefault` slice of `realmsContract`.
 */
const handlers = createNextRoute(realmsContract, {
  // ── POST /api/realms/:id/default — make this realm the default ────────────
  setDefault: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    await RealmDAO.setDefault(params.id);
    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
