import { NextRequest, NextResponse } from "next/server";
import { ChannelService } from "@/lib/channel-service";
import { MessageDispatcher } from "@/lib/message-dispatcher";
import { TeamsGateway } from "@/lib/bridges/teams-gateway";
import { ChannelBridgeDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";
import {
  forbidden,
  malformed,
  notFound,
  unauthorized,
} from "@/lib/api/utils/api-utils";

/**
 * POST /api/bridges/teams/incoming
 * Public endpoint — called by Teams Bot Framework.
 * Verifies the request (stub) and routes the message to the matching VaultysClaw channel.
 */
/**
 * @openapi
 * /api/bridges/teams/incoming:
 *   post:
 *     summary: Process incoming messages from Teams Bot Framework.
 *     tags: [Bridges]
 *     requestBody:
 *       description: Teams Activity object.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *               from:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *               channelId:
 *                 type: string
 *               conversation:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *               type:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 messageId:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to process Teams message.
 */
export const POST = withError(async (req: NextRequest) => {
  const body = await req.text();
  const authHeader = req.headers.get("authorization");

  // Verify Teams Bot Framework request (stub — always true for now)
  if (!TeamsGateway.verifyTeamsRequest(body, authHeader)) {
    return unauthorized();
  }

  // Parse Teams Activity object
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
    return malformed("Invalid JSON body");
  }

  // Only handle message activities
  if (activity.type && activity.type !== "message") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const content = activity.text?.trim();
  if (!content) {
    return malformed("message text is required");
  }

  const teamsChannelId = activity.channelId;
  if (!teamsChannelId) {
    return malformed("channelId is required in activity");
  }

  // Find bridge by external channel ID
  const bridge = await ChannelBridgeDAO.getByExternalChannelId(
    "teams",
    teamsChannelId
  );
  if (!bridge) {
    return notFound("No bridge found for this Teams channel");
  }

  if (!bridge.isSyncEnabled) {
    return NextResponse.json(
      { error: "Bridge sync is disabled" },
      { status: 403 }
    );
  }
  if (bridge.syncDirection === "outgoing") {
    return forbidden("Bridge is configured for outgoing messages only");
  }

  const fromId = activity.from?.id ?? "teams:unknown";
  const fromName = activity.from?.name ?? "Teams User";
  const authorDid = `teams:${fromId}`;
  const threadId = activity.conversation?.id ?? undefined;

  // Create channel message
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

  // Dispatch @mentions if any
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

  return NextResponse.json({ ok: true, messageId: message.id });
});
