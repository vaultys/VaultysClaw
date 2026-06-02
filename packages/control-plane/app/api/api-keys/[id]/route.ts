import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import type { ApiKey, ApiKeyUpdateRequest } from "@/lib/api-types";

function rowToApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as string,
    name: row.name as string,
    keyPrefix: row.key_prefix as string,
    allowedRoutes: JSON.parse(row.allowed_routes as string),
    realmId: (row.realm_id as string | null) ?? null,
    isRealmAdmin: (row.is_realm_admin as number) === 1,
    createdBy: row.created_by as string,
    createdAt: row.created_at as number,
    lastUsedAt: (row.last_used_at as number | null) ?? null,
    expiresAt: (row.expires_at as number | null) ?? null,
    isActive: (row.is_active as number) === 1,
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApiKeyUpdateRequest'
 *     responses:
 *       200:
 *         description: Updated API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKey'
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
  const db = getDb();

  const existing = db.prepare("SELECT id FROM api_keys WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  const body = (await request.json()) as ApiKeyUpdateRequest;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 }
      );
    }
    updates.push("name = ?");
    values.push(body.name.trim());
  }
  if (body.allowedRoutes !== undefined) {
    if (!Array.isArray(body.allowedRoutes) || body.allowedRoutes.length === 0) {
      return NextResponse.json(
        { error: "allowedRoutes must be a non-empty array" },
        { status: 400 }
      );
    }
    updates.push("allowed_routes = ?");
    values.push(JSON.stringify(body.allowedRoutes));
  }
  if (body.realmId !== undefined) {
    updates.push("realm_id = ?");
    values.push(body.realmId ?? null);
  }
  if (body.isRealmAdmin !== undefined) {
    updates.push("is_realm_admin = ?");
    values.push(body.isRealmAdmin ? 1 : 0);
  }
  if (body.expiresAt !== undefined) {
    updates.push("expires_at = ?");
    values.push(body.expiresAt ?? null);
  }
  if (body.isActive !== undefined) {
    updates.push("is_active = ?");
    values.push(body.isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  values.push(id);
  db.prepare(`UPDATE api_keys SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values
  );

  const updated = db
    .prepare(
      `SELECT id, name, key_prefix, allowed_routes, realm_id, is_realm_admin,
              created_by, created_at, last_used_at, expires_at, is_active
       FROM api_keys WHERE id = ?`
    )
    .get(id) as Record<string, unknown>;

  return NextResponse.json(rowToApiKey(updated));
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
  const db = getDb();

  const existing = db.prepare("SELECT id FROM api_keys WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  return new NextResponse(null, { status: 204 });
}
