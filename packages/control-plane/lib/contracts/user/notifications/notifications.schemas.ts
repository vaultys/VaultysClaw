import { z } from "zod";

// ── Queries
export const ListNotificationsQuerySchema = z.object({
  unreadOnly: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

// ── Bodies
export const MarkReadBodySchema = z.object({
  id: z.string().optional(),
  all: z.boolean().optional(),
});

export const UpdatePreferenceBodySchema = z.object({
  eventType: z.string(),
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
});
