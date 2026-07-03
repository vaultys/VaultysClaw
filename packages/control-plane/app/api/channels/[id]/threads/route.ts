import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";
import type { MessageMetadata } from "@vaultysclaw/shared";

const handlers = createNextRoute(adminContract.channels, {
  // ── GET /api/channels/:id/threads?parentMessageId=<id> ────────────────────
  listThread: async ({ params, query, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");
    if (!(await ChannelService.isMember(params.id, auth.did)))
      throw new APIException("FORBIDDEN");

    const messages = await ChannelService.getThread(query.parentMessageId);
    return {
      status: 200,
      body: { messages: await ChannelService.withAuthorNames(messages) },
    };
  },

  // ── POST /api/channels/:id/threads ────────────────────────────────────────
  createThreadReply: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");
    if (!(await ChannelService.isMember(params.id, auth.did)))
      throw new APIException("FORBIDDEN");

    if (!body.parentMessageId?.trim())
      throw new APIException("MALFORMED", "parentMessageId is required");
    if (!body.content?.trim())
      throw new APIException("MALFORMED", "content is required");

    const message = await ChannelService.createThreadReply({
      channelId: params.id,
      parentMessageId: body.parentMessageId.trim(),
      authorDid: auth.did,
      authorType: "user",
      content: body.content.trim(),
      metadata: body.metadata as MessageMetadata | undefined,
    });

    const [enriched] = await ChannelService.withAuthorNames([message]);
    return { status: 201, body: { message: enriched } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
