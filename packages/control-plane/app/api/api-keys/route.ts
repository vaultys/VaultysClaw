import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { generateApiKey } from "@/lib/api-key-utils";
import { getDb } from "@/lib/db";
import type {
  ApiKey,
  ApiKeyCreateRequest,
  ApiKeyCreatedResponse,
} from "@/lib/api-types";

function rowToApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as string,
    name: row.name as string,
    keyPrefix: row.keyPrefix as string,
    allowedRoutes: JSON.parse(row.allowedRoutes as string),
    realmId: (row.realmId as string | null) ?? null,
    isRealmAdmin: (row.isRealmAdmin as number) === 1,
    createdBy: row.createdBy as string,
    createdAt: row.createdAt as number,
    lastUsedAt: (row.lastUsedAt as number | null) ?? null,
    expiresAt: (row.expiresAt as number | null) ?? null,
    isActive: (row.isActive as number) === 1,
  };
}

/**
 * @openapi
 * /api/api-keys:
 *   get:
 *     summary: List API keys
 *     description: Returns all API keys (without the raw key hash). Admin only.
 *     tags: [API Keys]
 *     security:
 *       - sessionCookie: []
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiKeys:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ApiKey'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, key_prefix, allowed_routes, realm_id, is_realm_admin,
              created_by, created_at, last_used_at, expires_at, is_active
       FROM api_keys
       ORDER BY created_at DESC`
    )
    .all() as Record<string, unknown>[];

  return NextResponse.json({ apiKeys: rows.map(rowToApiKey) });
}

/**
 * @openapi
 * /api/api-keys:
 *   post:
 *     summary: Create an API key
 *     description: >
 *       Creates a new API key and returns the raw key **exactly once**.
 *       The key is never stored in plaintext — store it immediately.
 *     tags: [API Keys]
 *     security:
 *       - sessionCookie: []
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApiKeyCreateRequest'
 *     responses:
 *       201:
 *         description: Key created. The `key` field is shown only this once.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKeyCreatedResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const db = getDb();
  const body = (await request.json()) as ApiKeyCreateRequest;
  const {
    name,
    allowedRoutes,
    realmId = null,
    isRealmAdmin = false,
    expiresAt = null,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!Array.isArray(allowedRoutes) || allowedRoutes.length === 0) {
    return NextResponse.json(
      { error: "allowedRoutes must be a non-empty array" },
      { status: 400 }
    );
  }

  const { key, hash, prefix } = generateApiKey();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

    db.prepare(
    `INSERT INTO api_keys
       (id, name, key_hash, key_prefix, allowed_routes, realm_id, is_realm_admin,
        created_by, created_at, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    id,
    name.trim(),
    hash,
    prefix,
    JSON.stringify(allowedRoutes),
    realmId ?? null,
    isRealmAdmin ? 1 : 0,
    auth.did,
    now,
    expiresAt ?? null
  );

  const row = db
    .prepare(
      `SELECT id, name, key_prefix, allowed_routes, realm_id, is_realm_admin,
              created_by, created_at, last_used_at, expires_at, is_active
       FROM api_keys WHERE id = ?`
    )
    .get(id) as Record<string, unknown>;

  const response: ApiKeyCreatedResponse = {
    apiKey: rowToApiKey(row),
    key,
  };

  return NextResponse.json(response, { status: 201 });
}
