import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string; msgId: string }> };

/**
 * POST /api/channels/[id]/messages/[msgId]/reactions
 * Add or remove a reaction to a message
 * Body: { emoji, add: boolean }
 */
/**
 * @openapi
 * /api/channels/{id}/messages/{msgId}/reactions:
 *   post:
 *     summary: Add or remove a reaction to a message.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Channel ID
 *         schema:
 *           type: string
 *       - name: msgId
 *         in: path
 *         required: true
 *         description: Message ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emoji:
 *                 type: string
 *                 description: Emoji to react with
 *               add:
 *                 type: boolean
 *                 description: Whether to add or remove the reaction
 *     responses:
 *       200:
 *         description: Reaction updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
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
 *       500:
 *         description: Internal server error
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id, msgId } = await ctx.params;

    // Verify channel access and membership
    const channel = ChannelService.getChannel(id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (!ChannelService.isMember(id, auth.did)) {
      return forbidden();
    }

    const message = ChannelService.getMessage(msgId);
    if (!message || message.channelId !== id) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const body = (await req.json()) as { emoji?: string; add?: boolean };

    if (!body.emoji?.trim()) {
      return NextResponse.json(
        { error: "emoji is required" },
        { status: 400 }
      );
    }

    const isAdd = body.add !== false;

    try {
      const updated = isAdd
        ? ChannelService.addReaction(msgId, body.emoji.trim(), auth.did)
        : ChannelService.removeReaction(msgId, body.emoji.trim(), auth.did);

      return NextResponse.json({ message: updated });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error(
      "POST /api/channels/[id]/messages/[msgId]/reactions error:",
      err
    );
    return NextResponse.json(
      { error: "Failed to update reaction" },
      { status: 500 }
    );
  }
}
