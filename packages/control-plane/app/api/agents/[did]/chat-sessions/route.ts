/**
 * GET /api/agents/[did]/chat-sessions          — list sessions
 * GET /api/agents/[did]/chat-sessions?session= — full history for one session
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * @openapi
 * /api/agents/{did}/chat-sessions:
 *   get:
 *     summary: Retrieve chat sessions or full history for a session.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The decentralized identifier of the agent.
 *         schema:
 *           type: string
 *       - name: session
 *         in: query
 *         required: false
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
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
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
  { params }: { params: Promise<{ did: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { did: rawDid } = await params;
  const did = decodeURIComponent(rawDid);

  if (!auth.canAccessAgent(did)) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: "WebSocket server not available" }, { status: 503 });
  }

  const sessionId = request.nextUrl.searchParams.get("session");

  try {
    if (sessionId) {
      const messages = await wsServer.getChatHistory(did, sessionId);
      return NextResponse.json({ messages });
    } else {
      const sessions = await wsServer.getChatSessions(did);
      return NextResponse.json({ sessions });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
