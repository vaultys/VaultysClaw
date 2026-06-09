/**
 * GET /api/realms/[id]/credentials/[credId]/decrypt
 * Returns the plaintext secret for a specific credential.
 * Only realm admins can call this — it is used server-side when constructing
 * workflow step payloads, not exposed to the browser directly.
 *
 * In the workflow execution path the control plane decrypts and injects
 * the secret into the signed intent payload sent over the WebSocket to the agent.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { decryptSecret } from "@/lib/vault";
import { CredentialDAO, RealmDAO } from "@/db";

type Ctx = { params: Promise<{ id: string; credId: string }> };

/**
 * @openapi
 * /api/realms/{id}/credentials/{credId}:
 *   get:
 *     summary: Retrieve the plaintext secret for a specific credential.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Realm ID
 *         schema:
 *           type: string
 *       - name: credId
 *         in: path
 *         required: true
 *         description: Credential ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved the credential secret.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 service:
 *                   type: string
 *                 name:
 *                   type: string
 *                 secret:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to decrypt credential.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id: realmId, credId } = await ctx.params;
  const realm = await RealmDAO.findById(realmId);
  if (!realm) return notFound("Realm not found");

  // Only realm admins can retrieve plaintext secrets
  if (!(await auth.canAdminRealm(realmId))) return forbidden();

  const cred = await CredentialDAO.findById(credId);
  if (!cred || cred.realmId !== realmId) {
    return NextResponse.json(
      { error: "Credential not found" },
      { status: 404 }
    );
  }

  const secret = await decryptSecret(cred.secretEnc);
  return NextResponse.json({
    id: cred.id,
    service: cred.service,
    name: cred.name,
    secret,
  });
}
