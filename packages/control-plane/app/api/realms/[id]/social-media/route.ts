/**
 * POST /api/realms/[id]/social-media/post
 *
 * Dispatches a post_to_x intent to the first available online agent in the realm.
 * The agent must have the social-media skill loaded and an active X session.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  malformed,
  unavailable,
} from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { IntentDAO, RealmDAO } from "@/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * @openapi
 * /api/realms/{id}/social-media:
 *   post:
 *     summary: Dispatch a social media post intent to an online agent.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the realm.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 description: The text to post on social media.
 *                 maxLength: 280
 *     responses:
 *       200:
 *         description: Post dispatched to agent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 intentId:
 *                   type: string
 *                 agentDid:
 *                   type: string
 *                 message:
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
 *         description: Service unavailable or no suitable agent found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id: realmId } = await ctx.params;
  const realm = await RealmDAO.findById(realmId);
  if (!realm) return notFound("Realm not found");
  if (!(await auth.canAccessRealm(realmId))) return forbidden();

  const body = (await req.json()) as { text?: string };
  if (!body.text || body.text.trim().length === 0) {
    return malformed("text is required");
  }
  if (body.text.trim().length > 280) {
    return malformed("text exceeds 280 characters");
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return unavailable("WebSocket server unavailable");
  }

  // Find the first online agent in this realm that has the social_media_posting capability
  const realmAgents = await RealmDAO.getAgents(realmId);
  let targetAgentDid: string | null = null;

  for (const ra of realmAgents) {
    const connected = wsServer.getAgent(ra.agentDid);
    if (!connected) continue;

    const caps: string[] = Array.isArray(ra.agent.capabilities)
      ? (ra.agent.capabilities as string[])
      : [];
    if (caps.includes("social_media_posting")) {
      targetAgentDid = ra.agentDid;
      break;
    }
  }

  if (!targetAgentDid) {
    return unavailable(
      "No online agent with social_media_posting capability found in this realm. " +
        "Ensure an agent is running and has the social-media skill enabled."
    );
  }

  const intentId = `intent-x-post-${crypto.randomUUID()}`;

  // Log intent before sending
  await IntentDAO.log(intentId, targetAgentDid, "post_to_x", {
    text: body.text,
  });

  const sent = wsServer.sendIntentToAgent(
    targetAgentDid,
    intentId,
    "post_to_x",
    { text: body.text.trim() },
    auth.did
  );

  if (!sent) {
    return unavailable("Failed to send intent to agent");
  }

  return NextResponse.json({
    success: true,
    intentId,
    agentDid: targetAgentDid,
    message: "Post dispatched to agent. Check the intent log for results.",
  });
}
