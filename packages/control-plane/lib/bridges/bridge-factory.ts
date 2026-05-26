import type { TeamsBridgeConfig, WebhookBridgeConfig } from "@vaultysclaw/shared";
import { ChannelBridgeService } from "../channel-bridge-service";
import { WebhookGateway } from "./webhook-gateway";
import { TeamsGateway } from "./teams-gateway";

interface OutgoingMessage {
  id: string;
  authorDid: string;
  authorType: string;
  content: string;
  threadId: string | null;
  createdAt: string;
}

export const BridgeFactory = {
  /**
   * Fan out a posted channel message to all active bridges on that channel.
   * Only sends to bridges where isSyncEnabled and syncDirection is not "incoming".
   */
  async fanOutMessage(channelId: string, message: OutgoingMessage): Promise<void> {
    const bridges = ChannelBridgeService.listBridges(channelId);

    const activeBridges = bridges.filter(
      (b) => b.isSyncEnabled && b.syncDirection !== "incoming",
    );

    await Promise.allSettled(
      activeBridges.map(async (bridge) => {
        try {
          const config = ChannelBridgeService.getDecryptedConfig(bridge);

          if (bridge.externalService === "webhook") {
            await WebhookGateway.sendOutgoing(config as WebhookBridgeConfig, {
              channelId,
              messageId: message.id,
              authorDid: message.authorDid,
              authorType: message.authorType,
              content: message.content,
              threadId: message.threadId,
              createdAt: message.createdAt,
            });
          } else if (bridge.externalService === "teams") {
            let teamsConfig = config as TeamsBridgeConfig;

            // Refresh token if expired
            teamsConfig = await TeamsGateway.refreshTokenIfNeeded(teamsConfig);

            await TeamsGateway.sendMessage(
              teamsConfig,
              bridge.externalChannelId,
              {
                content: message.content,
                authorName: message.authorDid,
              },
            );
          }
        } catch (err) {
          console.error(
            `[BridgeFactory] fanOutMessage error for bridge ${bridge.id}:`,
            err,
          );
        }
      }),
    );
  },
};
