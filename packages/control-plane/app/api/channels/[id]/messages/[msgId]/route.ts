import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  userContract,
} from "@/lib/contracts";

const handlers = createNextRoute(userContract.channels, {
  // ── GET /api/channels/:id/messages/:msgId ─────────────────────────────────
  getMessage: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");
    if (!(await ChannelService.isMember(params.id, auth.did)))
      throw new APIException("FORBIDDEN");

    const message = await ChannelService.getMessage(params.msgId);
    if (!message || message.channelId !== params.id)
      throw new APIException("NOT_FOUND", "Message not found");

    return { status: 200, body: { message } };
  },

  // ── PATCH /api/channels/:id/messages/:msgId ───────────────────────────────
  editMessage: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const message = await ChannelService.getMessage(params.msgId);
    if (!message || message.channelId !== params.id)
      throw new APIException("NOT_FOUND", "Message not found");

    // Only the author can edit their message
    if (message.authorDid !== auth.did) throw new APIException("FORBIDDEN");

    if (!body.content?.trim())
      throw new APIException("MALFORMED", "content is required");

    const updated = await ChannelService.editMessage(
      params.msgId,
      body.content.trim()
    );
    return { status: 200, body: { message: updated } };
  },

  // ── DELETE /api/channels/:id/messages/:msgId ──────────────────────────────
  deleteMessage: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const message = await ChannelService.getMessage(params.msgId);
    if (!message || message.channelId !== params.id)
      throw new APIException("NOT_FOUND", "Message not found");

    // Author can delete, or moderator+ in the channel
    const role = await ChannelService.getMemberRole(params.id, auth.did);
    const canDelete =
      message.authorDid === auth.did ||
      role === "moderator" ||
      role === "owner";
    if (!canDelete) throw new APIException("FORBIDDEN");

    await ChannelService.deleteMessage(params.msgId);
    return { status: 200, body: { success: true } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
