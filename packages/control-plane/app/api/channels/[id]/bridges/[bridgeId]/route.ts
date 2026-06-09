import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { forbidden, notFound, unauthorized } from "@/lib/api-utils";
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
/**
 * @openapi
 * /api/channels/{id}/bridges/{bridgeId}:
 *   patch:
 *     summary: Update syncDirection and/or isSyncEnabled for a bridge.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: bridgeId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               syncDirection:
 *                 type: string
 *                 enum: [incoming, outgoing, bidirectional]
 *               isSyncEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Bridge updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bridge:
 *                   $ref: '#/components/schemas/ChannelBridge'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to update bridge.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { bridgeId } = await ctx.params;

  const bridge = await ChannelBridgeService.getBridge(bridgeId);
  if (!bridge) {
    return notFound("Bridge not found");
  }

  const body = (await req.json()) as {
    syncDirection?: "incoming" | "outgoing" | "bidirectional";
    isSyncEnabled?: boolean;
  };

  let updated = bridge;

  if (body.syncDirection !== undefined) {
    if (
      !["incoming", "outgoing", "bidirectional"].includes(body.syncDirection)
    ) {
      return forbidden("Invalid syncDirection value");
    }
    updated = await ChannelBridgeService.updateBridgeSyncDirection(
      bridgeId,
      body.syncDirection
    );
  }

  if (body.isSyncEnabled !== undefined) {
    updated = await ChannelBridgeService.toggleBridgeSync(
      bridgeId,
      Boolean(body.isSyncEnabled)
    );
  }

  return NextResponse.json({ bridge: stripConfig(updated) });
}

/**
 * DELETE /api/channels/[id]/bridges/[bridgeId]
 * Delete a bridge.
 */
/**
 * @openapi
 * /api/channels/{id}/bridges/{bridgeId}:
 *   delete:
 *     summary: Delete a bridge.
 *     tags: [Channels]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Channel ID
 *         schema:
 *           type: string
 *       - name: bridgeId
 *         in: path
 *         required: true
 *         description: Bridge ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bridge successfully deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to delete bridge.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { bridgeId } = await ctx.params;

  const bridge = await ChannelBridgeService.getBridge(bridgeId);
  if (!bridge) {
    return notFound("Bridge not found");
  }

  await ChannelBridgeService.deleteBridge(bridgeId);

  return NextResponse.json({ success: true });
}
