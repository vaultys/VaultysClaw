/**
 * DELETE /api/agents/[did]/schedules/[id]          — Delete a schedule on an agent
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import {
import { withError } from "@/lib/api/handlers/with-error";
  unauthorized,
  forbidden,
  unavailable,
  notFound,
} from "@/lib/api/utils/api-utils";

/**
 * @openapi
 * /api/agent/{did}/schedules/{id}:
 *   delete:
 *     summary: Delete a schedule on an agent.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The decentralized identifier of the agent.
 *         schema:
 *           type: string
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the schedule to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Schedule successfully deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentId:
 *                   type: string
 *                 scheduleId:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const DELETE = withError(async (
  request: NextRequest,
  { params }: { params: Promise<{ did: string; id: string }> }
) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { did, id } = await params;
  const agentDid = decodeURIComponent(did);

  if (!(await auth.canAdminAgent(agentDid))) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return unavailable("WebSocket server not available");
  }

  const scheduleId = decodeURIComponent(id);

  const ok = wsServer.deleteScheduleOnAgent(agentDid, scheduleId);
  if (!ok) {
    return notFound("Agent not connected");
  }

  return NextResponse.json({ agentId: agentDid, scheduleId });
});
