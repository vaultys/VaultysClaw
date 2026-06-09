import { AgentTask } from "../../../../../types/api/requests";
/**
 * POST /api/agents/[did]/task — Enqueue a task on an agent via WS
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { withError } from "@/lib/api/handlers/with-error";
import {
  unauthorized,
  forbidden,
  unavailable,
  malformed,
} from "@/lib/api/utils/api-utils";

/**
 * @openapi
 * /api/agent/{did}/task:
 *   post:
 *     summary: Enqueue a task on an agent via WebSocket.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The decentralized identifier of the agent.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 description: The action to be performed by the agent.
 *               params:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Additional parameters for the task.
 *     responses:
 *       200:
 *         description: Task successfully enqueued.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentId:
 *                   type: string
 *                 action:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       503:
 *         description: WebSocket server not available.
 */
export const POST = withError(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ did: string }> }
  ) => {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();

    const { did } = await params;
    const agentDid = decodeURIComponent(did);

    if (!(await auth.canAccessAgent(agentDid))) return forbidden();

    const wsServer = getWSServer();
    if (!wsServer) {
      return unavailable("WebSocket server not available");
    }

    const body = await request.json();
    const { action, params: taskParams } = body as AgentTask;

    if (!action || typeof action !== "string") {
      return malformed("action (string) is required");
    }

    const ok = wsServer.sendTaskToAgent(agentDid, action, taskParams ?? {});
    if (!ok) {
      return unavailable("Agent not connected");
    }

    return NextResponse.json({ agentId: agentDid, action });
  }
);
