import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { RealmDAO, WorkflowDAO } from "@/db";
import { realmsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/realms — the collection-level slice of `realmsContract`.
 *
 * The contract (lib/contracts/realms.contract.ts) is the single source of
 * truth for request/response shapes; `createNextRoute` validates inputs and
 * type-checks every `{ status, body }` returned below against it.
 */
const handlers = createNextRoute(realmsContract, {
  // ── GET /api/realms — list realms with member/workflow counts ────────────
  list: async ({ request }) => {
    const auth = await getAuthContext(request);

    const allRealms = await RealmDAO.findAll();

    // Filter by realm membership using the auth context's precomputed set
    // (which correctly uses the DB userId, not the VaultysID DID string).
    const visibleRealms = auth.isGlobalAdmin
      ? allRealms
      : (
          await Promise.all(
            allRealms.map((r) =>
              auth.canAccessRealm(r.id).then((ok) => (ok ? r : null))
            )
          )
        ).filter((r): r is NonNullable<typeof r> => r !== null);

    return { status: 200, body: { realms: visibleRealms } };
  },

  // ── POST /api/realms — create a new realm (global admin only) ─────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (!body.name.trim())
      throw new APIException("MALFORMED", "name is required");

    const slug = (body.slug ?? body.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) throw new APIException("MALFORMED", "Invalid slug");

    const existing = await RealmDAO.findBySlug(slug);
    if (existing)
      throw new APIException(
        "CONFLICT",
        "A realm with this slug already exists"
      );

    const realm = await RealmDAO.create({
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || undefined,
      color: body.color,
    });

    return { status: 201, body: { realm } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
