/**
 * POST /api/workspaces/[id]/social-media
 *
 * Dispatches a post_to_x intent to the first available online agent in the
 * workspace that has the social_media_posting capability.
 */

import crypto from "crypto";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { IntentDAO, WorkspaceDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

const handlers = createNextRoute(userContract.workspaces, {
  socialMedia: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");
    if (!(await auth.canAccessWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const text = body.text?.trim();
    if (!text) throw new APIException("MALFORMED", "text is required");
    if (text.length > 280)
      throw new APIException("MALFORMED", "text exceeds 280 characters");

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server unavailable");

    // First online agent in this workspace with the social_media_posting capability
    const workspaceAgents = await WorkspaceDAO.getAgents(params.id);
    let targetAgentDid: string | null = null;
    for (const ra of workspaceAgents) {
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
        "No online agent with social_media_posting capability found in this workspace. " +
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
