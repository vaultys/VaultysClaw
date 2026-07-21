import { z } from "zod";
import {
  WebhookCreateRequestSchema,
  WebhookUpdateRequestSchema,
} from "./webhooks.schemas";

/** Webhook as returned to the client. The signing `secret` is never included in
 * list/update responses — only a masked preview. The full secret is returned
 * exactly once on creation and regeneration (see WebhookWithSecret). */
export interface Webhook {
  id: string;
  name: string;
  description: string | null;
  url: string;
  events: string[];
  isActive: boolean;
  secretPreview: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Returned only on create / regenerate — includes the full raw secret. */
export interface WebhookWithSecret extends Webhook {
  secret: string;
}

export interface WebhookListResponse {
  webhooks: Webhook[];
}

export type WebhookCreateRequest = z.infer<typeof WebhookCreateRequestSchema>;
export type WebhookUpdateRequest = z.infer<typeof WebhookUpdateRequestSchema>;
