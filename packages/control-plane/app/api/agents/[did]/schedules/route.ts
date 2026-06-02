/**
 * POST   /api/agents/[did]/schedules          — Upsert a schedule on an agent
 * DELETE /api/agents/[did]/schedules          — Delete a schedule on an agent
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * @openapi
 * /api/agents/{did}/schedules:
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
 *                 success:
 *                   type: boolean
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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { did } = await params;
  const agentDid = decodeURIComponent(did);

  if (!auth.canAdminAgent(agentDid)) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json(
      { error: "WebSocket server not available" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const {
    id,
    name,
    cron,
    action,
    params: schedParams,
    enabled,
  } = body as {
    id?: string;
    name?: string;
    cron?: string;
    action?: string;
    params?: Record<string, unknown>;
    enabled?: boolean;
  };

  if (!id || !name || !cron || !action) {
    return NextResponse.json(
      { error: "id, name, cron, and action are required strings" },
      { status: 400 }
    );
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
    return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    agentId: agentDid,
    scheduleId: id,
  });
}

/**
 * @openapi
 * /api/agents/{did}/schedules:
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
 *         in: query
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
 *                 success:
 *                   type: boolean
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { did } = await params;
  const agentDid = decodeURIComponent(did);

  if (!auth.canAdminAgent(agentDid)) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json(
      { error: "WebSocket server not available" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get("id");

  if (!scheduleId) {
    return NextResponse.json(
      { error: "id query parameter is required" },
      { status: 400 }
    );
  }

  const ok = wsServer.deleteScheduleOnAgent(agentDid, scheduleId);
  if (!ok) {
    return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
  }

  return NextResponse.json({ success: true, agentId: agentDid, scheduleId });
}
