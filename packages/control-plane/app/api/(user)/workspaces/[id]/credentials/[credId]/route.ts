/**
 * GET /api/workspaces/[id]/credentials/[credId]
 * Returns the plaintext secret for a specific credential. Workspace admins only —
 * used server-side when constructing workflow step payloads.
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { decryptSecret } from "@/lib/vault";
import { CredentialDAO, WorkspaceDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

const handlers = createNextRoute(userContract.workspaces, {
  getCredential: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    // Only workspace admins can retrieve plaintext secrets
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const cred = await CredentialDAO.findById(params.credId);
    if (!cred || cred.workspaceId !== params.id)
      throw new APIException("NOT_FOUND", "Credential not found");

    const secret = await decryptSecret(cred.secretEnc);
    return {
      status: 200,
      body: { id: cred.id, service: cred.service, name: cred.name, secret },
    };
  },
});

export const GET = handlers.GET!;
