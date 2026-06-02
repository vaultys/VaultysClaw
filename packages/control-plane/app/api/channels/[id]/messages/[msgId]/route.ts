import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string; msgId: string }> };

/**
 * GET /api/channels/[id]/messages/[msgId]
 * Get a specific message
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id, msgId } = await ctx.params;

    // Verify channel access
    const channel = ChannelService.getChannel(id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (!ChannelService.isMember(id, auth.did)) {
      return forbidden();
    }

    const message = ChannelService.getMessage(msgId);
    if (!message || message.channelId !== id) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ message });
  } catch (err) {
    console.error("GET /api/channels/[id]/messages/[msgId] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch message" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/channels/[id]/messages/[msgId]
 * Edit a message
 * Body: { content }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id, msgId } = await ctx.params;

    const message = ChannelService.getMessage(msgId);
    if (!message || message.channelId !== id) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Only the author can edit their message
    if (message.authorDid !== auth.did) {
      return forbidden();
    }

    const body = (await req.json()) as { content?: string };

    if (!body.content?.trim()) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    const updated = ChannelService.editMessage(msgId, body.content.trim());

    return NextResponse.json({ message: updated });
  } catch (err) {
    console.error("PATCH /api/channels/[id]/messages/[msgId] error:", err);
    return NextResponse.json(
      { error: "Failed to edit message" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/channels/[id]/messages/[msgId]
 * Delete a message (soft delete)
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id, msgId } = await ctx.params;

    const message = ChannelService.getMessage(msgId);
    if (!message || message.channelId !== id) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Author can delete, or moderator+ in the channel
    const role = ChannelService.getMemberRole(id, auth.did);
    const canDelete =
      message.authorDid === auth.did ||
      role === "moderator" ||
      role === "owner";

    if (!canDelete) {
      return forbidden();
    }

    ChannelService.deleteMessage(msgId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/channels/[id]/messages/[msgId] error:", err);
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 }
    );
  }
}
