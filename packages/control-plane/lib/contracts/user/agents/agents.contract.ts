import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses, PaginatedResponse } from "../../common";
import {
  ListUserAgentsQuerySchema,
  SendChatMessageBodySchema,
  SendTaskBodySchema,
} from "./agents.schemas";
import { UserAgentDetail } from "./agents.types";
// tokenUsage is served at both audiences; its query schema and response type
// stay in the admin contract folder and are shared here.
import { TokenUsageQuerySchema } from "../../admin/agents/agents.schemas";
import { AgentInfo, BucketPoint } from "../../admin/agents/agents.types";
import { ChatHistoryMessage, ChatSession } from "@vaultysclaw/shared";

/**
 * User-facing agents API — scoped to the caller's own workspaces (derived from
 * the session token). The admin counterpart (`adminAgentsContract`) serves the
 * global view under `/api/admin/agents`.
 *
 * Routes live under `/api/agents` — the `(user)` route group is stripped from
 * the path.
 */
export const userAgentsContract = c.router({
  search: {
    method: "GET",
    path: "/api/agents",
    query: ListUserAgentsQuerySchema,
    responses: {
      200: c.type<PaginatedResponse<AgentInfo>>(),
      ...commonErrorResponses,
    },
  },

  getAgent: {
    method: "GET",
    path: "/api/agents/:did",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<UserAgentDetail>(),
      ...commonErrorResponses,
    },
  },

  // ─── Task ──────────────────────────────────────────────────────────────────
  // Sending a task is gated by `canAccessAgent` (admins pass too).

  sendTask: {
    method: "POST",
    path: "/api/agents/:did/task",
    pathParams: z.object({ did: z.string() }),
    body: SendTaskBodySchema,
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  // ─── Token usage ─────────────────────────────────────────────────────────────
  // User-facing equivalent of the admin token-usage endpoint, scoped by
  // `canAccessAgent`.

  tokenUsage: {
    method: "GET",
    path: "/api/agents/:did/token-usage",
    pathParams: z.object({ did: z.string() }),
    query: TokenUsageQuerySchema,
    responses: {
      200: c.type<{
        granularity: "day" | "month";
        from: string;
        to: string;
        data: BucketPoint[];
      }>(),
      ...commonErrorResponses,
    },
  },

  // ─── Skills ──────────────────────────────────────────────────────────────────
  // Reading effective skills is gated by `canAccessAgent`. Overriding a skill
  // stays admin-only (adminAgentsContract.updateSkillOverride).

  getSkills: {
    method: "GET",
    path: "/api/agents/:did/skills",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<{ skills: any[] }>(),
      ...commonErrorResponses,
    },
  },

  // ─── Chat sessions ───────────────────────────────────────────────────────────
  // Chatting is a user-facing action, gated by `canAccessAgent` (admins pass too).

  getChatSessions: {
    method: "GET",
    path: "/api/agents/:did/chat-sessions",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<{ sessions: ChatSession[] }>(),
      ...commonErrorResponses,
    },
  },

  sendChatMessage: {
    method: "POST",
    path: "/api/agents/:did/chat-sessions",
    pathParams: z.object({ did: z.string() }),
    summary: "Stream a chat response from a connected agent (text/event-stream)",
    body: SendChatMessageBodySchema,
    // Response is a Server-Sent Events stream, not JSON — consumed with a raw
    // fetch + ReadableStream reader (the ts-rest client buffers the body).
    responses: {
      200: c.otherResponse({
        contentType: "text/event-stream",
        body: c.type<string>(),
      }),
      ...commonErrorResponses,
    },
  },

  getSessionMessages: {
    method: "GET",
    path: "/api/agents/:did/chat-sessions/:sessionId",
    pathParams: z.object({ did: z.string(), sessionId: z.string() }),
    responses: {
      200: c.type<{ messages: ChatHistoryMessage[] }>(),
      ...commonErrorResponses,
    },
  },
});
