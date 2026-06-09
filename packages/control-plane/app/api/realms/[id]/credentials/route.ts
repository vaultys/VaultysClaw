/**
 * Credential vault endpoints for a realm.
 *
 * GET  /api/realms/[id]/credentials              — list credential metadata (no secrets)
 * POST /api/realms/[id]/credentials              — save or update a credential
 * DELETE /api/realms/[id]/credentials?service=&name= — remove a credential
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  malformed,
} from "@/lib/api/utils/api-utils";
import { encryptSecret } from "@/lib/vault";
import { CredentialDAO, RealmDAO } from "@/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * @openapi
 * /api/realms/{id}/credentials:
 *   get:
 *     summary: List credential metadata for a realm.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Realm ID
 *         schema:
 *           type: string
 *       - name: service
 *         in: query
 *         required: false
 *         description: Filter credentials by service
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of credential metadata.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 credentials:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id: realmId } = await ctx.params;
  const realm = await RealmDAO.findById(realmId);
  if (!realm) return notFound("Realm not found");
  if (!(await auth.canAccessRealm(realmId))) return forbidden();

  const service = req.nextUrl.searchParams.get("service");
  const credentials = service
    ? await CredentialDAO.listByService(realmId, service)
    : await CredentialDAO.list(realmId);

  return NextResponse.json({ credentials });
}

/**
 * @openapi
 * /api/realms/{id}/credentials:
 *   post:
 *     summary: Save or update a credential for a realm.
 *     tags: [Realms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               service:
 *                 type: string
 *                 description: The service associated with the credential.
 *               name:
 *                 type: string
 *                 description: The name of the credential.
 *               secret:
 *                 type: string
 *                 description: The secret to be encrypted and stored.
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Additional metadata for the credential.
 *             required:
 *               - service
 *               - name
 *               - secret
 *     responses:
 *       201:
 *         description: Credential saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id: realmId } = await ctx.params;
  const realm = await RealmDAO.findById(realmId);
  if (!realm) return notFound("Realm not found");
  if (!(await auth.canAdminRealm(realmId))) return forbidden();

  const body = (await req.json()) as {
    service?: string;
    name?: string;
    secret?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.service || !body.name || !body.secret) {
    return malformed("service, name, and secret are required");
  }

  const secretEncrypted = await encryptSecret(body.secret);
  const id = await CredentialDAO.save(
    realmId,
    body.service,
    body.name,
    secretEncrypted,
    body.metadata,
    auth.did
  );

  return NextResponse.json({ success: true, id }, { status: 201 });
}

/**
 * @openapi
 * /api/realms/{id}/credentials:
 *   delete:
 *     summary: Remove a credential from a realm.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the realm.
 *         schema:
 *           type: string
 *       - name: service
 *         in: query
 *         required: true
 *         description: The service associated with the credential.
 *         schema:
 *           type: string
 *       - name: name
 *         in: query
 *         required: true
 *         description: The name of the credential.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Credential successfully removed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id: realmId } = await ctx.params;
  if (!(await auth.canAdminRealm(realmId))) return forbidden();

  const service = req.nextUrl.searchParams.get("service");
  const name = req.nextUrl.searchParams.get("name");
  if (!service || !name) {
    return malformed("service and name query params are required");
  }

  const deleted = await CredentialDAO.deleteByKey(realmId, service, name);
  return NextResponse.json({ success: deleted });
}
