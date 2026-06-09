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
 * POST /api/channels/[id]/threads
 * Create a threaded reply to a message (used for auto-threaded agent mentions)
 * Body: { parentMessageId, content, metadata? }
 */
/**
 * @openapi
 * /api/channels/{id}/threads:
 *   post:
 *     summary: Create a threaded reply to a message.
 *     tags: [Channels]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parentMessageId:
 *                 type: string
 *                 description: ID of the parent message.
 *               content:
 *                 type: string
 *                 description: Content of the reply.
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
 *         description: Thread reply created successfully.
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
  const channel = ChannelService.getChannel(id);

  if (!channel) {
    return notFound("Channel not found");
  }

  // Check membership
  if (!ChannelService.isMember(id, auth.did)) {
    return forbidden();
  }

  const body = (await req.json()) as {
    parentMessageId?: string;
    content?: string;
    metadata?: {
      toolCalls?: Record<string, unknown>;
      attachments?: any[];
      mentions?: string[];
      agentAction?: string;
    };
  };

  if (!body.parentMessageId?.trim()) {
    return malformed("parentMessageId is required");
  }

  if (!body.content?.trim()) {
    return malformed("content is required");
  }

  const message = ChannelService.createThreadReply({
    channelId: id,
    parentMessageId: body.parentMessageId.trim(),
    authorDid: auth.did,
    authorType: "user",
    content: body.content.trim(),
    metadata: body.metadata,
  });

  return NextResponse.json({ message }, { status: 201 });
}

/**
 * GET /api/channels/[id]/threads?parentMessageId=<id>
 * Get all replies in a thread
 */
/**
 * @openapi
 * /api/channels/{id}/threads:
 *   get:
 *     summary: Get all replies in a thread.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the channel.
 *         schema:
 *           type: string
 *       - name: parentMessageId
 *         in: query
 *         required: true
 *         description: The ID of the parent message.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of messages in the thread.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const channel = ChannelService.getChannel(id);

  if (!channel) {
    return notFound("Channel not found");
  }

  // Check membership
  if (!ChannelService.isMember(id, auth.did)) {
    return forbidden();
  }

  const url = new URL(req.url);
  const parentMessageId = url.searchParams.get("parentMessageId");

  if (!parentMessageId) {
    return malformed("parentMessageId query parameter is required");
  }

  const messages = ChannelService.getThread(parentMessageId);

  return NextResponse.json({ messages });
}
