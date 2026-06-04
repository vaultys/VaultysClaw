import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { ChannelBridgeService } from "@/lib/channel-bridge-service";
import { ChannelService } from "@/lib/channel-service";
import type {
  ChannelBridge,
  TeamsBridgeConfig,
  WebhookBridgeConfig,
} from "@vaultysclaw/shared";

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
/**
 * @openapi
 * /api/channels/{id}/bridges:
 *   get:
 *     summary: List all bridges for a channel.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the channel.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of bridges.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bridges:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ChannelBridge'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch bridges.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id } = await ctx.params;

    const channel = await ChannelService.getChannel(id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const bridges = (await ChannelBridgeService.listBridges(id)).map(stripConfig);
    return NextResponse.json({ bridges });
  } catch (err) {
    console.error("GET /api/channels/[id]/bridges error:", err);
    return NextResponse.json(
      { error: "Failed to fetch bridges" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/channels/[id]/bridges
 * Create a new bridge for the channel.
 * Body: { externalService, externalChannelId, externalChannelName, externalWorkspaceId, syncDirection?, config }
 */
/**
 * @openapi
 * /api/channels/{id}/bridges:
 *   post:
 *     summary: Create a new bridge for the channel.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the channel.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               externalService:
 *                 type: string
 *                 enum: [teams, webhook]
 *                 description: The external service type.
 *               externalChannelId:
 *                 type: string
 *                 description: The ID of the external channel.
 *               externalChannelName:
 *                 type: string
 *                 description: The name of the external channel.
 *               externalWorkspaceId:
 *                 type: string
 *                 description: The ID of the external workspace.
 *               syncDirection:
 *                 type: string
 *                 enum: [incoming, outgoing, bidirectional]
 *                 description: The sync direction.
 *               config:
 *                 oneOf:
 *                   - $ref: '#/components/schemas/TeamsBridgeConfig'
 *                   - $ref: '#/components/schemas/WebhookBridgeConfig'
 *                 description: The configuration for the bridge.
 *     responses:
 *       201:
 *         description: Bridge created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bridge:
 *                   type: object
 *                   description: The created bridge without configJson.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Conflict in creating the bridge.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id } = await ctx.params;

    const channel = await ChannelService.getChannel(id);
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

    if (
      !body.externalService ||
      !["teams", "webhook"].includes(body.externalService)
    ) {
      return NextResponse.json(
        { error: "externalService must be 'teams' or 'webhook'" },
        { status: 400 }
      );
    }
    if (!body.externalChannelId?.trim()) {
      return NextResponse.json(
        { error: "externalChannelId is required" },
        { status: 400 }
      );
    }
    if (!body.externalChannelName?.trim()) {
      return NextResponse.json(
        { error: "externalChannelName is required" },
        { status: 400 }
      );
    }
    if (!body.externalWorkspaceId?.trim()) {
      return NextResponse.json(
        { error: "externalWorkspaceId is required" },
        { status: 400 }
      );
    }
    if (!body.config) {
      return NextResponse.json(
        { error: "config is required" },
        { status: 400 }
      );
    }

    try {
      const bridge = await ChannelBridgeService.createBridge({
        channelId: id,
        externalService: body.externalService,
        externalChannelId: body.externalChannelId.trim(),
        externalChannelName: body.externalChannelName.trim(),
        externalWorkspaceId: body.externalWorkspaceId.trim(),
        syncDirection: body.syncDirection ?? "bidirectional",
        config: body.config,
      });

      return NextResponse.json(
        { bridge: stripConfig(bridge) },
        { status: 201 }
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create bridge";
      return NextResponse.json({ error: message }, { status: 409 });
    }
  } catch (err) {
    console.error("POST /api/channels/[id]/bridges error:", err);
    return NextResponse.json(
      { error: "Failed to create bridge" },
      { status: 500 }
    );
  }
}
