import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  WebhookCreateRequestSchema,
  WebhookUpdateRequestSchema,
  WebhookIdParamSchema,
} from "./webhooks.schemas";
import { Webhook, WebhookWithSecret, WebhookListResponse } from "./webhooks.types";

export const webhooksContract = c.router({
  list: {
    method: "GET",
    path: "/api/admin/webhooks",
    summary: "List webhooks (secret masked). Admin only",
    responses: {
      200: c.type<WebhookListResponse>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/admin/webhooks",
    summary: "Create a webhook — returns the signing secret exactly once",
    body: WebhookCreateRequestSchema,
    responses: {
      201: c.type<WebhookWithSecret>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/admin/webhooks/:id",
    pathParams: WebhookIdParamSchema,
    summary: "Update a webhook (admin only)",
    body: WebhookUpdateRequestSchema,
    responses: { 200: c.type<Webhook>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/admin/webhooks/:id",
    pathParams: WebhookIdParamSchema,
    summary: "Delete a webhook (admin only)",
    body: c.noBody(),
    responses: { 204: c.noBody(), ...commonErrorResponses },
  },

  regenerateSecret: {
    method: "POST",
    path: "/api/admin/webhooks/:id/regenerate-secret",
    pathParams: WebhookIdParamSchema,
    summary: "Regenerate a webhook's signing secret — returned exactly once",
    body: c.noBody(),
    responses: { 200: c.type<WebhookWithSecret>(), ...commonErrorResponses },
  },
});
