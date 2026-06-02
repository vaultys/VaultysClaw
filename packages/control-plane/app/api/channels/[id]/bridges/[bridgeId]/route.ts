import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { ChannelBridgeService } from "@/lib/channel-bridge-service";
import type { ChannelBridge } from "@vaultysclaw/shared";

type Ctx = { params: Promise<{ id: string; bridgeId: string }> };

/** Strip configJson before sending to client */
function stripConfig(bridge: ChannelBridge): Omit<ChannelBridge, "configJson"> {
  const { configJson: _, ...rest } = bridge;
  return rest;
}

/**
 * PATCH /api/channels/[id]/bridges/[bridgeId]
 * Update syncDirection and/or isSyncEnabled.
 * Body: { syncDirection?, isSyncEnabled? }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { bridgeId } = await ctx.params;

    const bridge = ChannelBridgeService.getBridge(bridgeId);
    if (!bridge) {
      return NextResponse.json({ error: "Bridge not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      syncDirection?: "incoming" | "outgoing" | "bidirectional";
      isSyncEnabled?: boolean;
    };

    let updated = bridge;

    if (body.syncDirection !== undefined) {
      if (!["incoming", "outgoing", "bidirectional"].includes(body.syncDirection)) {
        return NextResponse.json(
          { error: "syncDirection must be 'incoming', 'outgoing', or 'bidirectional'" },
          { status: 400 },
        );
      }
      updated = ChannelBridgeService.updateBridgeSyncDirection(bridgeId, body.syncDirection);
    }

    if (body.isSyncEnabled !== undefined) {
      updated = ChannelBridgeService.toggleBridgeSync(bridgeId, Boolean(body.isSyncEnabled));
    }

    return NextResponse.json({ bridge: stripConfig(updated) });
  } catch (err) {
    console.error("PATCH /api/channels/[id]/bridges/[bridgeId] error:", err);
    return NextResponse.json({ error: "Failed to update bridge" }, { status: 500 });
  }
}

/**
 * DELETE /api/channels/[id]/bridges/[bridgeId]
 * Delete a bridge.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { bridgeId } = await ctx.params;

    const bridge = ChannelBridgeService.getBridge(bridgeId);
    if (!bridge) {
      return NextResponse.json({ error: "Bridge not found" }, { status: 404 });
    }

    ChannelBridgeService.deleteBridge(bridgeId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/channels/[id]/bridges/[bridgeId] error:", err);
    return NextResponse.json({ error: "Failed to delete bridge" }, { status: 500 });
  }
}
