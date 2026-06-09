import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/channels/[id]
 * Get channel details including members
 */
/**
 * @openapi
 * /api/channels/{id}:
 *   get:
 *     summary: Get channel details including members.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the channel.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Channel details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 channel:
 *                   $ref: '#/components/schemas/Channel'
 *                 members:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Member'
 *                 stats:
 *                   $ref: '#/components/schemas/ChannelStats'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch channel.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const channel = await ChannelService.getChannel(id);

  if (!channel) {
    return notFound("Channel not found");
  }

  // Check access: member can view their channels, admins can view all in their realm
  if (channel.realmId && !(await auth.canAccessRealm(channel.realmId))) {
    return forbidden();
  }

  const members = await ChannelService.getChannelMembers(id);
  const stats = await ChannelService.getChannelStats(id);

  return NextResponse.json({
    channel,
    members,
    stats,
  });
}

/**
 * PATCH /api/channels/[id]
 * Update channel metadata
 * Body: { name?, description?, topic?, isPublic? }
 */
/**
 * @openapi
 * /api/channels/{id}:
 *   patch:
 *     summary: Update channel metadata
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Channel ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               topic:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Channel updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 channel:
 *                   $ref: '#/components/schemas/Channel'
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
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const channel = await ChannelService.getChannel(id);

  if (!channel) {
    return notFound("Channel not found");
  }

  // Check authorization: channel owner or realm admin
  const role = await ChannelService.getMemberRole(id, auth.did);
  const isChannelOwner = role === "owner";
  const isRealmAdmin =
    channel.realmId && (await auth.canAdminRealm(channel.realmId));
  const isGlobalAdmin = !channel.realmId && auth.isGlobalAdmin;

  if (!isChannelOwner && !isRealmAdmin && !isGlobalAdmin) {
    return forbidden();
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    topic?: string;
    isPublic?: boolean;
  };

  const updated = await ChannelService.updateChannel(id, {
    name: body.name?.trim(),
    description: body.description?.trim(),
    topic: body.topic?.trim(),
    isPublic: body.isPublic,
  });

  return NextResponse.json({ channel: updated });
}

/**
 * DELETE /api/channels/[id]
 * Archive a channel (soft delete)
 */
/**
 * @openapi
 * /api/channels/{id}:
 *   delete:
 *     summary: Archive a channel (soft delete)
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Channel ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Channel archived successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const channel = await ChannelService.getChannel(id);

  if (!channel) {
    return notFound("Channel not found");
  }

  // Check authorization: channel owner or realm admin
  const role = await ChannelService.getMemberRole(id, auth.did);
  const isChannelOwner = role === "owner";
  const isRealmAdmin =
    channel.realmId && (await auth.canAdminRealm(channel.realmId));
  const isGlobalAdmin = !channel.realmId && auth.isGlobalAdmin;

  if (!isChannelOwner && !isRealmAdmin && !isGlobalAdmin) {
    return forbidden();
  }

  await ChannelService.archiveChannel(id);

  return NextResponse.json({ success: true });
}
