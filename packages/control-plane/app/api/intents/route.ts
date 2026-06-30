import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWSServer } from "@/lib/ws-server";
import { AgentDAO, GrantDAO, IntentDAO, RealmDAO } from "@/db";
import { getAuthContext } from "@/lib/auth-utils";
import { signIntent, verifyIntentSignature } from "@/lib/intent-signing";
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

  const intentId = `intent-${Date.now()}`;
  // Pass userDid to agent for delegation verification when the caller is not the owner
  const intentUserDid = session.user.isAdmin
    ? undefined
    : (session.user.did ?? undefined);
  // The linked device / identity that initiated this intent (for per-device audit).
  const initiatorDid = session.user.deviceDid ?? session.user.did ?? null;

  // ── Single-agent path: deny-by-default policy decision + signed audit ───────
  // Every decision (ALLOW or DENY) is signed by the control plane and persisted
  // so the audit trail is non-repudiable.
  if (agentId && action && !broadcastCapability) {
    const agent = await AgentDAO.findByDid(agentId);
    if (!agent) return notFound("Agent not found");

    const agentCaps = (agent.capabilities as string[]) ?? [];
    const capabilityOk = agentCaps.includes(action);

    // Non-admin callers additionally need a grant covering this agent + action.
    let grantOk = true;
    if (!session.user.isAdmin) {
      if (!session.user.did) {
        return forbidden("User account does not have a DID");
      }
      const grants = await GrantDAO.listByUser(session.user.did);
      grantOk = grants.some((g) => {
        const caps = g.capabilities as string[];
        const agentMatch = g.agentDid === null || g.agentDid === agentId;
        const capMatch = caps.includes(action);
        const notExpired = !g.expiresAt || new Date(g.expiresAt) > new Date();
        return agentMatch && capMatch && notExpired;
      });
    }

    const allowed = capabilityOk && grantOk;
    const reason = allowed
      ? null
      : !capabilityOk
        ? `no capability "${action}"`
        : `no grant for capability "${action}"`;

    // Sign the decision envelope with the server's VaultysId.
    const signature = await signIntent(intentId, action, agentId);

    if (!allowed) {
      await IntentDAO.logDecision({
        intentId,
        agentDid: agentId,
        action,
        params: params ?? {},
        decision: "DENY",
        reason,
        signature,
        initiatorDid,
      });
      return NextResponse.json(
        { intentId, action, agent: agentId, decision: "DENY", reason },
        { status: 403 }
      );
    }

    // Allowed — record the decision, then dispatch if the agent is connected.
    await IntentDAO.logDecision({
      intentId,
      agentDid: agentId,
      action,
      params: params ?? {},
      decision: "ALLOW",
      signature,
      status: "pending",
      initiatorDid,
    });

    const wsServer = getWSServer();
    let sentTo: string[] = [];
    if (
      wsServer &&
      (await wsServer.sendIntentToAgent(agentId, intentId, action, params, intentUserDid))
    ) {
      sentTo = [agentId];
    }

    return NextResponse.json(
      { intentId, action, agent: agentId, decision: "ALLOW", sentTo, count: sentTo.length },
      { status: 202 }
    );
  }

  // ── Broadcast path (capability fan-out) — unchanged grant semantics ─────────
  if (!session.user.isAdmin) {
    if (!session.user.did) {
      return forbidden("User account does not have a DID");
    }
    const capability: string = action ?? broadcastCapability;
    if (!capability) {
      return malformed("action or broadcastCapability required");
    }
    const grants = await GrantDAO.listByUser(session.user.did);
    const hasGrant = grants.some((g) => {
      const caps = g.capabilities as string[];
      const agentMatch = g.agentDid === null || g.agentDid === (agentId ?? null);
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

  let sentTo: string[] = [];
  if (broadcastCapability) {
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
  } else {
    return malformed("Must specify agentId (with action) or broadcastCapability");
  }

  return NextResponse.json(
    { intentId, action, sentTo, count: sentTo.length },
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
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { searchParams } = new URL(request.url);
  // `last` is an alias for `limit` (used by the CLI's `audit tail --last N`).
  const rawLimit = searchParams.get("last") ?? searchParams.get("limit") ?? "100";
  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 100, 1), 500);
  const agentDid = searchParams.get("agentDid") ?? undefined;

  let allowedAgentDids: Set<string> | undefined;
  if (!auth.isGlobalAdmin) {
    if (auth.realmIds.size === 0) {
      allowedAgentDids = new Set(); // no realms → no agents → no intents
    } else {
      const perRealm = await Promise.all(
        [...auth.realmIds].map((id) => RealmDAO.getAgents(id))
      );
      allowedAgentDids = new Set(perRealm.flat().map((ra) => ra.agent.did));
    }
  }

  const rows = await IntentDAO.findAll(limit, agentDid, allowedAgentDids);
  const intents = await Promise.all(
    rows.map(async (r) => ({
      intentId: r.intentId,
      agentDid: r.agentDid,
      action: r.action,
      params: r.params ? r.params : {},
      status: r.status,
      decision: r.decision,
      reason: r.reason,
      output: r.output ? r.output : null,
      error: r.error,
      signature: r.signature,
      // Independently re-verify the stored signature against the server identity.
      verified: await verifyIntentSignature(r.signature, {
        intentId: r.intentId,
        action: r.action,
        agentId: r.agentDid,
      }),
      sentAt: r.sentAt,
      completedAt: r.completedAt,
    }))
  );

  return NextResponse.json({ intents });
});
