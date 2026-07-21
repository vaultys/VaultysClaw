import { APIException } from "@/lib/api/utils/api-utils";
import { WebhookDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { adminContract } from "@/lib/contracts";
import {
  toWebhook,
  toWebhookWithSecret,
  generateWebhookSecret,
} from "@/lib/api/utils/webhook-utils";

const handlers = createNextRoute(adminContract.webhooks, {
  // ── PATCH /api/admin/webhooks/:id ─────────────────────────────────────────
  update: async ({ params, body }) => {
    const existing = await WebhookDAO.findById(params.id);
    if (!existing) throw new APIException("NOT_FOUND", "Webhook not found");

    const data: {
      name?: string;
      description?: string | null;
      url?: string;
      events?: string[];
      isActive?: boolean;
    } = {};

    if (body.name !== undefined) {
      if (!body.name.trim())
        throw new APIException("MALFORMED", "name cannot be empty");
      data.name = body.name.trim();
    }
    if (body.description !== undefined) data.description = body.description ?? null;
    if (body.url !== undefined) data.url = body.url;
    if (body.events !== undefined) data.events = body.events;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    if (Object.keys(data).length === 0)
      throw new APIException("MALFORMED", "No fields to update");

    const updated = await WebhookDAO.update(params.id, data);
    return { status: 200, body: toWebhook(updated) };
  },

  // ── DELETE /api/admin/webhooks/:id ────────────────────────────────────────
  remove: async ({ params }) => {
    const deleted = await WebhookDAO.delete(params.id);
    if (!deleted) throw new APIException("NOT_FOUND", "Webhook not found");
    return { status: 204, body: undefined };
  },

  // ── POST /api/admin/webhooks/:id/regenerate-secret ────────────────────────
  regenerateSecret: async ({ params }) => {
    const existing = await WebhookDAO.findById(params.id);
    if (!existing) throw new APIException("NOT_FOUND", "Webhook not found");

    const updated = await WebhookDAO.regenerateSecret(
      params.id,
      generateWebhookSecret()
    );
    return { status: 200, body: toWebhookWithSecret(updated) };
  },
});

export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
export const POST = handlers.POST!;
