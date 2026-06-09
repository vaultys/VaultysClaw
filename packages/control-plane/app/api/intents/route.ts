import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWSServer } from "@/lib/ws-server";
import { GrantDAO, IntentDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";
import {
  forbidden,
  malformed,
  notFound,
  unauthorized,
  unavailable,
} from "@/lib/api/utils/api-utils";

/**
 * POST /api/intents
 * Send an intent to one or more agents.
 * Owners can send any intent; non-owners must have an active grant covering
 * the target agent + action (capability).
 */
/**
 * @openapi
 * /api/intents:
 *   post:
 *     summary: Send an intent to one or more agents.
 *     tags: [Intents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agentId:
 *                 type: string
 *                 description: ID of the target agent.
 *               action:
 *                 type: string
 *                 description: Action to be performed.
 *               params:
 *                 type: object
 *                 description: Parameters for the action.
 *               broadcastCapability:
 *                 type: string
 *                 description: Capability to broadcast to all agents.
 *     responses:
 *       202:
 *         description: Intent accepted and being processed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 intentId:
 *                   type: string
 *                   description: Unique identifier for the intent.
 *                 action:
 *                   type: string
 *                   description: Action to be performed.
 *                 sentTo:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of agents the intent was sent to.
 *                 count:
 *                   type: integer
 *                   description: Number of agents the intent was sent to.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to send intent.
 */
export const POST = withError(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorized();
  }

  const body = await request.json();
  const { agentId, action, params, broadcastCapability } = body;

  // Non-owner delegation check
  if (!session.user.isAdmin) {
    if (!session.user.did) {
      return forbidden("User account does not have a DID");
    }
    const capability: string = action ?? broadcastCapability;
    if (!capability) {
      return malformed("action or broadcastCapability required");
    }

    const targetAgentId: string | null = agentId ?? null;

    // Check if user has a grant covering this agent + capability
    const grants = await GrantDAO.listByUser(session.user.did);
    const hasGrant = grants.some((g) => {
      const caps = g.capabilities as string[];
      const agentMatch = g.agentDid === null || g.agentDid === targetAgentId;
      const capMatch = caps.includes(capability);
      const notExpired = !g.expiresAt || new Date(g.expiresAt) > new Date();
      return agentMatch && capMatch && notExpired;
    });

    if (!hasGrant) {
      return forbidden("No grant found for this agent/capability");
    }
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return unavailable("WebSocket server not initialized");
  }

  const intentId = `intent-${Date.now()}`;
  let sentTo: string[] = [];
  // Pass userDid to agent for delegation verification when the caller is not the owner
  const intentUserDid = session.user.isAdmin
    ? undefined
    : (session.user.did ?? undefined);

  if (broadcastCapability) {
    // Broadcast to all agents with specific capability
    sentTo = await wsServer.broadcastIntentToCapability(
      broadcastCapability,
      intentId,
      action,
      params,
      intentUserDid
    );

    if (sentTo.length === 0) {
      return notFound("No agents with required capability");
    }
  } else if (agentId) {
    // Send to specific agent
    const success = wsServer.sendIntentToAgent(
      agentId,
      intentId,
      action,
      params,
      intentUserDid
    );

    if (!success) {
      return notFound("Agent not found or not connected");
    }

    sentTo = [agentId];
  } else {
    return malformed("Must specify agentId or broadcastCapability");
  }

  return NextResponse.json(
    {
      intentId,
      action,
      sentTo,
      count: sentTo.length,
    },
    { status: 202 }
  );
});

/**
 * GET /api/intents
 * List recent intents with their execution results. Admin only.
 */
/**
 * @openapi
 * /api/intents:
 *   get:
 *     summary: List recent intents with their execution results.
 *     tags: [Intents]
 *     responses:
 *       200:
 *         description: A list of recent intents.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 intents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       intentId:
 *                         type: string
 *                       agentDid:
 *                         type: string
 *                       action:
 *                         type: string
 *                       params:
 *                         type: object
 *                       status:
 *                         type: string
 *                       output:
 *                         type: object
 *                         nullable: true
 *                       error:
 *                         type: string
 *                         nullable: true
 *                       sentAt:
 *                         type: string
 *                         format: date-time
 *                       completedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Failed to fetch intents.
 */
export const GET = withError(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const agentDid = searchParams.get("agentDid") ?? undefined;

  const rows = await IntentDAO.findAll(limit, agentDid);
  const intents = rows.map((r) => ({
    intentId: r.intentId,
    agentDid: r.agentDid,
    action: r.action,
    params: r.params ? r.params : {},
    status: r.status,
    output: r.output ? r.output : null,
    error: r.error,
    sentAt: r.sentAt,
    completedAt: r.completedAt,
  }));

  return NextResponse.json({ intents });
});
