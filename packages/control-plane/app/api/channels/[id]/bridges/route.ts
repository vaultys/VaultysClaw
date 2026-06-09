import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { malformed, notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { ChannelBridgeService } from "@/lib/channel-bridge-service";
import { ChannelService } from "@/lib/channel-service";
import { withError } from "@/lib/api/handlers/with-error";
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
export const GET = withError(async (_req: NextRequest, ctx: Ctx) => {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;

  const channel = await ChannelService.getChannel(id);
  if (!channel) {
    return notFound("Channel not found");
  }

  const bridges = (await ChannelBridgeService.listBridges(id)).map(stripConfig);
  return NextResponse.json({ bridges });
});

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
export const POST = withError(async (req: NextRequest, ctx: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;

  const channel = await ChannelService.getChannel(id);
  if (!channel) {
    return notFound("Channel not found");
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
    return malformed("externalService must be 'teams' or 'webhook'");
  }
  if (!body.externalChannelId?.trim()) {
    return malformed("externalChannelId is required");
  }
  if (!body.externalChannelName?.trim()) {
    return malformed("externalChannelName is required");
  }
  if (!body.externalWorkspaceId?.trim()) {
    return malformed("externalWorkspaceId is required");
  }
  if (!body.config) {
    return malformed("config is required");
  }
  const bridge = await ChannelBridgeService.createBridge({
    channelId: id,
    externalService: body.externalService,
    externalChannelId: body.externalChannelId.trim(),
    externalChannelName: body.externalChannelName.trim(),
    externalWorkspaceId: body.externalWorkspaceId.trim(),
    syncDirection: body.syncDirection ?? "bidirectional",
    config: body.config,
  });

  return NextResponse.json({ bridge: stripConfig(bridge) }, { status: 201 });
});
