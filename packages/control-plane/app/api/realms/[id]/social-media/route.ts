/**
 * POST /api/realms/[id]/social-media/post
 *
 * Dispatches a post_to_x intent to the first available online agent in the realm.
 * The agent must have the social-media skill loaded and an active X session.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getRealmById, getRealmAgents, logIntent } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { getWSServer } from "@/lib/ws-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id: realmId } = await ctx.params;
  const realm = getRealmById(realmId);
  if (!realm) return NextResponse.json({ error: "Realm not found" }, { status: 404 });
  if (!auth.canAccessRealm(realmId)) return forbidden();

  const body = await req.json() as { text?: string };
  if (!body.text || body.text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (body.text.trim().length > 280) {
    return NextResponse.json({ error: "text exceeds 280 characters" }, { status: 400 });
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: "WebSocket server unavailable" }, { status: 503 });
  }

  // Find the first online agent in this realm that has the social_media_posting capability
  const realmAgents = getRealmAgents(realmId) as Array<{ agent_did: string; capabilities?: string }>;
  let targetAgentDid: string | null = null;

  for (const ra of realmAgents) {
    const connected = wsServer.getAgent(ra.agent_did);
    if (!connected) continue;

    const caps: string[] = JSON.parse(ra.capabilities ?? "[]");
    if (caps.includes("social_media_posting")) {
      targetAgentDid = ra.agent_did;
      break;
    }
  }

  if (!targetAgentDid) {
    return NextResponse.json(
      {
        error:
          "No online agent with social_media_posting capability found in this realm. " +
          "Ensure an agent is running and has the social-media skill enabled.",
      },
      { status: 503 },
    );
  }

  const intentId = `intent-x-post-${crypto.randomUUID()}`;

  // Log intent before sending
  logIntent(intentId, targetAgentDid, "post_to_x", { text: body.text });

  const sent = wsServer.sendIntentToAgent(
    targetAgentDid,
    intentId,
    "post_to_x",
    { text: body.text.trim() },
    auth.did,
  );

  if (!sent) {
    return NextResponse.json({ error: "Failed to dispatch intent to agent" }, { status: 503 });
  }

  return NextResponse.json({
    success: true,
    intentId,
    agentDid: targetAgentDid,
    message: "Post dispatched to agent. Check the intent log for results.",
  });
}
