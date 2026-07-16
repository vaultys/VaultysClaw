import { z } from "zod";

// ── Path params
export const WebhookIdParamSchema = z.object({ id: z.string().min(1) });

// ── Bodies
export const WebhookCreateRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  url: z.string().url(),
  events: z.array(z.string()).default([]),
  isActive: z.boolean().optional(),
});

export const WebhookUpdateRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});
