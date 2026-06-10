import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  malformed,
} from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { withError } from "@/lib/api/handlers/with-error";

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
export const POST = withError(async (req: NextRequest, ctx: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id, msgId } = await ctx.params;

  // Verify channel access and membership
  const channel = await ChannelService.getChannel(id);
  if (!channel) {
    return notFound("Channel not found");
  }

  if (!(await ChannelService.isMember(id, auth.did))) {
    return forbidden();
  }

  const message = await ChannelService.getMessage(msgId);
  if (!message || message.channelId !== id) {
    return notFound("Message not found");
  }

  const body = (await req.json()) as { emoji?: string; add?: boolean };

  if (!body.emoji?.trim()) {
    return malformed("emoji is required");
  }

  const isAdd = body.add !== false;
  const updated = isAdd
    ? await ChannelService.addReaction(msgId, body.emoji.trim(), auth.did)
    : await ChannelService.removeReaction(msgId, body.emoji.trim(), auth.did);

  return NextResponse.json({ message: updated });
});
