import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { channelsContract } from "@/lib/contracts";

const handlers = createNextRoute(channelsContract, {
  // ── POST /api/channels/:id/messages/:msgId/reactions ──────────────────────
  react: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");
    if (!(await ChannelService.isMember(params.id, auth.did)))
      throw new APIException("FORBIDDEN");

    const message = await ChannelService.getMessage(params.msgId);
    if (!message || message.channelId !== params.id)
      throw new APIException("NOT_FOUND", "Message not found");

    if (!body.emoji?.trim())
      throw new APIException("MALFORMED", "emoji is required");

    const emoji = body.emoji.trim();
    const updated = body.add
      ? await ChannelService.addReaction(params.msgId, emoji, auth.did)
      : await ChannelService.removeReaction(params.msgId, emoji, auth.did);

    return { status: 200, body: { message: updated } };
  },
});

export const POST = handlers.POST!;
