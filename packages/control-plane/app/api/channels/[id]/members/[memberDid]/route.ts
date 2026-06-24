import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { channelsContract } from "@/lib/contracts";

const handlers = createNextRoute(channelsContract, {
  // ── DELETE /api/channels/:id/members/:memberDid ───────────────────────────
  removeMember: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    // createNextRoute already decodes path params.
    const memberDid = params.memberDid;

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");

    // Only moderator+ can remove members
    const role = await ChannelService.getMemberRole(params.id, auth.did);
    if (role !== "moderator" && role !== "owner")
      throw new APIException("FORBIDDEN");

    // Idempotent: succeeds even if the membership (or the agent itself)
    // no longer exists, so stale members can always be cleaned up.
    await ChannelService.removeChannelMember(params.id, memberDid);

    return { status: 200, body: { success: true } };
  },
});

export const DELETE = handlers.DELETE!;
