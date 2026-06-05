/**
 * GET /api/agents/[did]/chat-sessions?session= — full history for one session
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";

/**
 * @openapi
 * /api/agent/{did}/chat-sessions/{sessionId}:
 *   get:
 *     summary: Retrieve full history for a session.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The decentralized identifier of the agent.
 *         schema:
 *           type: string
 *       - name: sessionId
 *         in: path
 *         required: true
 *         description: The session ID to retrieve full history.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of chat sessions or messages.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       503:
 *         description: Service unavailable or failed to fetch data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ did: string; sessionId: string }> }
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { did, sessionId } = await params;

  if (!(await auth.canAccessAgent(did))) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json(
      { error: "WebSocket server not available" },
      { status: 503 }
    );
  }

  try {
    const messages = await wsServer.getChatHistory(did, sessionId);
    return NextResponse.json({ messages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
