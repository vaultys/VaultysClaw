import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/channels/[id]/messages?limit=50&offset=0&threadId=optional
 * List messages in a channel (or in a thread if threadId provided)
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    const channel = ChannelService.getChannel(id);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check membership
    if (!ChannelService.isMember(id, auth.did)) {
      return forbidden();
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const threadId = url.searchParams.get("threadId");

    let messages;
    if (threadId) {
      messages = ChannelService.getThread(threadId);
    } else {
      messages = ChannelService.listMessages(id, limit, offset);
    }

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("GET /api/channels/[id]/messages error:", err);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/channels/[id]/messages
 * Post a message to a channel
 * Body: { content, threadId?, metadata? }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    const channel = ChannelService.getChannel(id);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check membership
    if (!ChannelService.isMember(id, auth.did)) {
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
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    try {
      // postMessage internally calls MessageDispatcher.processMessage for
      // user top-level messages — no need to call it again here.
      const message = ChannelService.postMessage({
        channelId: id,
        authorDid: auth.did,
        authorType: "user",
        content: body.content.trim(),
        threadId: body.threadId,
        metadata: body.metadata,
      });

      return NextResponse.json({ message }, { status: 201 });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("POST /api/channels/[id]/messages error:", err);
    return NextResponse.json(
      { error: "Failed to post message" },
      { status: 500 }
    );
  }
}
