import { z } from "zod";

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * User-facing agent list query. Mirrors the admin list query but without
 * `mine` — the user endpoint always scopes to the caller's own workspaces.
 */
export const ListUserAgentsQuerySchema = z.object({
  search: z.string().optional(),
  online: z.enum(["true", "false"]).optional(),
  workspace: z.string().optional(),
  capabilities: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  sortBy: z.enum(["name", "lastSeen", "registeredAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

// ─────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────

/** Send a one-off task/intent to an agent the user can access. */
export const SendTaskBodySchema = z.object({
  action: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

/** Set or clear an agent's geographic location. */
export const SetLocationBodySchema = z.object({
  lat: z.number().nullable().optional(),
  lon: z.number().optional(),
  label: z.string().optional(),
});

/** Chat message stream request — a user chats with an agent they can access. */
export const SendChatMessageBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .min(1),
  sessionId: z.string().optional(),
});
