import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { ApiKey as PrismaApiKey } from "@prisma/client";

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
      200: c.type<{ apiKeys: PrismaApiKey[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/api-keys",
    summary: "Create an API key — returns the raw key exactly once",
    body: ApiKeyCreateRequest,
    responses: {
      201: c.type<{ apiKey: PrismaApiKey; key: string }>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/api-keys/:id",
    pathParams: IdParam,
    summary: "Update an API key (admin only)",
    body: ApiKeyUpdateRequest,
    responses: { 200: c.type<{ apiKey: PrismaApiKey }>(), ...commonErrorResponses },
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

export const chatContract = c.router({
  send: {
    method: "POST",
    path: "/api/chat",
    summary: "Stream a chat response from a connected agent (text/event-stream)",
    body: z.object({
      agentDid: z.string(),
      messages: z.array(
        z.object({ role: z.enum(["user", "assistant"]), content: z.string() })
      ),
      sessionId: z.string().optional(),
    }),
    // Response is a Server-Sent Events stream, not JSON — typed as a raw string.
    responses: {
      200: c.otherResponse({ contentType: "text/event-stream", body: c.type<string>() }),
      ...commonErrorResponses,
    },
  },
});
