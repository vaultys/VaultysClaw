import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
// API keys are serialized with unix-second timestamps (not the Prisma `Date`
// fields), so the route's own `ApiKey` shape is the source of truth here.
import type { ApiKey } from "@/lib/api/utils/api-types";

const IdParam = z.object({ id: z.string().min(1) });

const ApiKeyCreateRequest = z.object({
  name: z.string(),
  allowedRoutes: z.array(z.string()),
  realmId: z.string().nullable().optional(),
  isRealmAdmin: z.boolean().optional(),
  expiresAt: z.number().nullable().optional(),
});

const ApiKeyUpdateRequest = z.object({
  name: z.string().optional(),
  allowedRoutes: z.array(z.string()).optional(),
  realmId: z.string().nullable().optional(),
  isRealmAdmin: z.boolean().optional(),
  expiresAt: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const apiKeysContract = c.router({
  list: {
    method: "GET",
    path: "/api/api-keys",
    summary: "List API keys (without the raw key hash). Admin only",
    responses: {
      200: c.type<{ apiKeys: ApiKey[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/api-keys",
    summary: "Create an API key — returns the raw key exactly once",
    body: ApiKeyCreateRequest,
    responses: {
      201: c.type<{ apiKey: ApiKey; key: string }>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/api-keys/:id",
    pathParams: IdParam,
    summary: "Update an API key (admin only)",
    body: ApiKeyUpdateRequest,
    responses: { 200: c.type<ApiKey>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/api-keys/:id",
    pathParams: IdParam,
    summary: "Revoke an API key (admin only)",
    body: c.noBody(),
    responses: { 204: c.noBody(), ...commonErrorResponses },
  },
});
