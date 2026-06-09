import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound, malformed } from "@/lib/api-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/channels/[id]/messages?limit=50&before=<cursor>&threadId=optional
 * List messages in a channel (or in a thread if threadId provided)
 */
/**
 * @openapi
 * /api/channels/{id}/messages:
 *   get:
 *     summary: List messages in a channel or thread.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Channel ID
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         required: false
 *         description: Maximum number of messages to return
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: before
 *         in: query
 *         required: false
 *         description: ISO date string or cursor ID to paginate before
 *         schema:
 *           type: string
 *       - name: threadId
 *         in: query
 *         required: false
 *         description: ID of the thread to list messages from
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch messages
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const channel = await ChannelService.getChannel(id);

  if (!channel) {
    return notFound("Channel not found");
  }

  // Check membership
  if (!(await ChannelService.isMember(id, auth.did))) {
    return forbidden();
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const before = url.searchParams.get("before") ?? undefined;
  const threadId = url.searchParams.get("threadId");

  let messages;
  if (threadId) {
    messages = await ChannelService.getThread(threadId);
  } else {
    messages = await ChannelService.listMessages(id, limit, before);
  }

  return NextResponse.json({ messages });
}

/**
 * POST /api/channels/[id]/messages
 * Post a message to a channel
 * Body: { content, threadId?, metadata? }
 */
/**
 * @openapi
 * /api/channels/{id}/messages:
 *   post:
 *     summary: Post a message to a channel
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
 *               content:
 *                 type: string
 *                 description: Message content
 *               threadId:
 *                 type: string
 *                 description: Optional thread ID
 *               metadata:
 *                 type: object
 *                 properties:
 *                   toolCalls:
 *                     type: object
 *                     additionalProperties: true
 *                   attachments:
 *                     type: array
 *                     items:
 *                       type: object
 *                   mentions:
 *                     type: array
 *                     items:
 *                       type: string
 *                   agentAction:
 *                     type: string
 *     responses:
 *       201:
 *         description: Message posted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const channel = await ChannelService.getChannel(id);

  if (!channel) {
    return notFound("Channel not found");
  }

  // Check membership
  if (!(await ChannelService.isMember(id, auth.did))) {
    return forbidden();
  }

  const body = (await req.json()) as {
    content?: string;
    threadId?: string;
    metadata?: {
      toolCalls?: Record<string, unknown>;
      attachments?: any[];
      mentions?: string[];
      agentAction?: string;
    };
  };

  if (!body.content?.trim()) {
    return malformed("content is required");
  }

  // postMessage internally calls MessageDispatcher.processMessage for
  // user top-level messages — no need to call it again here.
  const message = await ChannelService.postMessage({
    channelId: id,
    authorDid: auth.did,
    authorType: "user",
    content: body.content.trim(),
    threadId: body.threadId,
    metadata: body.metadata,
  });

  return NextResponse.json({ message }, { status: 201 });
}
