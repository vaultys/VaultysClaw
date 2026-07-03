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
