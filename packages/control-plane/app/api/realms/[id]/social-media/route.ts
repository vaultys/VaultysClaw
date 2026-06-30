/**
 * POST /api/realms/[id]/social-media
 *
 * Dispatches a post_to_x intent to the first available online agent in the
 * realm that has the social_media_posting capability.
 */

import crypto from "crypto";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { IntentDAO, RealmDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { realmsContract } from "@/lib/contracts";

const handlers = createNextRoute(realmsContract, {
  socialMedia: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");
    if (!(await auth.canAccessRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const text = body.text?.trim();
    if (!text) throw new APIException("MALFORMED", "text is required");
    if (text.length > 280)
      throw new APIException("MALFORMED", "text exceeds 280 characters");

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server unavailable");

    // First online agent in this realm with the social_media_posting capability
    const realmAgents = await RealmDAO.getAgents(params.id);
    let targetAgentDid: string | null = null;
    for (const ra of realmAgents) {
      if (!wsServer.getAgent(ra.agentDid)) continue;
      const caps: string[] = Array.isArray(ra.agent.capabilities)
        ? (ra.agent.capabilities as string[])
        : [];
      if (caps.includes("social_media_posting")) {
        targetAgentDid = ra.agentDid;
        break;
      }
    }

    if (!targetAgentDid)
      throw new APIException(
        "UNAVAILABLE",
        "No online agent with social_media_posting capability found in this realm. " +
          "Ensure an agent is running and has the social-media skill enabled."
      );

    const intentId = `intent-x-post-${crypto.randomUUID()}`;
    await IntentDAO.log(intentId, targetAgentDid, "post_to_x", { text });

    const sent = wsServer.sendIntentToAgent(
      targetAgentDid,
      intentId,
      "post_to_x",
      { text },
      auth.did
    );
    if (!sent)
      throw new APIException("UNAVAILABLE", "Failed to send intent to agent");

    return {
      status: 200,
      body: {
        success: true,
        intentId,
        agentDid: targetAgentDid,
        message: "Post dispatched to agent. Check the intent log for results.",
      },
    };
  },
});

export const POST = handlers.POST!;
