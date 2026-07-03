import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses, PaginatedResponse } from "../../common";
import {
  ListUserAgentsQuerySchema,
  SendChatMessageBodySchema,
} from "./agents.schemas";
import { UserAgentDetail } from "./agents.types";
import { AgentInfo } from "../../admin/agents/agents.types";
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
