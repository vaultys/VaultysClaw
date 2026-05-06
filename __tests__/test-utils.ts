/**
 * Shared test utilities for integration testing
 * Provides functions to start/stop servers and connect agents
 * Updated for VaultysId challenge-response authentication
 */

import { WebSocket } from "ws";
import { Challenger, VaultysId, crypto } from "@vaultys/id";

const Buffer = crypto.Buffer;

// Mock logger for tests
const logger = {
  info: (_: string) => { },
  error: (error: Error, _: string) => { },
  debug: (_: string) => { },
  warn: (_: string) => { },
};

/**
 * Wait for a condition to be true or timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  maxWaitTime: number = 5000,
  checkInterval: number = 100
): Promise<void> {
  const startTime = Date.now();
  while (true) {
    const result = await Promise.resolve(condition());
    if (result) {
      return;
    }
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error(
        `Timeout waiting for condition after ${maxWaitTime}ms`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
}

/**
 * Wait for HTTP server to be ready
 */
export async function waitForHttpServer(
  url: string,
  maxWaitTime: number = 5000
): Promise<void> {
  await waitFor(async () => {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }, maxWaitTime);
}

/**
 * WebSocket connection with promise-based message handling.
 * Messages consumed via waitForMessage / waitForAnyOf are dequeued from the
 * internal buffer so subsequent calls never see stale messages.
 */
export class TestWebSocket {
  ws: WebSocket;
  /**
   * Handlers set by waitForAnyOf. Each key maps to the SAME resolve function
   * so that whichever message type arrives first wins and all handlers are
   * cleared atomically.
   */
  private messageHandlers: Map<string, (message: any) => void> = new Map();
  private connected = false;
  /** Buffer of UNCONSUMED messages (consumed messages are spliced out). */
  private messages: any[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        this.messages.push(message);

        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          // Remove from buffer — message is being consumed
          const idx = this.messages.indexOf(message);
          if (idx !== -1) this.messages.splice(idx, 1);
          // handler clears all relevant messageHandlers entries
          handler(message);
          // Belt-and-suspenders delete (handler may have already done it)
          this.messageHandlers.delete(message.type);
        }
      } catch (error) {
        logger.error(error as Error, "Failed to parse WebSocket message");
      }
    };

    this.ws.onerror = (error) => {
      logger.error(error as Error, "WebSocket error");
    };
  }

  async waitForConnection(timeout: number = 3000): Promise<void> {
    await waitFor(() => this.connected, timeout);
  }

  async send(message: any, waitForType?: string): Promise<any> {
    if (!this.connected) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(JSON.stringify(message));
    if (waitForType) {
      return this.waitForMessage(waitForType);
    }
  }

  /**
   * Wait for the first message whose type is one of `types`.
   * The returned message is dequeued (removed from the internal buffer).
   */
  async waitForAnyOf(types: string[], timeout: number = 5000): Promise<any> {
    // Check buffer for the first buffered message that matches any type
    for (const type of types) {
      const idx = this.messages.findIndex((m) => m.type === type);
      if (idx !== -1) {
        return this.messages.splice(idx, 1)[0];
      }
    }

    // Not yet in buffer — register handlers
    return new Promise<any>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        for (const t of types) this.messageHandlers.delete(t);
        reject(new Error(`Timeout waiting for ${types.join(" | ")}`));
      }, timeout);

      const onMessage = (message: any): void => {
        clearTimeout(timeoutId);
        // Clear handlers for ALL watched types (first arrival wins)
        for (const t of types) this.messageHandlers.delete(t);
        resolve(message);
      };

      for (const type of types) {
        this.messageHandlers.set(type, onMessage);
      }
    });
  }

  /** Convenience wrapper — wait for a single message type (dequeued). */
  async waitForMessage(type: string, timeout: number = 5000): Promise<any> {
    return this.waitForAnyOf([type], timeout);
  }

  getMessages(): any[] {
    return [...this.messages];
  }

  getMessagesByType(type: string): any[] {
    return this.messages.filter((m) => m.type === type);
  }

  close(): void {
    this.ws.close();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Mock agent for testing with VaultysId challenge-response auth
 */
export class MockAgent {
  private ws: TestWebSocket;
  id: string; // Will be set to DID after auth
  name: string;
  capabilities: string[];
  private vaultysId: VaultysId;
  private authenticated = false;
  private _sessionId: string = "";

  constructor(
    controlPlaneWsUrl: string,
    name: string = "test-agent",
    existingVaultysId?: VaultysId
  ) {
    this.name = name;
    this.id = "";
    this.capabilities = [];
    this.vaultysId = existingVaultysId ?? (null as any);
    this.ws = new TestWebSocket(controlPlaneWsUrl);
  }

  async connect(): Promise<void> {
    if (!this.vaultysId) {
      this.vaultysId = (await VaultysId.generateMachine()).toVersion(1);
    }
    await this.ws.waitForConnection();
  }

  /** Return the underlying VaultysId so tests can create a reconnecting agent. */
  getVaultysId(): VaultysId {
    return this.vaultysId;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Execute a full VaultysId challenge-response handshake starting from a
   * fresh session (server already sent the empty-data auth_challenge prompt).
   * Returns when auth_complete is received.
   */
  private async doAuthHandshake(sessionId: string, caps: string[]): Promise<{ agentId: string }> {
    const challenger = new Challenger(this.vaultysId.toVersion(1));
    challenger.createChallenge("p2p", "auth");
    let certificate = challenger.getCertificate();

    this.ws.ws.send(JSON.stringify({
      messageId: `auth-${Date.now()}`,
      type: "auth_challenge",
      payload: {
        sessionId,
        data: Buffer.from(certificate).toString("base64"),
        name: this.name,
        capabilities: caps,
      },
      timestamp: new Date().toISOString(),
    }));

    while (true) {
      const msg = await this.ws.waitForAnyOf(
        ["auth_challenge", "auth_complete", "auth_failed", "registration_pending"],
        5000
      );

      if (msg.type === "auth_complete") {
        // Drain the post-completion cert the VaultysId protocol always sends
        await this.ws.waitForAnyOf(["auth_challenge"], 500).catch(() => { });
        return { agentId: msg.payload.agentId };
      }

      if (msg.type === "auth_failed") {
        throw new Error(`Auth failed: ${msg.payload.reason}`);
      }

      if (msg.type === "registration_pending") {
        // Caller must handle this
        throw Object.assign(new Error("registration_pending"), { registrationPending: true, msg });
      }

      if (msg.type === "auth_challenge" && msg.payload.data) {
        const serverCert = Buffer.from(msg.payload.data, "base64");
        await challenger.update(serverCert);
        certificate = challenger.getCertificate();
        this.ws.ws.send(JSON.stringify({
          messageId: `auth-${Date.now()}`,
          type: "auth_challenge",
          payload: {
            sessionId,
            data: Buffer.from(certificate).toString("base64"),
            name: this.name,
            capabilities: caps,
          },
          timestamp: new Date().toISOString(),
        }));
      }
      // auth_challenge with empty data = unexpected prompt; ignore and continue
    }
  }

  /**
   * Handle the cert-reissue exchange that the server triggers after a first
   * registration approval.  Must be called immediately after receiving
   * auth_complete in the approval path.
   *
   * After approveRegistration() the server sends (in order):
   *   update_capabilities (reason="Certificate reissue")
   *   auth_challenge      (data="")
   * then a normal handshake ending in auth_complete.
   */
  private async completeCertReissue(): Promise<void> {
    // Wait briefly for the cert-reissue update_capabilities
    let capMsg: any;
    try {
      capMsg = await this.ws.waitForAnyOf(["update_capabilities"], 2000);
    } catch {
      return; // No cert reissue pending
    }
    if (capMsg?.payload?.reason !== "Certificate reissue") return;

    // Get the empty-data auth_challenge that starts the cert-reissue exchange
    const authMsg = await this.ws.waitForAnyOf(["auth_challenge"], 5000);
    const sessionId = authMsg.payload.sessionId;
    const caps = (capMsg.payload.capabilities ?? this.capabilities) as string[];

    // Do a full handshake for the cert reissue
    await this.doAuthHandshake(sessionId, caps);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Authenticate with the control plane.
   * For new agents (unknown DID), pass wsServer to auto-approve.
   */
  async authenticate(capabilities: string[] = ["test"], wsServer?: any): Promise<void> {
    this.capabilities = capabilities;

    // Wait for the server's initial auth_challenge (session start)
    const initialMsg = await this.ws.waitForMessage("auth_challenge", 5000);
    const sessionId = initialMsg.payload.sessionId;
    this._sessionId = sessionId;

    // Send register
    this.ws.ws.send(JSON.stringify({
      messageId: `register-${Date.now()}`,
      type: "register",
      payload: { name: this.name, version: "0.0.1" },
      timestamp: new Date().toISOString(),
    }));

    // Wait for the post-register auth_challenge (fresh prompt, data="")
    const postRegisterMsg = await this.ws.waitForAnyOf(["auth_challenge"], 5000);
    const authSessionId = postRegisterMsg.payload.sessionId;

    // Start the VaultysId handshake
    const challenger = new Challenger(this.vaultysId.toVersion(1));
    challenger.createChallenge("p2p", "auth");
    let certificate = challenger.getCertificate();

    this.ws.ws.send(JSON.stringify({
      messageId: `auth-${Date.now()}`,
      type: "auth_challenge",
      payload: {
        sessionId: authSessionId,
        data: Buffer.from(certificate).toString("base64"),
        name: this.name,
        capabilities: this.capabilities,
      },
      timestamp: new Date().toISOString(),
    }));

    // Exchange until we get a terminal message
    while (true) {
      const msg = await this.ws.waitForAnyOf(
        ["auth_challenge", "auth_complete", "auth_failed", "registration_pending"],
        5000
      );

      if (msg.type === "auth_complete") {
        this.id = msg.payload.agentId;
        this.authenticated = true;
        // Drain the post-completion cert (VaultysId protocol)
        await this.ws.waitForAnyOf(["auth_challenge"], 500).catch(() => { });
        return;
      }

      if (msg.type === "auth_failed") {
        throw new Error(`Auth failed: ${msg.payload.reason}`);
      }

      if (msg.type === "registration_pending") {
        if (!wsServer) {
          throw new Error("New agent requires wsServer for approval — pass wsServer to authenticate()");
        }
        const registrationId = msg.payload.registrationId;
        wsServer.approveRegistration(registrationId, capabilities);

        await this.ws.waitForMessage("registration_approved", 5000);
        const complete = await this.ws.waitForMessage("auth_complete", 5000);
        this.id = complete.payload.agentId;
        this.authenticated = true;

        // Complete the cert-reissue exchange triggered by approveRegistration()
        await this.completeCertReissue();
        return;
      }

      if (msg.type === "auth_challenge" && msg.payload.data) {
        const serverCert = Buffer.from(msg.payload.data, "base64");
        await challenger.update(serverCert);
        certificate = challenger.getCertificate();
        this.ws.ws.send(JSON.stringify({
          messageId: `auth-${Date.now()}`,
          type: "auth_challenge",
          payload: {
            sessionId: authSessionId,
            data: Buffer.from(certificate).toString("base64"),
            name: this.name,
            capabilities: this.capabilities,
          },
          timestamp: new Date().toISOString(),
        }));
      }
    }
  }

  /**
   * Send register and do auth — for new agents needing admin approval.
   * Returns the registrationId.
   */
  async register(): Promise<string> {
    const initialMsg = await this.ws.waitForMessage("auth_challenge", 5000);
    this._sessionId = initialMsg.payload.sessionId;

    this.ws.ws.send(JSON.stringify({
      messageId: `register-${Date.now()}`,
      type: "register",
      payload: { name: this.name, version: "0.0.1" },
      timestamp: new Date().toISOString(),
    }));

    const postRegMsg = await this.ws.waitForAnyOf(["auth_challenge"], 5000);
    const sessionId = postRegMsg.payload.sessionId;

    const challenger = new Challenger(this.vaultysId.toVersion(1));
    challenger.createChallenge("p2p", "auth");
    let certificate = challenger.getCertificate();

    this.ws.ws.send(JSON.stringify({
      messageId: `auth-${Date.now()}`,
      type: "auth_challenge",
      payload: {
        sessionId,
        data: Buffer.from(certificate).toString("base64"),
        name: this.name,
        capabilities: [],
      },
      timestamp: new Date().toISOString(),
    }));

    while (true) {
      const msg = await this.ws.waitForAnyOf(
        ["auth_challenge", "auth_complete", "auth_failed", "registration_pending"],
        5000
      );

      if (msg.type === "registration_pending") {
        return msg.payload.registrationId;
      }

      if (msg.type === "auth_complete") {
        this.id = msg.payload.agentId;
        this.authenticated = true;
        await this.ws.waitForAnyOf(["auth_challenge"], 500).catch(() => { });
        throw new Error("Agent was auto-approved (known DID) — use authenticate() instead");
      }

      if (msg.type === "auth_failed") {
        throw new Error(`Auth failed: ${msg.payload.reason}`);
      }

      if (msg.type === "auth_challenge" && msg.payload.data) {
        const serverCert = Buffer.from(msg.payload.data, "base64");
        await challenger.update(serverCert);
        certificate = challenger.getCertificate();
        this.ws.ws.send(JSON.stringify({
          messageId: `auth-${Date.now()}`,
          type: "auth_challenge",
          payload: {
            sessionId,
            data: Buffer.from(certificate).toString("base64"),
            name: this.name,
            capabilities: [],
          },
          timestamp: new Date().toISOString(),
        }));
      }
    }
  }

  /**
   * Complete connection after registration is approved externally.
   * Waits for registration_approved + auth_complete, then drains cert-reissue.
   */
  async authenticateAfterApproval(capabilities: string[]): Promise<void> {
    const approved = await this.ws.waitForMessage("registration_approved", 10000);
    this.capabilities = approved.payload.capabilities;

    const complete = await this.ws.waitForMessage("auth_complete", 5000);
    this.id = complete.payload.agentId;
    this.authenticated = true;

    // Complete the cert-reissue exchange triggered by approveRegistration()
    await this.completeCertReissue();
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  async sendResult(intentId: string, status: string = "success"): Promise<void> {
    await this.ws.send({
      messageId: `result-${Date.now()}`,
      type: "result",
      agentId: this.id,
      payload: {
        intentId,
        status,
        output: { test: "result" },
        executedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  async sendHeartbeat(): Promise<any> {
    return this.ws.send(
      {
        messageId: `hb-${Date.now()}`,
        type: "heartbeat",
        agentId: this.id,
        payload: { uptime: 1000 },
        timestamp: new Date().toISOString(),
      },
      "pong"
    );
  }

  async getMessages(): Promise<any[]> {
    return this.ws.getMessages();
  }

  async getIntents(): Promise<any[]> {
    return this.ws.getMessagesByType("intent");
  }

  async getPolicies(): Promise<any[]> {
    return this.ws.getMessagesByType("policy_update");
  }

  async waitForIntent(timeout: number = 3000): Promise<any> {
    return this.ws.waitForMessage("intent", timeout);
  }

  async waitForPolicy(timeout: number = 3000): Promise<any> {
    return this.ws.waitForMessage("policy_update", timeout);
  }

  async waitForLlmConfig(timeout: number = 3000): Promise<any> {
    return this.ws.waitForMessage("llm_config", timeout);
  }

  async waitForChatMessage(timeout: number = 5000): Promise<any> {
    return this.ws.waitForMessage("chat_message", timeout);
  }

  /**
   * Send a chat_response message (agent → control plane).
   * Call multiple times with chunks, then once with { done: true }.
   */
  async sendChatResponse(conversationId: string, opts: { chunk?: string; done?: boolean; error?: string }): Promise<void> {
    this.ws.ws.send(JSON.stringify({
      messageId: `chat-resp-${Date.now()}`,
      type: "chat_response",
      agentId: this.id,
      payload: { conversationId, ...opts },
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Handle re-authentication after a capability update.
   * Waits for update_capabilities + auth_challenge, then completes handshake.
   */
  async reAuthAfterCapabilityUpdate(): Promise<void> {
    const capMsg = await this.ws.waitForMessage("update_capabilities", 5000);
    this.capabilities = capMsg.payload.capabilities;

    // Wait for the empty-data auth_challenge that starts re-auth
    const authMsg = await this.ws.waitForAnyOf(["auth_challenge"], 5000);
    const sessionId = authMsg.payload.sessionId;

    const result = await this.doAuthHandshake(sessionId, this.capabilities);
    this.id = result.agentId;
  }

  close(): void {
    this.ws.close();
  }
}
