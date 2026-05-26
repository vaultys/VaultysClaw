import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { ChannelBridgeService } from "@/lib/channel-bridge-service";
import { ChannelService } from "@/lib/channel-service";
import type { ChannelBridge, TeamsBridgeConfig, WebhookBridgeConfig } from "@vaultysclaw/shared";

type Ctx = { params: Promise<{ id: string }> };

/** Strip configJson before sending to client to avoid leaking secrets/tokens */
function stripConfig(bridge: ChannelBridge): Omit<ChannelBridge, "configJson"> {
  const { configJson: _, ...rest } = bridge;
  return rest;
}

/**
 * GET /api/channels/[id]/bridges
 * List all bridges for a channel (configJson stripped).
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await ctx.params;

    const channel = ChannelService.getChannel(id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const bridges = ChannelBridgeService.listBridges(id).map(stripConfig);
    return NextResponse.json({ bridges });
  } catch (err) {
    console.error("GET /api/channels/[id]/bridges error:", err);
    return NextResponse.json({ error: "Failed to fetch bridges" }, { status: 500 });
  }
}

/**
 * POST /api/channels/[id]/bridges
 * Create a new bridge for the channel.
 * Body: { externalService, externalChannelId, externalChannelName, externalWorkspaceId, syncDirection?, config }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await ctx.params;

    const channel = ChannelService.getChannel(id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      externalService?: "teams" | "webhook";
      externalChannelId?: string;
      externalChannelName?: string;
      externalWorkspaceId?: string;
      syncDirection?: "incoming" | "outgoing" | "bidirectional";
      config?: TeamsBridgeConfig | WebhookBridgeConfig;
    };

    if (!body.externalService || !["teams", "webhook"].includes(body.externalService)) {
      return NextResponse.json(
        { error: "externalService must be 'teams' or 'webhook'" },
        { status: 400 },
      );
    }
    if (!body.externalChannelId?.trim()) {
      return NextResponse.json({ error: "externalChannelId is required" }, { status: 400 });
    }
    if (!body.externalChannelName?.trim()) {
      return NextResponse.json({ error: "externalChannelName is required" }, { status: 400 });
    }
    if (!body.externalWorkspaceId?.trim()) {
      return NextResponse.json({ error: "externalWorkspaceId is required" }, { status: 400 });
    }
    if (!body.config) {
      return NextResponse.json({ error: "config is required" }, { status: 400 });
    }

    try {
      const bridge = ChannelBridgeService.createBridge({
        channelId: id,
        externalService: body.externalService,
        externalChannelId: body.externalChannelId.trim(),
        externalChannelName: body.externalChannelName.trim(),
        externalWorkspaceId: body.externalWorkspaceId.trim(),
        syncDirection: body.syncDirection ?? "bidirectional",
        config: body.config,
      });

      return NextResponse.json({ bridge: stripConfig(bridge) }, { status: 201 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create bridge";
      return NextResponse.json({ error: message }, { status: 409 });
    }
  } catch (err) {
    console.error("POST /api/channels/[id]/bridges error:", err);
    return NextResponse.json({ error: "Failed to create bridge" }, { status: 500 });
  }
}
