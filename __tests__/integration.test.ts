/**
 * Integration tests for VaultysClaw
 * Tests the control plane and agents communicating via WebSocket
 * with VaultysId challenge-response authentication
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AgentWSServer } from "../packages/control-plane/lib/ws-server";
import { getDb, closeDb, initServerIdentity, setAgentLlmConfig } from "../packages/control-plane/lib/db";
import { MockAgent, waitFor } from "./test-utils";
import type { LlmConfig } from "@vaultysclaw/shared";

let WS_PORT = 8765;
// Find an available port if 8765 is in use
let portInUse = true;
while (portInUse) {
  try {
    require('net').createServer().listen(WS_PORT).close();
    portInUse = false;
  } catch {
    WS_PORT++;
  }
}

describe("VaultysClaw Integration Tests", () => {
  let wsServer: AgentWSServer;

  beforeAll(async () => {
    // Initialize database (creates tables)
    const db = getDb();
    // Clear data from previous test runs
    db.prepare("DELETE FROM agents").run();
    db.prepare("DELETE FROM pending_registrations").run();
    db.prepare("DELETE FROM auth_sessions").run();
    db.prepare("DELETE FROM activity_log").run();
    db.prepare("DELETE FROM agent_token_usage").run();
    // Generate server identity
    await initServerIdentity();
    // Start the WebSocket server
    wsServer = new AgentWSServer(WS_PORT);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterAll(() => {
    wsServer.shutdown();
    closeDb();
  });

  describe("VaultysId Authentication", () => {
    it("should authenticate an agent via challenge-response", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Auth Test Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      expect(agent.isAuthenticated()).toBe(true);
      expect(agent.id).toBeTruthy();
      expect(agent.id).toContain("did:vaultys:");

      agent.close();
    });

    it("should track authenticated agents in server", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Tracking Agent");
      await agent.connect();
      await agent.authenticate(["capability1", "capability2"], wsServer);

      const agents = wsServer.getConnectedAgents();
      const found = agents.find((a) => a.id === agent.id);

      expect(found).toBeDefined();
      expect(found?.name).toBe("Tracking Agent");
      expect(found?.capabilities).toContain("capability1");

      agent.close();
    });

    it("should authenticate multiple agents concurrently", async () => {
      const agents = Array.from({ length: 3 }, (_, i) =>
        new MockAgent(`ws://localhost:${WS_PORT}`, `Concurrent Agent ${i}`)
      );

      // Connect all
      await Promise.all(agents.map((a) => a.connect()));
      // Authenticate all
      await Promise.all(agents.map((a, i) => a.authenticate([`capability-${i}`], wsServer)));

      for (const agent of agents) {
        expect(agent.isAuthenticated()).toBe(true);
        expect(agent.id).toContain("did:vaultys:");
      }

      // All should be in connected agents
      const connected = wsServer.getConnectedAgents();
      for (const agent of agents) {
        expect(connected.find((a) => a.id === agent.id)).toBeDefined();
      }

      agents.forEach((a) => a.close());
    });
  });

  describe("Intent Distribution", () => {
    it("should send intent to specific agent", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Intent Test Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const intentId = `intent-${Date.now()}`;

      // Send intent from control plane side
      const intentPromise = agent.waitForIntent(3000);
      const success = wsServer.sendIntentToAgent(
        agent.id,
        intentId,
        "test_action",
        { testParam: "testValue" }
      );
      expect(success).toBe(true);

      const intentMsg = await intentPromise;
      expect(intentMsg.payload.action).toBe("test_action");
      expect(intentMsg.payload.params.testParam).toBe("testValue");

      agent.close();
    });

    it("should broadcast intent to agents with capability", async () => {
      const agent1 = new MockAgent(`ws://localhost:${WS_PORT}`, "Broadcast Agent 1");
      const agent2 = new MockAgent(`ws://localhost:${WS_PORT}`, "Broadcast Agent 2");
      const agent3 = new MockAgent(`ws://localhost:${WS_PORT}`, "Broadcast Agent 3");

      await Promise.all([agent1.connect(), agent2.connect(), agent3.connect()]);
      await agent1.authenticate(["broadcast_cap"], wsServer);
      await agent2.authenticate(["broadcast_cap"], wsServer);
      await agent3.authenticate(["other_cap"], wsServer);

      const intentId = `broadcast-intent-${Date.now()}`;

      const recipients = wsServer.broadcastIntentToCapability(
        "broadcast_cap",
        intentId,
        "broadcast_action",
        { broadcastData: "test" }
      );

      expect(recipients).toHaveLength(2);
      expect(recipients).toContain(agent1.id);
      expect(recipients).toContain(agent2.id);
      expect(recipients).not.toContain(agent3.id);

      agent1.close();
      agent2.close();
      agent3.close();
    });
  });

  describe("Execution Results", () => {
    it("should receive execution results from agent", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Result Test Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const intentId = `result-intent-${Date.now()}`;

      // Send a result
      await agent.sendResult(intentId, "success");

      // Give server a moment to process
      await new Promise((resolve) => setTimeout(resolve, 200));

      // No assertion on server-side storage yet (just verifying no errors)
      expect(agent.isAuthenticated()).toBe(true);

      agent.close();
    });
  });

  describe("Policy Distribution", () => {
    it("should apply policy to agent via cert reissue", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Policy Test Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const policyMeta = {
        resourceLimits: { maxRequestsPerHour: 20 },
        policyId: `policy-${Date.now()}`,
        policyExpiresAt: null,
      };

      // applyPolicy triggers update_capabilities → re-auth handshake
      const reAuthPromise = agent.reAuthAfterCapabilityUpdate();
      const applied = wsServer.applyPolicy(agent.id, ["test_capability", "api_call"], policyMeta);
      expect(applied).toBe(true);

      await reAuthPromise;

      // Agent should still be connected with updated capabilities embedded in cert
      const updated = wsServer.getAgent(agent.id);
      expect(updated).toBeDefined();
      expect(updated?.capabilities).toContain("test_capability");
      expect(updated?.capabilities).toContain("api_call");

      agent.close();
    });

    it("should return false when applying policy to disconnected agent", () => {
      const result = wsServer.applyPolicy(
        "did:vaultys:nonexistent",
        ["test_capability"],
        { resourceLimits: null, policyId: null, policyExpiresAt: null },
      );
      expect(result).toBe(false);
    });

    it("should apply policy to multiple agents independently", async () => {
      const agent1 = new MockAgent(`ws://localhost:${WS_PORT}`, "Policy Multi 1");
      const agent2 = new MockAgent(`ws://localhost:${WS_PORT}`, "Policy Multi 2");

      await Promise.all([agent1.connect(), agent2.connect()]);
      await agent1.authenticate(["cap_a"], wsServer);
      await agent2.authenticate(["cap_b"], wsServer);

      const policyMeta = {
        resourceLimits: { maxTokensPerDay: 5000 },
        policyId: `mp-${Date.now()}`,
        policyExpiresAt: null,
      };

      // Start listening for re-auth on both agents before triggering
      const reAuth1 = agent1.reAuthAfterCapabilityUpdate();
      const reAuth2 = agent2.reAuthAfterCapabilityUpdate();

      const applied1 = wsServer.applyPolicy(agent1.id, ["cap_a", "api_call"], policyMeta);
      const applied2 = wsServer.applyPolicy(agent2.id, ["cap_b", "api_call"], policyMeta);

      expect(applied1).toBe(true);
      expect(applied2).toBe(true);

      await Promise.all([reAuth1, reAuth2]);

      expect(wsServer.getAgent(agent1.id)?.capabilities).toContain("api_call");
      expect(wsServer.getAgent(agent2.id)?.capabilities).toContain("api_call");

      agent1.close();
      agent2.close();
    });
  });

  describe("Heartbeat", () => {
    it("should handle agent heartbeats", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Heartbeat Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const pong = await agent.sendHeartbeat();
      expect(pong.payload.timestamp).toBeDefined();

      agent.close();
    });

    it("should track agent heartbeat timestamps", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Heartbeat Track Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const serverAgent = wsServer.getAgent(agent.id);
      const initialHeartbeat = serverAgent?.lastHeartbeat;
      expect(initialHeartbeat).toBeDefined();

      await agent.sendHeartbeat();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updatedAgent = wsServer.getAgent(agent.id);
      expect(updatedAgent?.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(
        initialHeartbeat?.getTime() || 0
      );

      agent.close();
    });
  });

  describe("Agent Disconnection", () => {
    it("should remove agent from connected agents on disconnect", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Disconnect Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const agentId = agent.id;
      let agents = wsServer.getConnectedAgents();
      expect(agents.find((a) => a.id === agentId)).toBeDefined();

      agent.close();

      // Wait for the server to process the disconnect event
      await waitFor(() => !wsServer.getConnectedAgents().some((a) => a.id === agentId), 3000);

      agents = wsServer.getConnectedAgents();
      expect(agents.find((a) => a.id === agentId)).toBeUndefined();
    });
  });

  describe("End-to-End Flow", () => {
    it("should complete full auth-intent-result-policy cycle", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "E2E Agent");
      await agent.connect();

      // Step 1: Authenticate
      await agent.authenticate(["e2e_capability"], wsServer);
      expect(agent.isAuthenticated()).toBe(true);

      // Step 2: Receive intent
      const intentId = `e2e-intent-${Date.now()}`;
      const intentPromise = agent.waitForIntent(3000);
      wsServer.sendIntentToAgent(agent.id, intentId, "e2e_action", { data: "test" });
      const intent = await intentPromise;
      expect(intent.payload.action).toBe("e2e_action");

      // Step 3: Send result
      await agent.sendResult(intentId, "success");

      // Step 4: Apply policy via cert reissue
      const policyMeta = {
        resourceLimits: { maxRequestsPerHour: 5 },
        policyId: `e2e-policy-${Date.now()}`,
        policyExpiresAt: null,
      };
      const reAuthPromise = agent.reAuthAfterCapabilityUpdate();
      const applied = wsServer.applyPolicy(agent.id, ["e2e_capability"], policyMeta);
      expect(applied).toBe(true);
      await reAuthPromise;

      // Agent should still be connected with capabilities intact
      const updated = wsServer.getAgent(agent.id);
      expect(updated?.capabilities).toContain("e2e_capability");

      agent.close();
    });
  });

  describe("Registration Approval Flow", () => {
    it("should create a pending registration when agent sends register", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "New Agent");
      await agent.connect();

      const registrationId = await agent.register();
      expect(registrationId).toBeTruthy();
      expect(typeof registrationId).toBe("string");

      agent.close();
    });

    it("should approve registration and complete auth", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Approval Agent");
      await agent.connect();

      const registrationId = await agent.register();

      // Admin approves with capabilities
      const approvePromise = agent.authenticateAfterApproval(["file_access", "api_call"]);
      const approved = wsServer.approveRegistration(registrationId, ["file_access", "api_call"]);
      expect(approved).toBe(true);

      await approvePromise;
      expect(agent.isAuthenticated()).toBe(true);
      expect(agent.id).toContain("did:vaultys:");

      // Verify agent is connected with admin-assigned capabilities from cert metadata
      const connected = wsServer.getConnectedAgents();
      const found = connected.find((a) => a.id === agent.id);
      expect(found).toBeDefined();
      expect(found?.capabilities).toContain("file_access");
      expect(found?.capabilities).toContain("api_call");

      agent.close();
    });

    it("should reject registration and close connection", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Rejected Agent");
      await agent.connect();

      const registrationId = await agent.register();

      const rejected = wsServer.rejectRegistration(registrationId, "Not authorized");
      expect(rejected).toBe(true);

      // Agent should not be authenticated
      expect(agent.isAuthenticated()).toBe(false);

      // Wait for close to process
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it("should return false when approving non-existent registration", () => {
      const result = wsServer.approveRegistration("non-existent-id", ["file_access"]);
      expect(result).toBe(false);
    });
  });

  describe("Capability Update & Re-Auth", () => {
    it("should re-authenticate agent with new capabilities", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "CapUpdate Agent");
      await agent.connect();
      await agent.authenticate(["file_access"], wsServer);

      expect(agent.isAuthenticated()).toBe(true);
      const agentId = agent.id;

      // Admin updates capabilities
      const reAuthPromise = agent.reAuthAfterCapabilityUpdate();
      const updated = wsServer.updateAgentCapabilities(agentId, ["file_access", "api_call", "code_execution"]);
      expect(updated).toBe(true);

      await reAuthPromise;

      // Agent should still be connected with the same DID
      expect(agent.id).toBe(agentId);

      // Server should have updated capabilities
      const connected = wsServer.getAgent(agentId);
      expect(connected).toBeDefined();
      expect(connected?.capabilities).toContain("file_access");
      expect(connected?.capabilities).toContain("api_call");
      expect(connected?.capabilities).toContain("code_execution");

      agent.close();
    });

    it("should return false when updating non-existent agent", () => {
      const result = wsServer.updateAgentCapabilities("did:vaultys:nonexistent", ["file_access"]);
      expect(result).toBe(false);
    });
  });

  describe("LLM Config", () => {
    const TEST_LLM_CONFIG: LlmConfig = {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-test-integration",
    };

    it("should push llm_config message to a connected agent", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "LLM Config Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const configPromise = agent.waitForLlmConfig(3000);
      const pushed = wsServer.sendLlmConfig(agent.id, TEST_LLM_CONFIG);
      expect(pushed).toBe(true);

      const msg = await configPromise;
      expect(msg.type).toBe("llm_config");
      expect(msg.payload.config.provider).toBe("openai");
      expect(msg.payload.config.model).toBe("gpt-4o-mini");

      agent.close();
    });

    it("should push null llm_config to clear remote config", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "LLM Clear Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const configPromise = agent.waitForLlmConfig(3000);
      const pushed = wsServer.sendLlmConfig(agent.id, null);
      expect(pushed).toBe(true);

      const msg = await configPromise;
      expect(msg.payload.config).toBeNull();

      agent.close();
    });

    it("should return false when agent is not connected", async () => {
      // sendLlmConfig should return false for any DID not in the connected-agents map.
      // Use a DID that never connected rather than relying on WS close timing.
      const offlineDid = `did:vaultys:test-offline-${Date.now()}`;
      const pushed = wsServer.sendLlmConfig(offlineDid, TEST_LLM_CONFIG);
      expect(pushed).toBe(false);
    });

    it("should re-push stored llm_config when agent reconnects", async () => {
      // Step 1: authenticate first connection and persist config to DB
      const agent1 = new MockAgent(`ws://localhost:${WS_PORT}`, "LLM Reconnect Agent");
      await agent1.connect();
      await agent1.authenticate(["test_capability"], wsServer);
      const did = agent1.id;
      const vaultysId = agent1.getVaultysId();

      // Persist config via sendLlmConfig (agent1 is online — also delivered there)
      wsServer.sendLlmConfig(did, TEST_LLM_CONFIG);
      agent1.close();

      // Step 2: reconnect with the same VaultysId (known DID → no approval needed)
      const agent2 = new MockAgent(
        `ws://localhost:${WS_PORT}`,
        "LLM Reconnect Agent",
        vaultysId
      );
      await agent2.connect();

      // Start listening for llm_config before authenticating so we don't miss it
      const configPromise = agent2.waitForLlmConfig(5000);

      // authenticate() goes straight to auth_complete (known DID)
      await agent2.authenticate(["test_capability"], wsServer);

      // Server pushes stored config automatically after auth_complete
      const msg = await configPromise;
      expect(msg.payload.config.provider).toBe("openai");
      expect(msg.payload.config.model).toBe("gpt-4o-mini");

      agent2.close();
    });
  });

  // =========================================================================
  // Chat message relay
  // =========================================================================

  describe("Chat Message Relay", () => {
    it("should relay chat_message to a connected agent", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Chat Relay Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const conversationId = `conv-${Date.now()}`;
      const messages = [{ role: "user" as const, content: "Hello from test" }];

      const chatPromise = agent.waitForChatMessage(3000);
      const sent = wsServer.sendChatToAgent(
        agent.id,
        conversationId,
        messages,
        () => { },
      );
      expect(sent).toBe(true);

      const chatMsg = await chatPromise;
      expect(chatMsg.type).toBe("chat_message");
      expect(chatMsg.payload.conversationId).toBe(conversationId);
      expect(chatMsg.payload.messages).toEqual(messages);

      agent.close();
    });

    it("should return false when sending chat to an offline agent", () => {
      const sent = wsServer.sendChatToAgent(
        "did:vaultys:nonexistent",
        "conv-offline",
        [{ role: "user", content: "hi" }],
        () => { },
      );
      expect(sent).toBe(false);
    });

    it("should route chat_response chunks back to the callback", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Chat Response Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const conversationId = `conv-${Date.now()}`;
      const received: any[] = [];

      const done = new Promise<void>((resolve) => {
        wsServer.sendChatToAgent(
          agent.id,
          conversationId,
          [{ role: "user", content: "stream test" }],
          (payload) => {
            received.push(payload);
            if (payload.done) resolve();
          },
        );
      });

      // Wait for the agent to receive the chat_message
      await agent.waitForChatMessage(3000);

      // Simulate agent streaming back chunks
      await agent.sendChatResponse(conversationId, { chunk: "Hello" });
      await agent.sendChatResponse(conversationId, { chunk: " world" });
      await agent.sendChatResponse(conversationId, { done: true });

      await done;

      expect(received).toHaveLength(3);
      expect(received[0].chunk).toBe("Hello");
      expect(received[1].chunk).toBe(" world");
      expect(received[2].done).toBe(true);

      agent.close();
    });

    it("should route chat_response errors back to the callback", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Chat Error Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const conversationId = `conv-err-${Date.now()}`;
      const received: any[] = [];

      const done = new Promise<void>((resolve) => {
        wsServer.sendChatToAgent(
          agent.id,
          conversationId,
          [{ role: "user", content: "fail test" }],
          (payload) => {
            received.push(payload);
            if (payload.done || payload.error) resolve();
          },
        );
      });

      await agent.waitForChatMessage(3000);
      await agent.sendChatResponse(conversationId, { error: "LLM not configured", done: true });

      await done;

      expect(received).toHaveLength(1);
      expect(received[0].error).toBe("LLM not configured");

      agent.close();
    });

    it("should clean up callback after done message", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Chat Cleanup Agent");
      await agent.connect();
      await agent.authenticate(["test_capability"], wsServer);

      const conversationId = `conv-cleanup-${Date.now()}`;
      let callCount = 0;

      const done = new Promise<void>((resolve) => {
        wsServer.sendChatToAgent(
          agent.id,
          conversationId,
          [{ role: "user", content: "cleanup test" }],
          (payload) => {
            callCount++;
            if (payload.done) resolve();
          },
        );
      });

      await agent.waitForChatMessage(3000);
      await agent.sendChatResponse(conversationId, { chunk: "data" });
      await agent.sendChatResponse(conversationId, { done: true });
      await done;

      // Send another response after done — should be ignored (no callback)
      await agent.sendChatResponse(conversationId, { chunk: "stale" });
      // Give a moment for the stale message to be processed (or not)
      await new Promise((r) => setTimeout(r, 100));

      expect(callCount).toBe(2); // chunk + done, NOT the stale one

      agent.close();
    });
  });
});
