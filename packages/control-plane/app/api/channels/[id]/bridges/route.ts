import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelBridgeService } from "@/lib/channel-bridge-service";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  userContract,
} from "@/lib/contracts";
import type {
  ChannelBridge,
  TeamsBridgeConfig,
  WebhookBridgeConfig,
} from "@vaultysclaw/shared";

/** Strip configJson before sending to client to avoid leaking secrets/tokens */
function stripConfig(bridge: ChannelBridge): Omit<ChannelBridge, "configJson"> {
  const { configJson: _configJson, ...rest } = bridge;
  return rest;
}

const handlers = createNextRoute(userContract.channels, {
  // ── GET /api/channels/:id/bridges ─────────────────────────────────────────
  listBridges: async ({ params, request }) => {
    await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");

    const bridges = (await ChannelBridgeService.listBridges(params.id)).map(
      stripConfig
    );
    return { status: 200, body: { bridges } };
  },

  // ── POST /api/channels/:id/bridges ────────────────────────────────────────
  createBridge: async ({ params, body, request }) => {
    await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");

    if (!body.externalChannelId?.trim())
      throw new APIException("MALFORMED", "externalChannelId is required");
    if (!body.externalChannelName?.trim())
      throw new APIException("MALFORMED", "externalChannelName is required");
    if (!body.externalWorkspaceId?.trim())
      throw new APIException("MALFORMED", "externalWorkspaceId is required");
    if (!body.config) throw new APIException("MALFORMED", "config is required");

    const externalChannelId = body.externalChannelId.trim();
    const existingBridges = await ChannelBridgeService.listBridges(params.id);
    const duplicate = existingBridges.find(
      (b) =>
        b.externalService === body.externalService &&
        b.externalChannelId === externalChannelId
    );
    if (duplicate)
      throw new APIException(
        "CONFLICT",
        `Bridge already exists for ${body.externalService} channel ${externalChannelId}`
      );

    const bridge = await ChannelBridgeService.createBridge({
      channelId: params.id,
      externalService: body.externalService,
      externalChannelId,
      externalChannelName: body.externalChannelName.trim(),
      externalWorkspaceId: body.externalWorkspaceId.trim(),
      syncDirection: body.syncDirection ?? "bidirectional",
      config: body.config as unknown as TeamsBridgeConfig | WebhookBridgeConfig,
    });

    return { status: 201, body: { bridge: stripConfig(bridge) } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
