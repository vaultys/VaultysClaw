/**
 * POST /api/bridges/webhook/[bridgeId]/incoming
 * Public endpoint — authenticated via HMAC-SHA256 over the raw request body.
 * Accepts inbound messages from external webhook sources.
 */

import { ChannelBridgeService } from "@/lib/channel-bridge-service";
import { ChannelService } from "@/lib/channel-service";
import { MessageDispatcher } from "@/lib/message-dispatcher";
import { WebhookGateway } from "@/lib/bridges/webhook-gateway";
import type { WebhookBridgeConfig } from "@vaultysclaw/shared";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { bridgesContract } from "@/lib/contracts";

const handlers = createNextRoute(bridgesContract, {
  // The contract body is opaque so createNextRoute leaves the request stream
  // intact — we read the raw text here to verify the HMAC over the exact bytes.
  webhookIncoming: async ({ params, request }) => {
    const body = await request.text();
    const signatureHeader = request.headers.get("x-signature");

    const bridge = await ChannelBridgeService.getBridge(params.bridgeId);
    if (!bridge) throw new APIException("NOT_FOUND", "Bridge not found");

    if (bridge.externalService !== "webhook")
      throw new APIException("FORBIDDEN", "Bridge is not a webhook bridge");
    if (!bridge.isSyncEnabled)
      throw new APIException("FORBIDDEN", "Bridge sync is disabled");
    if (bridge.syncDirection === "outgoing")
      throw new APIException("FORBIDDEN", "Bridge does not accept incoming messages");

    const config = ChannelBridgeService.getDecryptedConfig(
      bridge
    ) as WebhookBridgeConfig;

    if (!WebhookGateway.verifySignature(body, config.secret, signatureHeader))
      throw new APIException("UNAUTHORIZED", "Invalid signature");

    let parsed: {
      message?: string;
      author?: string;
      metadata?: Record<string, unknown>;
    };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      throw new APIException("MALFORMED", "Invalid JSON body");
    }

    const content = parsed.message?.trim();
    if (!content) throw new APIException("MALFORMED", "message is required");

    const authorDid = parsed.author ?? "webhook:external";

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

    return { status: 200, body: { ok: true, messageId: message.id } };
  },
});

export const POST = handlers.POST!;
