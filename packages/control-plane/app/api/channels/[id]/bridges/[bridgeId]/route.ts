import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelBridgeService } from "@/lib/channel-bridge-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";
import type { ChannelBridge } from "@vaultysclaw/shared";

/** Strip configJson before sending to client */
function stripConfig(bridge: ChannelBridge): Omit<ChannelBridge, "configJson"> {
  const { configJson: _configJson, ...rest } = bridge;
  return rest;
}

const handlers = createNextRoute(adminContract.channels, {
  // ── PATCH /api/channels/:id/bridges/:bridgeId ─────────────────────────────
  updateBridge: async ({ params, body, request }) => {
    await getAuthContext(request);

    const bridge = await ChannelBridgeService.getBridge(params.bridgeId);
    if (!bridge) throw new APIException("NOT_FOUND", "Bridge not found");

    let updated = bridge;
    if (body.syncDirection !== undefined) {
      updated = await ChannelBridgeService.updateBridgeSyncDirection(
        params.bridgeId,
        body.syncDirection
      );
    }
    if (body.isSyncEnabled !== undefined) {
      updated = await ChannelBridgeService.toggleBridgeSync(
        params.bridgeId,
        Boolean(body.isSyncEnabled)
      );
    }

    return { status: 200, body: { bridge: stripConfig(updated) } };
  },

  // ── DELETE /api/channels/:id/bridges/:bridgeId ────────────────────────────
  deleteBridge: async ({ params, request }) => {
    await getAuthContext(request);

    const bridge = await ChannelBridgeService.getBridge(params.bridgeId);
    if (!bridge) throw new APIException("NOT_FOUND", "Bridge not found");

    await ChannelBridgeService.deleteBridge(params.bridgeId);
    return { status: 200, body: { success: true } };
  },
});

export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
