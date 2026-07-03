import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";
import type { MessageMetadata } from "@vaultysclaw/shared";

const handlers = createNextRoute(adminContract.channels, {
  // ── GET /api/channels/:id/messages ────────────────────────────────────────
  listMessages: async ({ params, query, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");
    if (!(await ChannelService.isMember(params.id, auth.did)))
      throw new APIException("FORBIDDEN");

    const limit = Math.min(query.limit ?? 50, 100);
    const messages = query.threadId
      ? await ChannelService.getThread(query.threadId)
      : await ChannelService.listMessages(params.id, limit, query.before);

    return {
      status: 200,
      body: { messages: await ChannelService.withAuthorNames(messages) },
    };
  },

  // ── POST /api/channels/:id/messages ───────────────────────────────────────
  postMessage: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");
    if (!(await ChannelService.isMember(params.id, auth.did)))
      throw new APIException("FORBIDDEN");

    if (!body.content?.trim())
      throw new APIException("MALFORMED", "content is required");

    // postMessage internally calls MessageDispatcher.processMessage for
    // user top-level messages — no need to call it again here.
    const message = await ChannelService.postMessage({
      channelId: params.id,
      authorDid: auth.did,
      authorType: "user",
      content: body.content.trim(),
      threadId: body.threadId,
      metadata: body.metadata as MessageMetadata | undefined,
    });

    const [enriched] = await ChannelService.withAuthorNames([message]);
    return { status: 201, body: { message: enriched } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
