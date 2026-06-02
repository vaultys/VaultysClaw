import { createHmac, timingSafeEqual } from "crypto";
import type { WebhookBridgeConfig } from "@vaultysclaw/shared";

export const WebhookGateway = {
  /**
   * Verify an incoming HMAC-SHA256 signature header.
   * Expects header format: "sha256=<hex>"
   */
  verifySignature(
    body: string,
    secret: string,
    signatureHeader: string | null
  ): boolean {
    if (!signatureHeader) return false;

    const expected =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    try {
      const expectedBuf = Buffer.from(expected, "utf8");
      const actualBuf = Buffer.from(signatureHeader, "utf8");
      if (expectedBuf.length !== actualBuf.length) return false;
      return timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  },

  /**
   * POST an outgoing message to the external webhook URL.
   * Signs the payload with HMAC-SHA256 and sends as JSON.
   * Returns true on 2xx response.
   */
  async sendOutgoing(
    config: WebhookBridgeConfig,
    payload: {
      channelId: string;
      messageId: string;
      authorDid: string;
      authorType: string;
      content: string;
      threadId: string | null;
      createdAt: string;
    }
  ): Promise<boolean> {
    const body = JSON.stringify(payload);
    const signature =
      "sha256=" +
      createHmac("sha256", config.secret).update(body).digest("hex");

    try {
      const response = await fetch(config.outgoingUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
        },
        body,
      });

      return response.ok;
    } catch (err) {
      console.error("[WebhookGateway] sendOutgoing failed:", err);
      return false;
    }
  },
};
