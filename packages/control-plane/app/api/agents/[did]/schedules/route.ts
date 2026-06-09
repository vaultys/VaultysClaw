/**
 * POST   /api/agents/[did]/schedules          — Upsert a schedule on an agent
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  unavailable,
  malformed,
  notFound,
} from "@/lib/api/utils/api-utils";
import { AgentSchedule } from "@/types/api/requests";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * @openapi
 * /api/agent/{did}/schedules:
 *   post:
 *     summary: Upsert a schedule on an agent.
 *     tags: [Agents]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *         description: The decentralized identifier of the agent.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *               cron:
 *                 type: string
 *               action:
 *                 type: string
 *               params:
 *                 type: object
 *                 additionalProperties: true
 *               enabled:
 *                 type: boolean
 *             required:
 *               - id
 *               - name
 *               - cron
 *               - action
 *     responses:
 *       200:
 *         description: Schedule successfully upserted.
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
 *       503:
 *         description: WebSocket server not available.
 */
export const POST = withError(async (
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { did } = await params;
  const agentDid = decodeURIComponent(did);

  if (!(await auth.canAdminAgent(agentDid))) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return unavailable("WebSocket server not available");
  }

  const body = await request.json();
  const {
    id,
    name,
    cron,
    action,
    params: schedParams,
    enabled,
  } = body as AgentSchedule;

  if (!id || !name || !cron || !action) {
    return malformed("id, name, cron, and action are required strings");
  }

  const ok = wsServer.sendScheduleToAgent(agentDid, {
    id,
    name,
    cron,
    action,
    params: schedParams ?? {},
    enabled: enabled !== false,
  });
  if (!ok) {
    return notFound("Agent not connected");
  }

  return NextResponse.json({
    agentId: agentDid,
    scheduleId: id,
  });
});
