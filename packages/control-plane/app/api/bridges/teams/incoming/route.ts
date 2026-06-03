import { NextRequest, NextResponse } from "next/server";
import { ChannelBridgeService } from "@/lib/channel-bridge-service";
import { ChannelService } from "@/lib/channel-service";
import { MessageDispatcher } from "@/lib/message-dispatcher";
import { TeamsGateway } from "@/lib/bridges/teams-gateway";
import { ChannelBridgeDAO } from "@/db";

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
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const authHeader = req.headers.get("authorization");

    // Verify Teams Bot Framework request (stub — always true for now)
    if (!TeamsGateway.verifyTeamsRequest(body, authHeader)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Only handle message activities
    if (activity.type && activity.type !== "message") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const content = activity.text?.trim();
    if (!content) {
      return NextResponse.json(
        { error: "message text is required" },
        { status: 400 }
      );
    }

    const teamsChannelId = activity.channelId;
    if (!teamsChannelId) {
      return NextResponse.json(
        { error: "channelId is required in activity" },
        { status: 400 }
      );
    }

    // Find bridge by external channel ID
    const bridge = ChannelBridgeDAO.getByExternalChannelId(
      "teams",
      teamsChannelId
    );
    if (!bridge) {
      return NextResponse.json(
        { error: "No bridge found for this Teams channel" },
        { status: 404 }
      );
    }

    if (!bridge.isSyncEnabled) {
      return NextResponse.json(
        { error: "Bridge sync is disabled" },
        { status: 403 }
      );
    }
    if (bridge.syncDirection === "outgoing") {
      return NextResponse.json(
        { error: "Bridge does not accept incoming messages" },
        { status: 403 }
      );
    }

    const fromId = activity.from?.id ?? "teams:unknown";
    const fromName = activity.from?.name ?? "Teams User";
    const authorDid = `teams:${fromId}`;
    const threadId = activity.conversation?.id ?? undefined;

    // Create channel message
    const message = ChannelService.postMessage({
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
  } catch (err) {
    console.error("POST /api/bridges/teams/incoming error:", err);
    return NextResponse.json(
      { error: "Failed to process Teams message" },
      { status: 500 }
    );
  }
}
