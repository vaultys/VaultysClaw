import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { RealmDAO } from "@/db";
import { realmsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/realms/:id — the realm-detail slice of `realmsContract`.
 *
 * The contract (lib/contracts/realms/realms.contract.ts) is the single source
 * of truth for request/response shapes; `createNextRoute` validates inputs and
 * type-checks every `{ status, body }` returned below against it.
 */
const handlers = createNextRoute(realmsContract, {
  // ── GET /api/realms/:id — full realm detail (single query) ────────────────
  getOne: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const realm = await RealmDAO.getDetail(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    if (!(await auth.canAccessRealm(params.id)))
      throw new APIException("FORBIDDEN");

    return { status: 200, body: realm };
  },

  // ── PATCH /api/realms/:id — update metadata or config (global admin) ──────
  update: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const existing = await RealmDAO.findById(params.id);
    if (!existing) throw new APIException("NOT_FOUND", "Realm not found");

    const updates: Parameters<typeof RealmDAO.update>[1] = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.color !== undefined) updates.color = body.color;
    if ("llmConfig" in body)
      updates.llmConfig = (body.llmConfig as any) ?? null;
    if (body.defaultCapabilities !== undefined)
      updates.defaultCapabilities = body.defaultCapabilities;
    if ("tokenBudgetDaily" in body)
      updates.tokenBudgetDaily = body.tokenBudgetDaily ?? null;
    if ("tokenBudgetMonthly" in body)
      updates.tokenBudgetMonthly = body.tokenBudgetMonthly ?? null;
    if ("allowedCapabilities" in body)
      updates.allowedCapabilities = body.allowedCapabilities ?? null;

    await RealmDAO.update(params.id, updates);
    const realm = await RealmDAO.findById(params.id);

    return { status: 200, body: realm! };
  },

  // ── DELETE /api/realms/:id — delete a realm (not the default one) ─────────
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const ok = await RealmDAO.delete(params.id);
    if (!ok)
      throw new APIException("CONFLICT", "Cannot delete the default realm");

    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
