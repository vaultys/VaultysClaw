import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  userContract,
} from "@/lib/contracts";

const handlers = createNextRoute(userContract.channels, {
  // ── POST /api/channels/:id/messages/agent-response ────────────────────────
  postAgentResponse: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");
    if (!(await ChannelService.isMember(params.id, auth.did)))
      throw new APIException("FORBIDDEN");

    if (!body.content?.trim())
      throw new APIException("MALFORMED", "content is required");

    const message = await ChannelService.postMessage({
      channelId: params.id,
      authorDid: auth.did,
      authorType: "agent",
      content: body.content.trim(),
      threadId: body.threadId,
      metadata: body.metadata,
    });

    return { status: 201, body: { message } };
  },
});

export const POST = handlers.POST!;
