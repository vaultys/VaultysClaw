import { isAdminRole } from "@/lib/roles";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { crypto } from "@vaultys/id";
import { GrantDAO } from "@/db";
import type {
  WSChatResponsePayload,
  WSToolApprovalRequestPayload,
  ChatMessageEntry,
} from "@vaultysclaw/shared";
import {
  APIException,
  malformed,
  unauthorized,
  unavailable,
} from "@/lib/api/utils/api-utils";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * Routes for /api/agents/:did/chat-sessions — the chat slice of
 * `userContract.agents`. GET lists sessions; POST streams a chat response from the
 * connected agent (text/event-stream — see the POST handler below).
 *
 * Chat is a user-facing action: access is gated by `canAccessAgent` / an active
 * grant, not by admin role. Admins pass those checks too.
 */
const handlers = createNextRoute(userContract.agents, {
  getChatSessions: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    const { did } = params;

    if (!(await auth.canAccessAgent(did))) throw new APIException("FORBIDDEN");

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    try {
      const sessions = await wsServer.getChatSessions(did);
      return { status: 200, body: { sessions } };
    } catch (err) {
      throw new APIException(
        "UNAVAILABLE",
        err instanceof Error ? err.message : "Failed to fetch"
      );
    }
  },
});

export const GET = handlers.GET!;

/**
 * POST /api/agents/:did/chat-sessions
 * Stream a chat response from a connected agent.
 *
 * Body: { messages: Array<{ role: "user"|"assistant"; content: string }>, sessionId?: string }
 *
 * Admins can chat with any agent. Non-admins must have at least one active grant
 * covering the target agent (any capability qualifies for chat access).
 *
 * Response: text/event-stream
 *   event: session\ndata: {"conversationId":"..."}\n\n  — session ID for this exchange
 *   data: {"text":"chunk"}\n\n   — streaming text delta
 *   data: {"error":"msg"}\n\n    — error
 *   data: [DONE]\n\n              — stream finished
 *
 * This is a streaming response, so it can't go through `createNextRoute`
 * (which serializes a single `{ status, body }`). It stays a `withError`
 * handler returning a raw `Response`.
 */
export const POST = withError(
  async (request: NextRequest, ctx: { params: Promise<{ did: string }> }) => {
    const { did: agentDid } = await ctx.params;

    // Support both NextAuth sessions and API key authentication
    const session = await getServerSession(authOptions);
    let isAdmin = false;
    let callerDid: string | undefined;

    if (session?.user) {
      isAdmin = Boolean(isAdminRole(session.user.role));
      callerDid = session.user.did ?? undefined;
    } else {
      const auth = await getAuthContext(request).catch(() => null);
      if (!auth) return unauthorized();
      isAdmin = auth.isGlobalAdmin;
      callerDid = auth.did;
    }

    const body = await request.json();
    const { messages, sessionId } = body as {
      messages?: ChatMessageEntry[];
      sessionId?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return malformed("messages are required");
    }

    // Validate message format
    for (const m of messages) {
      if (
        (m.role !== "user" && m.role !== "assistant") ||
        typeof m.content !== "string"
      ) {
        return malformed(
          "Each message must have role (user|assistant) and content (string)"
        );
      }
    }

    // Permission check: non-admins need at least one grant for this agent
    if (!isAdmin) {
      if (!callerDid) {
        return malformed("User DID is required for non-admin users");
      }
      const grants = await GrantDAO.listByUser(callerDid);
      const hasGrant = grants.some((g) => {
        const agentMatch = g.agentDid === null || g.agentDid === agentDid;
        const notExpired = !g.expiresAt || new Date(g.expiresAt) > new Date();
        return agentMatch && notExpired;
      });
      if (!hasGrant) {
        return malformed("No grant for this agent");
      }
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return unavailable("WebSocket server not available");
    }

    // Reuse caller's session ID to continue an existing conversation, or start a new one
    const conversationId =
      typeof sessionId === "string" && sessionId.length > 0
        ? sessionId
        : crypto.randomBytes(16).toString("hex");

    // Create a TransformStream to bridge WS callbacks → SSE response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Always tell the client which session ID to use for this exchange
    writer.write(
      encoder.encode(
        `event: session\ndata: ${JSON.stringify({ conversationId })}\n\n`
      )
    );

    const sent = wsServer.sendChatToAgent(
      agentDid,
      conversationId,
      messages,
      (payload: WSChatResponsePayload) => {
        if (payload.error) {
          writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ error: payload.error, errorCode: payload.errorCode })}\n\n`
            )
          );
          writer.write(encoder.encode("data: [DONE]\n\n"));
          writer.close().catch(() => {});
          return;
        }
        if (payload.chunk) {
          writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ text: payload.chunk, thinking: payload.thinking ?? false })}\n\n`
            )
          );
        }
        if (payload.done) {
          writer.write(encoder.encode("data: [DONE]\n\n"));
          writer.close().catch(() => {});
        }
      },
      (approval: WSToolApprovalRequestPayload) => {
        writer.write(
          encoder.encode(
            `event: tool_approval\ndata: ${JSON.stringify(approval)}\n\n`
          )
        );
      }
    );

    if (!sent) {
      return unavailable("Agent not connected");
    }

    // Timeout: close the stream after 2 minutes if the agent doesn't respond
    const timeout = setTimeout(
      () => {
        writer.write(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Chat response timeout" })}\n\n`
          )
        );
        writer.write(encoder.encode("data: [DONE]\n\n"));
        writer.close().catch(() => {});
      },
      2 * 60_000
    );

    // Clean up timeout when the writer closes
    writer.closed
      .then(() => clearTimeout(timeout))
      .catch(() => clearTimeout(timeout));

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
);
