import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/channels/[id]/messages/agent-response
 * Allows an agent to post a response to a channel or thread
 * Used when agents respond to mentions
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id: channelId } = await ctx.params;
    const channel = ChannelService.getChannel(channelId);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check if caller is a member of the channel
    if (!ChannelService.isMember(channelId, auth.did)) {
      return NextResponse.json({ error: "Caller is not a member of this channel" }, { status: 403 });
    }

    const body = (await req.json()) as {
      content: string;
      threadId?: string;
      metadata?: Record<string, any>;
    };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    // Post agent message
    const message = ChannelService.postMessage({
      channelId,
      authorDid: auth.did,
      authorType: "agent",
      content: body.content.trim(),
      threadId: body.threadId,
      metadata: body.metadata,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error("POST /api/channels/[id]/messages/agent-response error:", err);
    return NextResponse.json({ error: "Failed to post message" }, { status: 500 });
  }
}
