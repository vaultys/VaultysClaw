import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { withError } from "@/lib/api/handlers/with-error";

type Ctx = { params: Promise<{ id: string; memberDid: string }> };

/**
 * DELETE /api/channels/[id]/members/[memberDid]
 * Remove a member from a channel
 */
/**
 * @openapi
 * /api/channels/{id}/members/{memberDid}:
 *   delete:
 *     summary: Remove a member from a channel.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the channel.
 *         schema:
 *           type: string
 *       - name: memberDid
 *         in: path
 *         required: true
 *         description: The DID of the member to remove.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to remove member.
 */
export const DELETE = withError(async (req: NextRequest, ctx: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id, memberDid: rawMemberDid } = await ctx.params;
  const memberDid = decodeURIComponent(rawMemberDid);

  const channel = await ChannelService.getChannel(id);
  if (!channel) {
    return notFound("Channel not found");
  }

  // Check authorization: moderator+ can remove members
  const role = await ChannelService.getMemberRole(id, auth.did);
  if (role !== "moderator" && role !== "owner") {
    return forbidden();
  }

  // Idempotent: succeeds even if the membership (or the agent itself)
  // no longer exists, so stale members can always be cleaned up.
  await ChannelService.removeChannelMember(id, memberDid);

  return NextResponse.json({ success: true });
});
