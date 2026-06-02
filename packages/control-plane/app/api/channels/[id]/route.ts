import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { ChannelService } from "@/lib/channel-service";
import { getRealmById } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/channels/[id]
 * Get channel details including members
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    const channel = ChannelService.getChannel(id);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check access: member can view their channels, admins can view all in their realm
    if (channel.realmId && !auth.canAccessRealm(channel.realmId)) {
      return forbidden();
    }

    const members = ChannelService.getChannelMembers(id);
    const stats = ChannelService.getChannelStats(id);

    return NextResponse.json({
      channel,
      members,
      stats,
    });
  } catch (err) {
    console.error("GET /api/channels/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch channel" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/channels/[id]
 * Update channel metadata
 * Body: { name?, description?, topic?, isPublic? }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    const channel = ChannelService.getChannel(id);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check authorization: channel owner or realm admin
    const role = ChannelService.getMemberRole(id, auth.did);
    const isChannelOwner = role === "owner";
    const isRealmAdmin =
      channel.realmId && auth.canAdminRealm(channel.realmId);
    const isGlobalAdmin = !channel.realmId && auth.isGlobalAdmin;

    if (!isChannelOwner && !isRealmAdmin && !isGlobalAdmin) {
      return forbidden();
    }

    const body = (await req.json()) as {
      name?: string;
      description?: string;
      topic?: string;
      isPublic?: boolean;
    };

    const updated = ChannelService.updateChannel(id, {
      name: body.name?.trim(),
      description: body.description?.trim(),
      topic: body.topic?.trim(),
      isPublic: body.isPublic,
    });

    return NextResponse.json({ channel: updated });
  } catch (err) {
    console.error("PATCH /api/channels/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update channel" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/channels/[id]
 * Archive a channel (soft delete)
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    const channel = ChannelService.getChannel(id);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check authorization: channel owner or realm admin
    const role = ChannelService.getMemberRole(id, auth.did);
    const isChannelOwner = role === "owner";
    const isRealmAdmin =
      channel.realmId && auth.canAdminRealm(channel.realmId);
    const isGlobalAdmin = !channel.realmId && auth.isGlobalAdmin;

    if (!isChannelOwner && !isRealmAdmin && !isGlobalAdmin) {
      return forbidden();
    }

    ChannelService.archiveChannel(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/channels/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to archive channel" },
      { status: 500 }
    );
  }
}
