/**
 * Credential vault endpoints for a realm.
 *
 * GET    /api/realms/[id]/credentials              — list credential metadata (no secrets)
 * POST   /api/realms/[id]/credentials              — save or update a credential
 * DELETE /api/realms/[id]/credentials?service=&name= — remove a credential
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { encryptSecret } from "@/lib/vault";
import { CredentialDAO, RealmDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { realmsContract } from "@/lib/contracts";

const handlers = createNextRoute(realmsContract, {
  // ── GET /api/realms/:id/credentials ───────────────────────────────────────
  listCredentials: async ({ params, query, request }) => {
    const auth = await getAuthContext(request);

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");
    if (!(await auth.canAccessRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const credentials = query.service
      ? await CredentialDAO.listByService(params.id, query.service)
      : await CredentialDAO.list(params.id);

    return { status: 200, body: { credentials } };
  },

  // ── POST /api/realms/:id/credentials ──────────────────────────────────────
  saveCredential: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");
    if (!(await auth.canAdminRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const secretEncrypted = await encryptSecret(body.secret);
    const id = await CredentialDAO.save(
      params.id,
      body.service,
      body.name,
      secretEncrypted,
      body.metadata,
      auth.did
    );

    return { status: 201, body: { success: true, id } };
  },

  // ── DELETE /api/realms/:id/credentials ────────────────────────────────────
  deleteCredential: async ({ params, query, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const deleted = await CredentialDAO.deleteByKey(
      params.id,
      query.service,
      query.name
    );
    return { status: 200, body: { success: deleted } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
export const DELETE = handlers.DELETE!;
