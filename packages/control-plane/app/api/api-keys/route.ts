import crypto from "crypto";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { generateApiKey, toApiKey } from "@/lib/api/utils/api-key-utils";
import { ApiKeyDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { apiKeysContract } from "@/lib/contracts";

const handlers = createNextRoute(apiKeysContract, {
  // ── GET /api/api-keys ─────────────────────────────────────────────────────
  list: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const rows = await ApiKeyDAO.findAll();
    return { status: 200, body: { apiKeys: rows.map(toApiKey) } };
  },

  // ── POST /api/api-keys ────────────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { name, allowedRoutes, realmId = null, isRealmAdmin = false, expiresAt = null } = body;

    if (!name?.trim()) throw new APIException("MALFORMED", "name is required");
    if (!Array.isArray(allowedRoutes) || allowedRoutes.length === 0)
      throw new APIException("MALFORMED", "allowedRoutes must be a non-empty array");

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

    return { status: 201, body: { apiKey: toApiKey(row), key } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
