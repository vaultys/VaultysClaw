import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/channels/[id]/threads
 * Create a threaded reply to a message (used for auto-threaded agent mentions)
 * Body: { parentMessageId, content, metadata? }
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
      return NextResponse.json(
        { error: "parentMessageId is required" },
        { status: 400 }
      );
    }

    if (!body.content?.trim()) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    try {
      const message = ChannelService.createThreadReply({
        channelId: id,
        parentMessageId: body.parentMessageId.trim(),
        authorDid: auth.did,
        authorType: "user",
        content: body.content.trim(),
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
    console.error("POST /api/channels/[id]/threads error:", err);
    return NextResponse.json(
      { error: "Failed to create thread reply" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/channels/[id]/threads?parentMessageId=<id>
 * Get all replies in a thread
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
    const parentMessageId = url.searchParams.get("parentMessageId");

    if (!parentMessageId) {
      return NextResponse.json(
        { error: "parentMessageId query parameter is required" },
        { status: 400 }
      );
    }

    const messages = ChannelService.getThread(parentMessageId);

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("GET /api/channels/[id]/threads error:", err);
    return NextResponse.json(
      { error: "Failed to fetch thread" },
      { status: 500 }
    );
  }
}
