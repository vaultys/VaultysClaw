import {
  ChannelBridge,
  TeamsBridgeConfig,
  WebhookBridgeConfig,
} from "@vaultysclaw/shared";
import { ChannelBridgeDAO, prisma } from "@/db";

/**
 * ChannelBridgeService manages external service integrations (Teams, webhooks, etc.)
 * - Create/delete bridges
 * - Validate connections
 * - Manage sync settings
 * - Encrypt/decrypt bridge configurations
 */
export class ChannelBridgeService {
  /**
   * Create a new bridge to an external service
   */
  static async createBridge(input: {
    channelId: string;
    externalService: "teams" | "webhook";
    externalChannelId: string;
    externalChannelName: string;
    externalWorkspaceId: string;
    syncDirection?: "incoming" | "outgoing" | "bidirectional";
    config: TeamsBridgeConfig | WebhookBridgeConfig;
  }): Promise<ChannelBridge> {
    // Check for duplicate bridge
    const existing = await prisma.channelBridge.findFirst({
      where: {
        channelId: input.channelId,
        externalService: input.externalService,
        externalChannelId: input.externalChannelId,
      },
    });

    if (existing) {
      throw new Error(
        `Bridge already exists for ${input.externalService} channel ${input.externalChannelId}`
      );
    }

    const encryptedConfig = this.encryptConfig(input.config);

    return (await ChannelBridgeDAO.create({
      channelId: input.channelId,
      externalService: input.externalService,
      externalChannelId: input.externalChannelId,
      externalChannelName: input.externalChannelName,
      externalWorkspaceId: input.externalWorkspaceId,
      syncDirection: input.syncDirection ?? "bidirectional",
      configJson: encryptedConfig,
    })) as unknown as ChannelBridge;
  }

  /**
   * Get a bridge by ID
   */
  static async getBridge(bridgeId: string): Promise<ChannelBridge | null> {
    return (await ChannelBridgeDAO.findById(bridgeId)) as unknown as ChannelBridge | null;
  }

  /**
   * List all bridges for a channel
   */
  static async listBridges(channelId: string): Promise<ChannelBridge[]> {
    return (await ChannelBridgeDAO.listByChannel(channelId)) as unknown as ChannelBridge[];
  }

  /**
   * Get a specific bridge by service
   */
  static async getBridgeByService(
    channelId: string,
    externalService: string,
    externalChannelId: string
  ): Promise<ChannelBridge | null> {
    const bridge = await prisma.channelBridge.findFirst({
      where: { channelId, externalService, externalChannelId },
    });
    return bridge as unknown as ChannelBridge | null;
  }

  /**
   * Update bridge sync settings
   */
  static async updateBridgeSyncDirection(
    bridgeId: string,
    syncDirection: "incoming" | "outgoing" | "bidirectional"
  ): Promise<ChannelBridge> {
    await ChannelBridgeDAO.update(bridgeId, { syncDirection });
    const bridge = await ChannelBridgeDAO.findById(bridgeId);
    if (!bridge) {
      throw new Error("Bridge not found");
    }
    return bridge as unknown as ChannelBridge;
  }

  /**
   * Toggle sync on/off
   */
  static async toggleBridgeSync(
    bridgeId: string,
    enabled: boolean
  ): Promise<ChannelBridge> {
    await ChannelBridgeDAO.update(bridgeId, { isSyncEnabled: enabled });
    const bridge = await ChannelBridgeDAO.findById(bridgeId);
    if (!bridge) {
      throw new Error("Bridge not found");
    }
    return bridge as unknown as ChannelBridge;
  }

  /**
   * Update bridge configuration (e.g., new OAuth token)
   */
  static async updateBridgeConfig(
    bridgeId: string,
    config: TeamsBridgeConfig | WebhookBridgeConfig
  ): Promise<ChannelBridge> {
    const encryptedConfig = this.encryptConfig(config);
    await ChannelBridgeDAO.update(bridgeId, { configJson: encryptedConfig });
    const bridge = await ChannelBridgeDAO.findById(bridgeId);
    if (!bridge) {
      throw new Error("Bridge not found");
    }
    return bridge as unknown as ChannelBridge;
  }

  /**
   * Delete a bridge
   */
  static async deleteBridge(bridgeId: string): Promise<void> {
    await ChannelBridgeDAO.delete(bridgeId);
  }

  /**
   * Delete all bridges of a specific service for a channel
   */
  static async deleteServiceBridges(
    channelId: string,
    externalService: string
  ): Promise<void> {
    await prisma.channelBridge.deleteMany({ where: { channelId, externalService } });
  }

  /**
   * Validate Teams bridge connection
   * In real implementation, would test OAuth token against Teams API
   */
  static async validateTeamsBridge(
    config: TeamsBridgeConfig
  ): Promise<boolean> {
    try {
      // TODO: Implement Teams Graph API health check
      // For now, just validate required fields
      if (!config.accessToken || !config.tenantId || !config.botId) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate webhook bridge connection
   */
  static async validateWebhookBridge(
    config: WebhookBridgeConfig
  ): Promise<boolean> {
    try {
      // TODO: Implement webhook connectivity check
      if (!config.webhookUrl || !config.outgoingUrl || !config.secret) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get decrypted configuration for a bridge
   * In production, this would decrypt using a KMS or vault
   */
  static getDecryptedConfig(
    bridge: ChannelBridge
  ): TeamsBridgeConfig | WebhookBridgeConfig {
    // TODO: Implement actual decryption
    return this.decryptConfig(bridge.configJson as unknown as Record<string, unknown>);
  }

  /**
   * Encrypt configuration before storing (placeholder - implement with actual encryption)
   */
  private static encryptConfig(
    config: TeamsBridgeConfig | WebhookBridgeConfig
  ): Record<string, unknown> {
    // TODO: Implement actual encryption (e.g., using crypto.encrypt with a key)
    // For now, store config as-is
    return config as unknown as Record<string, unknown>;
  }

  /**
   * Decrypt configuration from storage (placeholder - implement with actual decryption)
   */
  private static decryptConfig(
    configJson: Record<string, unknown>
  ): TeamsBridgeConfig | WebhookBridgeConfig {
    // TODO: Implement actual decryption
    // For now, return config as-is
    return configJson as unknown as TeamsBridgeConfig | WebhookBridgeConfig;
  }
}
