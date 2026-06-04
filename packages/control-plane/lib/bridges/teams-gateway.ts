import type { TeamsBridgeConfig } from "@vaultysclaw/shared";

export const TeamsGateway = {
  /**
   * Send a message to a Teams channel via the Microsoft Graph API.
   * Returns the Teams message ID on success, or null on failure.
   *
   * TODO: implement full token refresh before calling this method.
   */
  async sendMessage(
    config: TeamsBridgeConfig,
    teamsChannelId: string,
    message: {
      content: string;
      authorName: string;
      threadId?: string; // Teams reply-to ID
    }
  ): Promise<string | null> {
    const { workspaceId } = config as TeamsBridgeConfig & {
      workspaceId?: string;
    };
    const teamId = workspaceId ?? "";

    const url = message.threadId
      ? `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${teamsChannelId}/messages/${message.threadId}/replies`
      : `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${teamsChannelId}/messages`;

    const body = JSON.stringify({
      body: {
        content: `**${message.authorName}**: ${message.content}`,
        contentType: "text",
      },
    });

    try {
      // TODO: implement token refresh before making this call
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.accessToken}`,
        },
        body,
      });

      if (!response.ok) {
        console.error(
          `[TeamsGateway] sendMessage failed: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = (await response.json()) as { id?: string };
      return data.id ?? null;
    } catch (err) {
      console.error("[TeamsGateway] sendMessage error:", err);
      return null;
    }
  },

  /**
   * Verify an incoming Teams Bot Framework request.
   * TODO: implement real JWT verification via Bot Framework SDK.
   * Currently returns true as a stub.
   */
  verifyTeamsRequest(body: string, authHeader: string | null): boolean {
    // TODO: implement Bot Framework JWT verification
    // Real implementation needs to validate the Bearer JWT from Azure AD
    void body;
    void authHeader;
    return true;
  },

  /**
   * Refresh the OAuth token if it has expired.
   * Returns the updated config with a fresh access token.
   */
  async refreshTokenIfNeeded(
    config: TeamsBridgeConfig
  ): Promise<TeamsBridgeConfig> {
    if (!config.expiresAt || !config.refreshToken) {
      return config;
    }

    const isExpired = new Date(config.expiresAt) <= new Date();
    if (!isExpired) {
      return config;
    }

    try {
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
        client_id: config.botId,
      });

      const response = await fetch(
        `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        }
      );

      if (!response.ok) {
        console.error("[TeamsGateway] Token refresh failed:", response.status);
        return config;
      }

      const data = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      const expiresAt = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined;

      return {
        ...config,
        accessToken: data.access_token ?? config.accessToken,
        refreshToken: data.refresh_token ?? config.refreshToken,
        expiresAt,
      };
    } catch (err) {
      console.error("[TeamsGateway] refreshTokenIfNeeded error:", err);
      return config;
    }
  },
};
