/**
 * POST /api/bridges/teams/incoming
 * Public endpoint — called by the Teams Bot Framework. Verifies the request
 * (over the raw body) and routes the message to the matching VaultysClaw channel.
 */

import { ChannelService } from "@/lib/channel-service";
import { MessageDispatcher } from "@/lib/message-dispatcher";
import { TeamsGateway } from "@/lib/bridges/teams-gateway";
import { ChannelBridgeDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { bridgesContract } from "@/lib/contracts";

const handlers = createNextRoute(bridgesContract, {
  // The contract body is opaque so createNextRoute leaves the request stream
  // intact — we read the raw text here for Bot Framework auth verification.
  teamsIncoming: async ({ request }) => {
    const body = await request.text();
    const authHeader = request.headers.get("authorization");

    // Verify Teams Bot Framework request (stub — always true for now)
    if (!TeamsGateway.verifyTeamsRequest(body, authHeader))
      throw new APIException("UNAUTHORIZED");

    let activity: {
      text?: string;
      from?: { id?: string; name?: string };
      channelId?: string; // Teams channel identifier (not VaultysClaw channel)
      conversation?: { id?: string };
      type?: string;
    };
    try {
      activity = JSON.parse(body) as typeof activity;
    } catch {
      throw new APIException("MALFORMED", "Invalid JSON body");
    }

    // Only handle message activities
    if (activity.type && activity.type !== "message")
      return { status: 200, body: { ok: true, messageId: "" } };

    const content = activity.text?.trim();
    if (!content) throw new APIException("MALFORMED", "message text is required");

    const teamsChannelId = activity.channelId;
    if (!teamsChannelId)
      throw new APIException("MALFORMED", "channelId is required in activity");

    const bridge = await ChannelBridgeDAO.getByExternalChannelId(
      "teams",
      teamsChannelId
    );
    if (!bridge)
      throw new APIException("NOT_FOUND", "No bridge found for this Teams channel");

    if (!bridge.isSyncEnabled)
      throw new APIException("FORBIDDEN", "Bridge sync is disabled");
    if (bridge.syncDirection === "outgoing")
      throw new APIException(
        "FORBIDDEN",
        "Bridge is configured for outgoing messages only"
      );

    const fromId = activity.from?.id ?? "teams:unknown";
    const fromName = activity.from?.name ?? "Teams User";
    const authorDid = `teams:${fromId}`;
    const threadId = activity.conversation?.id ?? undefined;

    const message = await ChannelService.postMessage({
      channelId: bridge.channelId,
      authorDid,
      authorType: "user",
      content,
      ...(threadId ? { threadId } : {}),
      metadata: {
        agentAction: "teams_incoming",
        attachments: [],
        mentions: [`teams:${fromName}`],
      },
    });

    await MessageDispatcher.processMessage(
      bridge.channelId,
      message.id,
      authorDid,
      content,
      {
        id: message.id,
        authorType: "user",
        threadId: message.threadId,
        createdAt: message.createdAt,
      }
    );

    return { status: 200, body: { ok: true, messageId: message.id } };
  },
});

export const POST = handlers.POST!;
