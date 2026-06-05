import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { ApiKeyDAO } from "@/db";
import { prisma } from "@/db/client";
import type { ApiKey, ApiKeyUpdateRequest } from "@/lib/api-types";

function toApiKey(row: NonNullable<Awaited<ReturnType<typeof ApiKeyDAO.findById>>>): ApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    allowedRoutes: row.allowedRoutes as string[],
    realmId: row.realmId ?? null,
    isRealmAdmin: row.isRealmAdmin,
    createdBy: row.createdBy,
    createdAt: Math.floor(row.createdAt.getTime() / 1000),
    lastUsedAt: row.lastUsedAt ? Math.floor(row.lastUsedAt.getTime() / 1000) : null,
    expiresAt: row.expiresAt ? Math.floor(row.expiresAt.getTime() / 1000) : null,
    isActive: row.isActive,
  };
}

/**
 * @openapi
 * /api/api-keys/{id}:
 *   patch:
 *     summary: Update an API key
 *     description: Update name, allowed routes, realm scope, expiry, or active status. Admin only.
 *     tags: [API Keys]
 *     security:
 *       - sessionCookie: []
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated API key
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *   delete:
 *     summary: Revoke an API key
 *     description: Permanently deletes an API key. Admin only.
 *     tags: [API Keys]
 *     security:
 *       - sessionCookie: []
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Key revoked
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const existing = await ApiKeyDAO.findById(id);
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  const body = (await request.json()) as ApiKeyUpdateRequest;
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if (body.allowedRoutes !== undefined) {
    if (!Array.isArray(body.allowedRoutes) || body.allowedRoutes.length === 0) {
      return NextResponse.json(
        { error: "allowedRoutes must be a non-empty array" },
        { status: 400 }
      );
    }
    data.allowedRoutes = body.allowedRoutes;
  }
  if (body.realmId !== undefined) data.realmId = body.realmId ?? null;
  if (body.isRealmAdmin !== undefined) data.isRealmAdmin = body.isRealmAdmin;
  if (body.expiresAt !== undefined) {
    data.expiresAt = body.expiresAt ? new Date(body.expiresAt * 1000) : null;
  }
  if (body.isActive !== undefined) data.isActive = body.isActive;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.apiKey.update({ where: { id }, data });
  return NextResponse.json(toApiKey(updated));
}

/**
 * @openapi
 * /api/api-keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     description: Permanently deletes an API key. Admin only.
 *     tags: [API Keys]
 *     security:
 *       - sessionCookie: []
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Key revoked
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const deleted = await ApiKeyDAO.delete(id);
  if (!deleted) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
