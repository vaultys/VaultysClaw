import { realmsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { getAuthContext } from "@/lib/auth-utils";
import { RealmDAO, UserDAO } from "@/db";

/**
 * Routes for /api/realms/me — the collection-level slice of `realmsContract`.
 *
 * The contract (lib/contracts/realms.contract.ts) is the single source of
 * truth for request/response shapes; `createNextRoute` validates inputs and
 * type-checks every `{ status, body }` returned below against it.
 */
const handlers = createNextRoute(realmsContract, {
  // ── GET /api/realms/me — list realms of the current user ────────────
  listMyRealms: async ({ request }) => {
    const auth = await getAuthContext(request);

    const user = await UserDAO.findByDid(auth.did);
    const userId = user?.id ?? auth.did;

    const userRealms = await RealmDAO.getUserRealms(userId);

    return { status: 200, body: { userRealms } };
  },
});

export const GET = handlers.GET!;
