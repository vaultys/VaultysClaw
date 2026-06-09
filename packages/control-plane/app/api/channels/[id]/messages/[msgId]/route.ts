import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound, malformed } from "@/lib/api-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string; msgId: string }> };

/**
 * GET /api/channels/[id]/messages/[msgId]
 * Get a specific message
 */
/**
 * @openapi
 * /api/channels/{id}/messages/{msgId}:
 *   get:
 *     summary: Get a specific message
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: msgId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch message
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id, msgId } = await ctx.params;

  // Verify channel access
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

  return NextResponse.json({ message });
}

/**
 * PATCH /api/channels/[id]/messages/[msgId]
 * Edit a message
 * Body: { content }
 */
/**
 * @openapi
 * /api/channels/{id}/messages/{msgId}:
 *   patch:
 *     summary: Edit a specific message in a channel.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the channel.
 *         schema:
 *           type: string
 *       - name: msgId
 *         in: path
 *         required: true
 *         description: The ID of the message.
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
 *                 description: The new content of the message.
 *     responses:
 *       200:
 *         description: Message successfully edited.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to edit message.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id, msgId } = await ctx.params;

  const message = await ChannelService.getMessage(msgId);
  if (!message || message.channelId !== id) {
    return notFound("Message not found");
  }

  // Only the author can edit their message
  if (message.authorDid !== auth.did) {
    return forbidden();
  }

  const body = (await req.json()) as { content?: string };

  if (!body.content?.trim()) {
    return malformed("content is required");
  }

  const updated = await ChannelService.editMessage(msgId, body.content.trim());

  return NextResponse.json({ message: updated });
}

/**
 * DELETE /api/channels/[id]/messages/[msgId]
 * Delete a message (soft delete)
 */
/**
 * @openapi
 * /api/channels/{id}/messages/{msgId}:
 *   delete:
 *     summary: Soft delete a message in a channel.
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
 *     responses:
 *       200:
 *         description: Message successfully deleted.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to delete message.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id, msgId } = await ctx.params;

  const message = await ChannelService.getMessage(msgId);
  if (!message || message.channelId !== id) {
    return notFound("Message not found");
  }

  // Author can delete, or moderator+ in the channel
  const role = await ChannelService.getMemberRole(id, auth.did);
  const canDelete =
    message.authorDid === auth.did || role === "moderator" || role === "owner";

  if (!canDelete) {
    return forbidden();
  }

  await ChannelService.deleteMessage(msgId);

  return NextResponse.json({ success: true });
}
