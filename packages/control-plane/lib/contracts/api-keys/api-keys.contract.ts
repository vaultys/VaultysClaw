import { c } from "../contract";
import { commonErrorResponses } from "../common";
import {
  ApiKeyCreateRequestSchema,
  ApiKeyUpdateRequestSchema,
  ApiKeyIdParamSchema,
} from "./api-keys.schemas";
import {
  ApiKey,
  ApiKeyCreatedResponse,
  ApiKeyListResponse,
} from "./api-keys.types";

export const apiKeysContract = c.router({
  list: {
    method: "GET",
    path: "/api/admin/api-keys",
    summary: "List API keys (without the raw key hash). Admin only",
    responses: {
      200: c.type<ApiKeyListResponse>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/admin/api-keys",
    summary: "Create an API key — returns the raw key exactly once",
    body: ApiKeyCreateRequestSchema,
    responses: {
      201: c.type<ApiKeyCreatedResponse>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/admin/api-keys/:id",
    pathParams: ApiKeyIdParamSchema,
    summary: "Update an API key (admin only)",
    body: ApiKeyUpdateRequestSchema,
    responses: { 200: c.type<ApiKey>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/admin/api-keys/:id",
    pathParams: ApiKeyIdParamSchema,
    summary: "Revoke an API key (admin only)",
    body: c.noBody(),
    responses: { 204: c.noBody(), ...commonErrorResponses },
  },
});
