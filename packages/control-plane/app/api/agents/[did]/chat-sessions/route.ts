/**
 * GET /api/agents/[did]/chat-sessions          — list sessions
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * @openapi
 * /api/agent/{did}/chat-sessions:
 *   get:
 *     summary: Retrieve chat sessions
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The decentralized identifier of the agent.
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
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       503:
 *         description: Service unavailable or failed to fetch data.
 */
export const GET = withError(async (
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { did } = await params;

  if (!(await auth.canAccessAgent(did))) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json(
      { error: "WebSocket server not available" },
      { status: 503 }
    );
  }

  try {
    const sessions = await wsServer.getChatSessions(did);
    return NextResponse.json({ sessions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
});
