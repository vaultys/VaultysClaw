import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  malformed,
} from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/channels/[id]/members
 * Add a member to a channel
 * Body: { memberDid, memberType, role?, invitedBy? }
 */
/**
 * @openapi
 * /api/channels/{id}/members:
 *   post:
 *     summary: Add a member to a channel.
 *     tags: [Channels]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberDid:
 *                 type: string
 *                 description: The DID of the member to add.
 *               memberType:
 *                 type: string
 *                 enum: [user, agent]
 *                 description: The type of the member.
 *               role:
 *                 type: string
 *                 enum: [member, moderator, owner]
 *                 description: The role of the member in the channel.
 *               invitedBy:
 *                 type: string
 *                 description: The DID of the inviter.
 *             required:
 *               - memberDid
 *               - memberType
 *     responses:
 *       201:
 *         description: Member added successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Conflict, member already exists.
 *       500:
 *         description: Internal server error.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const channel = await ChannelService.getChannel(id);

  if (!channel) {
    return notFound("Channel not found");
  }

  // Check authorization: moderator+ can add members
  const role = await ChannelService.getMemberRole(id, auth.did);
  if (role !== "moderator" && role !== "owner") {
    return forbidden();
  }

  const body = (await req.json()) as {
    memberDid?: string;
    memberType?: "user" | "agent";
    role?: "member" | "moderator" | "owner";
    invitedBy?: string;
  };

  if (!body.memberDid?.trim()) {
    return malformed("memberDid is required");
  }

  if (!body.memberType || !["user", "agent"].includes(body.memberType)) {
    return malformed("memberType must be 'user' or 'agent'");
  }

  const member = await ChannelService.addChannelMember({
    channelId: id,
    memberDid: body.memberDid.trim(),
    memberType: body.memberType,
    role: body.role ?? "member",
    invitedBy: body.invitedBy || auth.did,
  });

  return NextResponse.json({ member }, { status: 201 });
}

/**
 * DELETE /api/channels/[id]/members/:memberDid
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to remove member.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const memberDid = url.pathname.split("/").pop();

  if (!memberDid) {
    return NextResponse.json(
      { error: "memberDid is required" },
      { status: 400 }
    );
  }

  const channel = await ChannelService.getChannel(id);
  if (!channel) {
    return notFound("Channel not found");
  }

  // Check authorization: moderator+ can remove members
  const role = await ChannelService.getMemberRole(id, auth.did);
  if (role !== "moderator" && role !== "owner") {
    return forbidden();
  }

  await ChannelService.removeChannelMember(id, memberDid);

  return NextResponse.json({ success: true });
}
