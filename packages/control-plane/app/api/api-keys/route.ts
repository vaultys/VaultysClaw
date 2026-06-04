import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { generateApiKey } from "@/lib/api-key-utils";
import { ApiKeyDAO } from "@/db";
import { prisma } from "@/db/client";
import type {
  ApiKey,
  ApiKeyCreateRequest,
  ApiKeyCreatedResponse,
} from "@/lib/api-types";

function toApiKey(row: Awaited<ReturnType<typeof ApiKeyDAO.findById>>): ApiKey {
  if (!row) throw new Error("null row");
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
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const rows = await ApiKeyDAO.findAll();
  return NextResponse.json({ apiKeys: rows.map(toApiKey) });
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

  const body = (await request.json()) as ApiKeyCreateRequest;
  const { name, allowedRoutes, realmId = null, isRealmAdmin = false, expiresAt = null } = body;

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

  const row = await ApiKeyDAO.create({
    id,
    name: name.trim(),
    keyHash: hash,
    keyPrefix: prefix,
    allowedRoutes,
    realmId: realmId ?? undefined,
    isRealmAdmin: isRealmAdmin ?? false,
    createdBy: auth.did,
    expiresAt: expiresAt ? new Date(expiresAt * 1000) : undefined,
  });

  const response: ApiKeyCreatedResponse = { apiKey: toApiKey(row), key };
  return NextResponse.json(response, { status: 201 });
}
