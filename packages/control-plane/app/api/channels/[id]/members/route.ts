import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.channels, {
  // ── POST /api/channels/:id/members ────────────────────────────────────────
  addMember: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");

    // Only moderator+ can add members
    const role = await ChannelService.getMemberRole(params.id, auth.did);
    if (role !== "moderator" && role !== "owner")
      throw new APIException("FORBIDDEN");

    if (!body.memberDid?.trim())
      throw new APIException("MALFORMED", "memberDid is required");

    const memberDid = body.memberDid.trim();
    const existingRole = await ChannelService.getMemberRole(params.id, memberDid);
    if (existingRole)
      throw new APIException(
        "CONFLICT",
        `Member ${memberDid} is already in this channel`
      );

    const member = await ChannelService.addChannelMember({
      channelId: params.id,
      memberDid,
      memberType: body.memberType,
      role: body.role ?? "member",
      invitedBy: body.invitedBy || auth.did,
    });

    const [enriched] = await ChannelService.withMemberNames([member]);
    return { status: 201, body: { member: enriched } };
  },
});

export const POST = handlers.POST!;
