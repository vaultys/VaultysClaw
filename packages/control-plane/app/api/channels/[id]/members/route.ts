import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { ChannelService } from "@/lib/channel-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/channels/[id]/members
 * Add a member to a channel
 * Body: { memberDid, memberType, role?, invitedBy? }
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

    // Check authorization: moderator+ can add members
    const role = ChannelService.getMemberRole(id, auth.did);
    if (role !== "moderator" && role !== "owner") {
      return forbidden();
    }

    const body = (await req.json()) as {
      memberDid?: string;
      memberType?: "user" | "agent";
      role?: "member" | "moderator" | "owner";
      invitedBy?: string;
    };

    if (!body.memberDid?.trim()) {
      return NextResponse.json(
        { error: "memberDid is required" },
        { status: 400 }
      );
    }

    if (!body.memberType || !["user", "agent"].includes(body.memberType)) {
      return NextResponse.json(
        { error: "memberType must be 'user' or 'agent'" },
        { status: 400 }
      );
    }

    try {
      const member = ChannelService.addChannelMember({
        channelId: id,
        memberDid: body.memberDid.trim(),
        memberType: body.memberType,
        role: body.role ?? "member",
        invitedBy: body.invitedBy || auth.did,
      });

      return NextResponse.json({ member }, { status: 201 });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("POST /api/channels/[id]/members error:", err);
    return NextResponse.json(
      { error: "Failed to add member" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/channels/[id]/members/:memberDid
 * Remove a member from a channel
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    const url = new URL(req.url);
    const memberDid = url.pathname.split("/").pop();

    if (!memberDid) {
      return NextResponse.json(
        { error: "memberDid is required" },
        { status: 400 }
      );
    }

    const channel = ChannelService.getChannel(id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check authorization: moderator+ can remove members
    const role = ChannelService.getMemberRole(id, auth.did);
    if (role !== "moderator" && role !== "owner") {
      return forbidden();
    }

    ChannelService.removeChannelMember(id, memberDid);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/channels/[id]/members error:", err);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
