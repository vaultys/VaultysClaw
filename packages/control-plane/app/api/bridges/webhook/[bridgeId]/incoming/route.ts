import { NextRequest, NextResponse } from "next/server";
import { ChannelBridgeService } from "@/lib/channel-bridge-service";
import { ChannelService } from "@/lib/channel-service";
import { MessageDispatcher } from "@/lib/message-dispatcher";
import { WebhookGateway } from "@/lib/bridges/webhook-gateway";
import type { WebhookBridgeConfig } from "@vaultysclaw/shared";

type Ctx = { params: Promise<{ bridgeId: string }> };

/**
 * POST /api/bridges/webhook/[bridgeId]/incoming
 * Public endpoint — authenticated via HMAC-SHA256 signature.
 * Accepts inbound messages from external webhook sources.
 */
/**
 * @openapi
 * /api/bridges/webhook/{bridgeId}/incoming:
 *   post:
 *     summary: Accepts inbound messages from external webhook sources.
 *     tags: [Bridges]
 *     parameters:
 *       - name: bridgeId
 *         in: path
 *         required: true
 *         description: The ID of the webhook bridge.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message content.
 *               author:
 *                 type: string
 *                 description: The author of the message.
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Additional metadata for the message.
 *     responses:
 *       200:
 *         description: Message processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 messageId:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to process incoming webhook.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { bridgeId } = await ctx.params;

    // Read raw body as text for HMAC verification
    const body = await req.text();
    const signatureHeader = req.headers.get("x-signature");

    // Look up bridge
    const bridge = await ChannelBridgeService.getBridge(bridgeId);
    if (!bridge) {
      return NextResponse.json({ error: "Bridge not found" }, { status: 404 });
    }

    // Validate bridge type and sync settings
    if (bridge.externalService !== "webhook") {
      return NextResponse.json(
        { error: "Bridge is not a webhook bridge" },
        { status: 400 }
      );
    }
    if (!bridge.isSyncEnabled) {
      return NextResponse.json(
        { error: "Bridge sync is disabled" },
        { status: 403 }
      );
    }
    if (bridge.syncDirection === "outgoing") {
      return NextResponse.json(
        { error: "Bridge does not accept incoming messages" },
        { status: 403 }
      );
    }

    // Decrypt config and verify HMAC
    const config = ChannelBridgeService.getDecryptedConfig(
      bridge
    ) as WebhookBridgeConfig;

    if (!WebhookGateway.verifySignature(body, config.secret, signatureHeader)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse body JSON
    let parsed: {
      message?: string;
      author?: string;
      metadata?: Record<string, unknown>;
    };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const content = parsed.message?.trim();
    if (!content) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const authorDid = parsed.author ?? "webhook:external";

    // Create channel message
    const message = await ChannelService.postMessage({
      channelId: bridge.channelId,
      authorDid,
      authorType: "user",
      content,
      metadata: {
        attachments: [],
        agentAction: "webhook_incoming",
        ...(parsed.metadata
          ? { toolCalls: parsed.metadata as Record<string, unknown> }
          : {}),
      },
    });

    // Check for @mentions and trigger agent dispatch
    await MessageDispatcher.processMessage(
      bridge.channelId,
      message.id,
      authorDid,
      content,
      {
        id: message.id,
        authorType: "user",
        threadId: message.threadId,
        createdAt: message.createdAt,
      }
    );

    return NextResponse.json({ ok: true, messageId: message.id });
  } catch (err) {
    console.error("POST /api/bridges/webhook/[bridgeId]/incoming error:", err);
    return NextResponse.json(
      { error: "Failed to process incoming webhook" },
      { status: 500 }
    );
  }
}
