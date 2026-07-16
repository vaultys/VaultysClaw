import crypto from "crypto";
import { getAuthContext } from "@/lib/auth-utils";
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
  // ── GET /api/admin/webhooks ───────────────────────────────────────────────
  list: async () => {
    const rows = await WebhookDAO.findAll();
    return { status: 200, body: { webhooks: rows.map(toWebhook) } };
  },

  // ── POST /api/admin/webhooks ──────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);

    const { name, description = null, url, events = [], isActive = true } = body;
    if (!name?.trim()) throw new APIException("MALFORMED", "name is required");

    const secret = generateWebhookSecret();
    const row = await WebhookDAO.create({
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description ?? null,
      url,
      secret,
      events,
      isActive,
      createdBy: auth.did,
    });

    return { status: 201, body: toWebhookWithSecret(row) };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
