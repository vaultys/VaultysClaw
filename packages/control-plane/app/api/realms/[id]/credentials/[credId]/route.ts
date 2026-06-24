/**
 * GET /api/realms/[id]/credentials/[credId]
 * Returns the plaintext secret for a specific credential. Realm admins only —
 * used server-side when constructing workflow step payloads.
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { decryptSecret } from "@/lib/vault";
import { CredentialDAO, RealmDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { realmsContract } from "@/lib/contracts";

const handlers = createNextRoute(realmsContract, {
  getCredential: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    // Only realm admins can retrieve plaintext secrets
    if (!(await auth.canAdminRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const cred = await CredentialDAO.findById(params.credId);
    if (!cred || cred.realmId !== params.id)
      throw new APIException("NOT_FOUND", "Credential not found");

    const secret = await decryptSecret(cred.secretEnc);
    return {
      status: 200,
      body: { id: cred.id, service: cred.service, name: cred.name, secret },
    };
  },
});

export const GET = handlers.GET!;
