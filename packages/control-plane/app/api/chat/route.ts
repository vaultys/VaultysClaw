import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWSServer } from "@/lib/ws-server";
import { crypto } from "@vaultys/id";
import { GrantDAO } from "@/db";
import type {
  WSChatResponsePayload,
  WSToolApprovalRequestPayload,
  ChatMessageEntry,
} from "@vaultysclaw/shared";
import {
  malformed,
  unauthorized,
  unavailable,
} from "@/lib/api/utils/api-utils";

/**
 * POST /api/chat
 * Stream a chat response from a connected agent.
 *
 * Body: { agentDid: string, messages: Array<{ role: "user"|"assistant", content: string }>, sessionId?: string }
 *
 * Admins can chat with any agent. Non-admins must have at least one active grant
 * covering the target agent (any capability qualifies for chat access).
 *
 * Response: text/event-stream
 *   event: session\ndata: {"conversationId":"..."}\n\n  — session ID for this exchange
 *   data: {"text":"chunk"}\n\n   — streaming text delta
 *   data: {"error":"msg"}\n\n    — error
 *   data: [DONE]\n\n              — stream finished
 */
/**
 * @openapi
 * /api/chat:
 *   post:
 *     summary: Stream a chat response from a connected agent.
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agentDid:
 *                 type: string
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *               sessionId:
 *                 type: string
 *             required:
 *               - agentDid
 *               - messages
 *     responses:
 *       200:
 *         description: Successful response streaming.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Internal server error.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorized();
  }

  const body = await request.json();
  const { agentDid, messages, sessionId } = body as {
    agentDid?: string;
    messages?: ChatMessageEntry[];
    sessionId?: string;
  };

  if (!agentDid || !Array.isArray(messages) || messages.length === 0) {
    return malformed("agentDid and messages are required");
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
  if (!session.user.isAdmin) {
    if (!session.user.did) {
      return malformed("User DID is required for non-admin users");
    }
    const grants = await GrantDAO.listByUser(session.user.did);
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
  const timeout = setTimeout(() => {
    writer.write(
      encoder.encode(
        `data: ${JSON.stringify({ error: "Chat response timeout" })}\n\n`
      )
    );
    writer.write(encoder.encode("data: [DONE]\n\n"));
    writer.close().catch(() => {});
  }, 2 * 60_000);

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
