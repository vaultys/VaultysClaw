import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/channels/[id]/messages/agent-response
 * Allows an agent to post a response to a channel or thread
 * Used when agents respond to mentions
 */
/**
 * @openapi
 * /api/channels/{id}/messages/agent-response:
 *   post:
 *     summary: Post an agent response to a channel or thread.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the channel.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: The content of the message.
 *               threadId:
 *                 type: string
 *                 description: The ID of the thread (optional).
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Additional metadata for the message (optional).
 *     responses:
 *       201:
 *         description: Message posted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   description: The posted message details.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to post message.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id: channelId } = await ctx.params;
    const channel = ChannelService.getChannel(channelId);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check if caller is a member of the channel
    if (!ChannelService.isMember(channelId, auth.did)) {
      return NextResponse.json(
        { error: "Caller is not a member of this channel" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      content: string;
      threadId?: string;
      metadata?: Record<string, any>;
    };

    if (!body.content?.trim()) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    // Post agent message
    const message = ChannelService.postMessage({
      channelId,
      authorDid: auth.did,
      authorType: "agent",
      content: body.content.trim(),
      threadId: body.threadId,
      metadata: body.metadata,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error(
      "POST /api/channels/[id]/messages/agent-response error:",
      err
    );
    return NextResponse.json(
      { error: "Failed to post message" },
      { status: 500 }
    );
  }
}
