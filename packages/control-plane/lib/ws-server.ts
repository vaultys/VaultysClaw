/**
 * WebSocket server for agent controller connections
 * Handles VaultysId challenge-response authentication, intent distribution,
 * policy updates, and result collection
 */

import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer, type Data as WebSocketData } from "ws";
import pino from "pino";
import {
  type WSMessage,
  type WSAuthChallengePayload,
  type WSAuthCompletePayload,
  type WSAuthFailedPayload,
  type WSRegistrationPendingPayload,
  type WSRegistrationApprovedPayload,
  type WSRegistrationRejectedPayload,
  type WSUpdateCapabilitiesPayload,
  type WSDelegationUpdatePayload,
  type WSLlmConfigPayload,
  type WSChatMessagePayload,
  type WSChatResponsePayload,
  type WSToolApprovalRequestPayload,
  type WSToolApprovalResponsePayload,
  type WSToolExecutionPayload,
  type ChatMessageEntry,
  type DelegationCertPayload,
  type AgentCapability,
  type LlmConfig,
  type WSAgentPeerCatalogPayload,
  type AgentPeerGrant,
  type WSSkillsConfigPayload,
} from "@vaultysclaw/shared";
import { createAuthSession, processChallenge, type PolicyMeta } from "./auth-handler";
import {
  updateAgentLastSeen,
  deleteExpiredAuthSessions,
  logActivity,
  logIntent,
  updateIntentResult,
  createPendingRegistration,
  updatePendingRegistration,
  deletePendingRegistration,
  getPendingRegistration,
  upsertAgent,
  updateAgentBudget,
  getAgent,
  getAllAgents,
  getAllPendingRegistrations,
  setAgentLlmConfig,
  enrollInDefaultRealm,
  upsertTokenUsage,
  getAgentRealms,
  getRealmTokenUsage,
  upsertRealmTokenUsage,
  addAgentTokenUsageHistory,
  getAgentEffectiveSkills,
  getRealmAgents,
  listPolicies,
} from "./db";
import { DelegationDao } from "./delegation-dao";
import { AgentPeerGrantDao } from "./agent-peer-grant-dao";
import { crypto } from "@vaultys/id";

const logger = pino();

/** Auth timeout: reject connections that don't complete auth within 60s */
const AUTH_TIMEOUT_MS = 60_000;
/** Registration approval timeout: 10 minutes for admin to approve */
const REGISTRATION_TIMEOUT_MS = 10 * 60_000;
/** Interval for pruning expired auth sessions from the database */
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60_000;

/**
 * A WebSocket connection that hasn't completed authentication yet.
 * Two phases:
 * - "awaiting_register": just connected, waiting for register or auth_challenge message
 * - "awaiting_approval": sent register, waiting for admin approval
 * - "authenticating": auth challenge-response in progress
 */
type PendingPhase = "awaiting_register" | "awaiting_approval" | "authenticating";

interface PendingConnection {
  ws: WebSocket;
  sessionId: string;
  phase: PendingPhase;
  registrationId?: string;
  agentName?: string;
  agentDid?: string;
  certificateData?: string;
  capabilities?: string[];
  /** Governance metadata to embed in the certificate alongside capabilities. */
  policyMeta?: PolicyMeta;
  /** True when this re-auth was triggered solely to reissue the cert with correct metadata. */
  isCertReissue?: boolean;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Represents a fully authenticated agent controller
 */
interface ConnectedAgent {
  id: string; // DID
  name: string;
  ws: WebSocket;
  capabilities: string[];
  connectedAt: Date;
  lastHeartbeat: Date;
  /** LLM config reported by the agent via heartbeat (provider/model only). */
  reportedLlm?: { provider: string; model: string };
  /** Cumulative token usage from all heartbeats. */
  tokenUsage?: { promptTokens: number; completionTokens: number };
  /** Daily token usage (reset each day). */
  dailyTokenUsage?: { promptTokens: number; completionTokens: number };
  /** Monthly token usage (reset each month). */
  monthlyTokenUsage?: { promptTokens: number; completionTokens: number };
  /** Estimated price spent today in USD. */
  dailyPriceSpent?: number;
}

/**
 * WebSocket Server Manager with VaultysId authentication
 */
export class AgentWSServer {
  private wss: WebSocketServer;
  private httpServer: HttpServer;
  private agents: Map<string, ConnectedAgent> = new Map();
  private pending: Map<WebSocket, PendingConnection> = new Map();
  private port: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  /** Ping interval — keeps TCP connections alive and detects ghosts */
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  /** Callbacks for pending chat streaming responses keyed by conversationId */
  private chatCallbacks: Map<string, (payload: WSChatResponsePayload) => void> = new Map();
  /** Callbacks for workflow step results keyed by intentId */
  private resultCallbacks: Map<string, (payload: any) => void> = new Map();
  /** Pending tool approval requests from agents. Key = requestId */
  private pendingToolApprovals: Map<string, { agentId: string; payload: WSToolApprovalRequestPayload; createdAt: number }> = new Map();
  /** Callbacks for tool execution events from agents */
  private toolExecutionCallbacks: Map<string, (payload: WSToolExecutionPayload & { agentId: string }) => void> = new Map();
  /** Pending one-shot callbacks for chat session list responses. Key = agentId */
  private chatSessionsCallbacks: Map<string, (payload: import("@vaultysclaw/shared").WSChatSessionsResponsePayload) => void> = new Map();
  /** Pending one-shot callbacks for chat history responses. Key = `agentId:sessionId` */
  private chatHistoryCallbacks: Map<string, (payload: import("@vaultysclaw/shared").WSChatHistoryResponsePayload) => void> = new Map();

  constructor(port: number) {
    this.port = port;

    // Create the HTTP server explicitly so we can set keepAliveTimeout = 0
    // before it starts listening. Node.js defaults this to 5 s, which causes
    // WebSocket connections to drop exactly 5 s after the upgrade handshake.
    this.httpServer = createHttpServer();
    this.httpServer.keepAliveTimeout = 0;
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.httpServer.listen(port, () => {
      logger.info({ port }, "Agent WebSocket server started");
    });

    this.setupServer();

    // Periodically clean up expired auth sessions
    this.cleanupInterval = setInterval(() => {
      const deleted = deleteExpiredAuthSessions(AUTH_TIMEOUT_MS / 1000);
      if (deleted > 0) {
        logger.debug({ deleted }, "Pruned expired auth sessions");
      }
    }, SESSION_CLEANUP_INTERVAL_MS);

    // Ping all connected agents every 20 s to keep the TCP connection alive
    // and to detect stale/ghost connections (no pong → terminate).
    this.pingInterval = setInterval(() => {
      for (const agent of this.agents.values()) {
        if (agent.ws.readyState === WebSocket.OPEN) {
          agent.ws.ping();
        }
      }
      // Also ping pending connections so they don't time out on the network layer
      for (const conn of this.pending.values()) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.ping();
        }
      }
    }, 20_000);
  }

  private setupServer(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      logger.info("New WebSocket connection — awaiting register or auth_challenge");

      try {
        const { sessionId } = createAuthSession();

        // Set initial auth timeout
        const timer = setTimeout(() => {
          logger.warn({ sessionId }, "Auth timeout — closing connection");
          this.sendMessage(ws, {
            messageId: `auth-fail-${Date.now()}`,
            type: "auth_failed",
            payload: { reason: "Authentication timeout" } satisfies WSAuthFailedPayload,
            timestamp: new Date().toISOString(),
          });
          ws.close();
          this.pending.delete(ws);
        }, AUTH_TIMEOUT_MS);

        this.pending.set(ws, { ws, sessionId, phase: "awaiting_register", timer });

        // Send session ID to agent — agent decides to register (new) or auth (returning)
        this.sendMessage(ws, {
          messageId: `auth-${Date.now()}`,
          type: "auth_challenge",
          payload: { sessionId, data: "" } satisfies WSAuthChallengePayload,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(error, "Failed to start auth session");
        ws.close();
        return;
      }

      ws.on("message", (data: WebSocketData) => {
        this.handleMessage(ws, data);
      });

      ws.on("close", () => {
        this.handleDisconnect(ws);
      });

      ws.on("error", (error: Error) => {
        logger.error(error, "WebSocket error");
      });
    });
  }

  private handleMessage(ws: WebSocket, data: WebSocketData): void {
    try {
      const message: WSMessage = JSON.parse(data as string);

      logger.debug(
        { messageId: message.messageId, type: message.type },
        "Received message"
      );

      // If connection is still pending, route based on phase
      const pendingConn = this.pending.get(ws);
      if (pendingConn) {
        if (message.type === "register" && pendingConn.phase === "awaiting_register") {
          this.handleRegisterRequest(pendingConn, message);
        } else if (message.type === "auth_challenge" && pendingConn.phase === "authenticating") {
          this.handleAuthChallenge(pendingConn, message);
        } else {
          logger.warn(
            { type: message.type, phase: pendingConn.phase },
            "Rejecting message — not expected in current phase"
          );
          this.sendMessage(ws, {
            messageId: `err-${Date.now()}`,
            type: "error",
            payload: { error: "Unexpected message in current phase" },
            timestamp: new Date().toISOString(),
          });
        }
        return;
      }

      // Authenticated messages
      switch (message.type) {
        case "result":
          this.handleResult(message);
          break;

        case "heartbeat":
          this.handleHeartbeat(message);
          break;

        case "chat_response":
          this.handleChatResponse(message);
          break;

        case "tool_approval_request":
          this.handleToolApprovalRequest(message);
          break;

        case "tool_execution":
          this.handleToolExecution(message);
          break;

        case "chat_sessions_response":
          this.handleChatSessionsResponse(message);
          break;

        case "chat_history_response":
          this.handleChatHistoryResponse(message);
          break;

        default:
          logger.warn({ type: message.type }, "Unknown message type");
      }
    } catch (error) {
      logger.error(error, "Error handling WebSocket message");
    }
  }

  /**
   * Handle a register message from an agent.
   * Always starts auth first to verify identity (DID).
   * After auth, the DID is checked against known agents:
   * - Known DID → auto-approve with stored capabilities
   * - Unknown DID → create pending registration for admin approval
   */
  private handleRegisterRequest(
    pending: PendingConnection,
    message: WSMessage
  ): void {
    const payload = message.payload as { name?: string; version?: string };
    const agentName = payload.name ?? "unknown";

    pending.agentName = agentName;
    pending.phase = "authenticating";

    logger.info({ agentName }, "Agent registering — starting auth to verify identity");

    // Send auth_challenge to start VaultysId handshake
    // DID-based approval happens after auth completes
    this.sendMessage(pending.ws, {
      messageId: `auth-${Date.now()}`,
      type: "auth_challenge",
      payload: { sessionId: pending.sessionId, data: "" } satisfies WSAuthChallengePayload,
      timestamp: new Date().toISOString(),
    });
  }

  private async handleAuthChallenge(
    pending: PendingConnection,
    message: WSMessage
  ): Promise<void> {
    try {
      const payload = message.payload as WSAuthChallengePayload & {
        name?: string;
        capabilities?: string[];
      };

      // Agent can optionally send name/capabilities with challenge responses
      if (payload.name) pending.agentName = payload.name;
      if (payload.capabilities) pending.capabilities = payload.capabilities;

      const result = await processChallenge(
        pending.sessionId,
        payload.data,
        pending.agentName ?? "unknown",
        pending.capabilities ?? [],
        pending.policyMeta,
      );

      if (result.done && result.success) {
        // Auth succeeded — identity verified via certificate
        const agentDid = result.agentDid!;

        // Check if this DID is already registered in the DB.
        // This is the secure auto-approve: the DID is derived from the
        // agent's public key proven by the certificate handshake,
        // so it cannot be spoofed by reusing another agent's name.
        const knownAgent = getAgent(agentDid);

        if (knownAgent) {
          // Known agent — auto-approve with stored capabilities
          clearTimeout(pending.timer);
          this.pending.delete(pending.ws);

          const storedCapabilities = JSON.parse(knownAgent.capabilities) as AgentCapability[];

          // Close existing connection if agent reconnected from new socket
          const existing = this.agents.get(agentDid);
          if (existing && existing.ws !== pending.ws) {
            logger.info({ agentDid }, "Agent reconnecting with verified certificate — replacing old connection");
            existing.ws.close();
          }

          const agent: ConnectedAgent = {
            id: agentDid,
            name: result.agentName ?? knownAgent.name,
            ws: pending.ws,
            capabilities: storedCapabilities,
            connectedAt: new Date(),
            lastHeartbeat: new Date(),
          };

          this.agents.set(agentDid, agent);

          // Update agent record (certificate, last_seen)
          upsertAgent({
            did: agentDid,
            name: agent.name,
            capabilities: agent.capabilities,
            certificateData: result.certificateData,
          });

          logActivity("agent_reconnected", agentDid, agent.name);
          this.broadcastAdminUpdate("agent_reconnected");

          // Send auth_complete
          this.sendMessage(pending.ws, {
            messageId: `auth-complete-${Date.now()}`,
            type: "auth_complete",
            agentId: agentDid,
            payload: {
              agentId: agentDid,
              did: agentDid,
              capabilities: storedCapabilities as string[],
            } satisfies WSAuthCompletePayload,
            timestamp: new Date().toISOString(),
          });

          logger.info(
            { agentDid, agentName: agent.name },
            "Known agent authenticated — auto-approved by DID"
          );

          // Send final challenge response if any
          if (result.responseData) {
            this.sendMessage(pending.ws, {
              messageId: `auth-data-${Date.now()}`,
              type: "auth_challenge",
              payload: {
                sessionId: pending.sessionId,
                data: result.responseData,
              } satisfies WSAuthChallengePayload,
              timestamp: new Date().toISOString(),
            });
          }

          // If this was a genuine reconnect (not already a cert re-issue pass), check
          // whether the capabilities used in this handshake match the stored ones.
          // If they don't match it means the cert has no/wrong metadata — trigger a
          // silent re-auth so a fresh certificate with correct capability metadata is issued.
          if (!pending.isCertReissue) {
            const reportedCaps = (pending.capabilities ?? []).slice().sort().join(",");
            const correctCaps = storedCapabilities.slice().sort().join(",");
            if (reportedCaps !== correctCaps) {
              logger.info({ agentDid }, "Cert metadata mismatch — triggering silent re-auth to reissue certificate");
              const policyMeta = this.fetchActivePolicyMeta(agentDid);
              this.triggerCertReissue(agent, storedCapabilities, policyMeta);
            } else {
              // Push delegation certs, LLM config, peer catalog, and skills config
              this.pushDelegationUpdate(agentDid);
              this.pushStoredLlmConfig(agentDid);
              this.pushPeerCatalog(agentDid);
              this.pushSkillsConfig(agentDid);
            }
          }
        } else {
          // Unknown DID, no prior approval — require admin approval
          // Keep the connection alive but move to awaiting_approval phase
          const registrationId = crypto.randomBytes(16).toString("hex");
          pending.phase = "awaiting_approval";
          pending.registrationId = registrationId;
          pending.agentDid = agentDid;
          pending.certificateData = result.certificateData;

          // Extend timeout for admin approval
          clearTimeout(pending.timer);
          pending.timer = setTimeout(() => {
            logger.warn({ registrationId }, "Registration approval timeout — closing connection");
            this.sendMessage(pending.ws, {
              messageId: `auth-fail-${Date.now()}`,
              type: "auth_failed",
              payload: { reason: "Registration approval timeout" } satisfies WSAuthFailedPayload,
              timestamp: new Date().toISOString(),
            });
            pending.ws.close();
            this.pending.delete(pending.ws);
            deletePendingRegistration(registrationId);
          }, REGISTRATION_TIMEOUT_MS);

          // Persist pending registration with the capabilities the agent requested
          createPendingRegistration(registrationId, pending.sessionId, pending.agentName ?? "unknown", pending.capabilities ?? []);

          logActivity("registration_requested", agentDid, pending.agentName, JSON.stringify({ registrationId, did: agentDid }));
          this.broadcastAdminUpdate("registration_requested");

          // Notify agent it's pending
          this.sendMessage(pending.ws, {
            messageId: `reg-pending-${Date.now()}`,
            type: "registration_pending",
            payload: {
              registrationId,
              message: "Identity verified. Registration pending admin approval.",
            } satisfies WSRegistrationPendingPayload,
            timestamp: new Date().toISOString(),
          });

          logger.info({ registrationId, agentDid, agentName: pending.agentName }, "Unknown DID — registration pending admin approval");
        }
      } else if (result.done && !result.success) {
        // Auth failed
        clearTimeout(pending.timer);
        this.pending.delete(pending.ws);

        this.sendMessage(pending.ws, {
          messageId: `auth-fail-${Date.now()}`,
          type: "auth_failed",
          payload: { reason: result.error ?? "Authentication failed" } satisfies WSAuthFailedPayload,
          timestamp: new Date().toISOString(),
        });

        logger.warn({ sessionId: pending.sessionId, error: result.error }, "Auth failed");
        pending.ws.close();
      } else {
        // Challenge in progress — send next data
        if (result.responseData) {
          this.sendMessage(pending.ws, {
            messageId: `auth-${Date.now()}`,
            type: "auth_challenge",
            payload: {
              sessionId: pending.sessionId,
              data: result.responseData,
            } satisfies WSAuthChallengePayload,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logger.error(error, "Error processing auth challenge");
      this.sendMessage(pending.ws, {
        messageId: `auth-fail-${Date.now()}`,
        type: "auth_failed",
        payload: { reason: "Internal error" } satisfies WSAuthFailedPayload,
        timestamp: new Date().toISOString(),
      });
      pending.ws.close();
      clearTimeout(pending.timer);
      this.pending.delete(pending.ws);
    }
  }

  private handleResult(message: WSMessage): void {
    try {
      const { agentId, payload } = message;

      logger.info(
        { agentId, intentId: payload.intentId, status: payload.status },
        "Received execution result from agent"
      );

      if (agentId) updateAgentLastSeen(agentId);

      // Call registered callback if one exists (for workflow execution)
      if (payload.intentId && this.resultCallbacks.has(payload.intentId)) {
        const callback = this.resultCallbacks.get(payload.intentId);
        if (callback) {
          callback({ ...payload, agentId });
          this.resultCallbacks.delete(payload.intentId);
        }
      }

      // Persist result so test/observability endpoints can retrieve it
      logActivity(
        "intent_result",
        agentId,
        agentId ? this.agents.get(agentId)?.name : undefined,
        JSON.stringify({ intentId: payload.intentId, status: payload.status, output: payload.output }),
      );
      if (payload.intentId) {
        try {
          updateIntentResult(
            payload.intentId,
            payload.status === "success" ? "success" : "failed",
            payload.output,
            typeof payload.error === "string" ? payload.error : undefined,
          );
        } catch { /* non-fatal — intent may not have been logged (e.g. peer-originated) */ }
      }
    } catch (error) {
      logger.error(error, "Error handling execution result");
    }
  }

  private handleHeartbeat(message: WSMessage): void {
    const { agentId } = message;

    const agent = agentId ? this.agents.get(agentId) : undefined;
    if (agent) {
      agent.lastHeartbeat = new Date();
      if (agentId) updateAgentLastSeen(agentId);

      // Sync agent-reported config from heartbeat payload
      const hbPayload = message.payload as {
        uptime?: number;
        memory?: unknown;
        activeLlm?: { provider: string; model: string };
        name?: string;
        tokenUsage?: {
          total: { promptTokens: number; completionTokens: number };
          sinceLastSync: { promptTokens: number; completionTokens: number };
          daily?: { promptTokens: number; completionTokens: number };
          monthly?: { promptTokens: number; completionTokens: number };
          dailyPriceSpent?: number;
        };
      } | undefined;
      if (hbPayload?.activeLlm) {
        agent.reportedLlm = hbPayload.activeLlm;
      }
      if (hbPayload?.name && hbPayload.name !== agent.name) {
        agent.name = hbPayload.name;
      }

      // Accumulate token usage from heartbeat
      if (hbPayload?.tokenUsage?.total) {
        if (!agent.tokenUsage) {
          agent.tokenUsage = { promptTokens: 0, completionTokens: 0 };
        }
        agent.tokenUsage.promptTokens = hbPayload.tokenUsage.total.promptTokens;
        agent.tokenUsage.completionTokens = hbPayload.tokenUsage.total.completionTokens;

        // Store daily and monthly stats
        if (hbPayload.tokenUsage.daily) {
          agent.dailyTokenUsage = hbPayload.tokenUsage.daily;
        }
        if (hbPayload.tokenUsage.monthly) {
          agent.monthlyTokenUsage = hbPayload.tokenUsage.monthly;
        }
        if (hbPayload.tokenUsage.dailyPriceSpent !== undefined) {
          agent.dailyPriceSpent = hbPayload.tokenUsage.dailyPriceSpent;
        }

        // Persist token usage to DB for the agent
        upsertTokenUsage(agentId, agent.tokenUsage.promptTokens, agent.tokenUsage.completionTokens);

        // Update realm token usage if delta is provided
        if (hbPayload.tokenUsage.sinceLastSync) {
          const agentRealms = getAgentRealms(agentId);
          const deltaPrompt = hbPayload.tokenUsage.sinceLastSync.promptTokens;
          const deltaCompletion = hbPayload.tokenUsage.sinceLastSync.completionTokens;

          // Record in daily/monthly history buckets
          addAgentTokenUsageHistory(agentId, deltaPrompt, deltaCompletion);

          for (const realmMembership of agentRealms) {
            const realmId = realmMembership.realm_id;
            // Get current realm token usage (uses snake_case fields from DB row)
            const currentUsage = getRealmTokenUsage(realmId);
            const currentPrompt = currentUsage?.prompt_tokens ?? 0;
            const currentCompletion = currentUsage?.completion_tokens ?? 0;
            // Add the delta
            upsertRealmTokenUsage(
              realmId,
              currentPrompt + deltaPrompt,
              currentCompletion + deltaCompletion
            );
          }
        }
      }

      logger.debug({ agentId }, "Heartbeat received");

      this.sendMessage(agent.ws, {
        messageId: `pong-${Date.now()}`,
        type: "pong",
        agentId,
        payload: { timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleChatResponse(message: WSMessage): void {
    const payload = message.payload as WSChatResponsePayload;
    const cb = this.chatCallbacks.get(payload.conversationId);
    if (cb) {
      cb(payload);
      if (payload.done || payload.error) {
        this.chatCallbacks.delete(payload.conversationId);
      }
    } else {
      logger.warn({ conversationId: payload.conversationId }, "No callback for chat response");
    }
  }

  private handleChatSessionsResponse(message: WSMessage): void {
    const agentId = message.agentId ?? "";
    const cb = this.chatSessionsCallbacks.get(agentId);
    if (cb) {
      this.chatSessionsCallbacks.delete(agentId);
      cb(message.payload as import("@vaultysclaw/shared").WSChatSessionsResponsePayload);
    }
  }

  private handleChatHistoryResponse(message: WSMessage): void {
    const payload = message.payload as import("@vaultysclaw/shared").WSChatHistoryResponsePayload;
    const key = `${message.agentId ?? ""}:${payload.sessionId}`;
    const cb = this.chatHistoryCallbacks.get(key);
    if (cb) {
      this.chatHistoryCallbacks.delete(key);
      cb(payload);
    }
  }

  /** Request the list of chat sessions from an agent. Resolves when the agent responds (10 s timeout). */
  getChatSessions(agentDid: string, limit = 50): Promise<import("@vaultysclaw/shared").ChatSession[]> {
    return new Promise((resolve, reject) => {
      const agent = this.agents.get(agentDid);
      if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Agent not connected"));
      }
      const timer = setTimeout(() => {
        this.chatSessionsCallbacks.delete(agentDid);
        reject(new Error("Timeout waiting for chat sessions"));
      }, 10_000);
      this.chatSessionsCallbacks.set(agentDid, (payload) => {
        clearTimeout(timer);
        resolve(payload.sessions);
      });
      this.sendMessage(agent.ws, {
        messageId: `get-sessions-${Date.now()}`,
        type: "get_chat_sessions",
        agentId: agentDid,
        payload: { limit } satisfies import("@vaultysclaw/shared").WSGetChatSessionsPayload,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /** Request the full message history of one session from an agent. */
  getChatHistory(agentDid: string, sessionId: string): Promise<import("@vaultysclaw/shared").ChatHistoryMessage[]> {
    return new Promise((resolve, reject) => {
      const agent = this.agents.get(agentDid);
      if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Agent not connected"));
      }
      const key = `${agentDid}:${sessionId}`;
      const timer = setTimeout(() => {
        this.chatHistoryCallbacks.delete(key);
        reject(new Error("Timeout waiting for chat history"));
      }, 10_000);
      this.chatHistoryCallbacks.set(key, (payload) => {
        clearTimeout(timer);
        resolve(payload.messages);
      });
      this.sendMessage(agent.ws, {
        messageId: `get-history-${Date.now()}`,
        type: "get_chat_history",
        agentId: agentDid,
        payload: { sessionId } satisfies import("@vaultysclaw/shared").WSGetChatHistoryPayload,
        timestamp: new Date().toISOString(),
      });
    });
  }

  // ---- Tool approval system ----

  private handleToolApprovalRequest(message: WSMessage): void {
    const payload = message.payload as WSToolApprovalRequestPayload;
    const agentId = message.agentId ?? payload.agentId ?? "";

    logger.info({ agentId, requestId: payload.requestId, tool: payload.toolName }, "Tool approval request received");

    this.pendingToolApprovals.set(payload.requestId, {
      agentId,
      payload,
      createdAt: Date.now(),
    });

    // Auto-cleanup after 3 minutes
    setTimeout(() => this.pendingToolApprovals.delete(payload.requestId), 180_000);
  }

  private handleToolExecution(message: WSMessage): void {
    const payload = message.payload as WSToolExecutionPayload;
    const agentId = message.agentId ?? "";

    // Forward to any registered listener (e.g. SSE stream for the chat UI)
    if (payload.conversationId) {
      const cb = this.toolExecutionCallbacks.get(payload.conversationId);
      if (cb) cb({ ...payload, agentId });
    }

    logger.info({ agentId, tool: payload.toolName }, "Tool execution reported");
  }

  /** Get all pending tool approval requests (for admin UI). */
  getPendingToolApprovals(): Array<WSToolApprovalRequestPayload & { agentId: string; agentName?: string; createdAt: number }> {
    const result: Array<WSToolApprovalRequestPayload & { agentId: string; agentName?: string; createdAt: number }> = [];
    for (const [, entry] of this.pendingToolApprovals) {
      const agent = this.agents.get(entry.agentId);
      result.push({
        ...entry.payload,
        agentId: entry.agentId,
        agentName: agent?.name,
        createdAt: entry.createdAt,
      });
    }
    return result;
  }

  /** Send an approval/rejection response back to the agent. */
  respondToToolApproval(requestId: string, approved: boolean, reason?: string): boolean {
    const entry = this.pendingToolApprovals.get(requestId);
    if (!entry) {
      logger.warn({ requestId }, "No pending approval for this request");
      return false;
    }

    const agent = this.agents.get(entry.agentId);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ requestId, agentId: entry.agentId }, "Agent not connected");
      this.pendingToolApprovals.delete(requestId);
      return false;
    }

    this.sendMessage(agent.ws, {
      messageId: `approval-resp-${Date.now()}`,
      type: "tool_approval_response",
      agentId: entry.agentId,
      payload: {
        requestId,
        approved,
        reason,
      } satisfies WSToolApprovalResponsePayload,
      timestamp: new Date().toISOString(),
    });

    this.pendingToolApprovals.delete(requestId);

    logger.info({ requestId, approved, agentId: entry.agentId }, "Tool approval response sent");
    logActivity(
      approved ? "tool_approved" : "tool_rejected",
      entry.agentId,
      undefined,
      JSON.stringify({ tool: entry.payload.toolName, args: entry.payload.args, reason }),
    );

    return true;
  }

  /** Register a callback for tool execution events on a conversation. */
  onToolExecution(conversationId: string, callback: (payload: WSToolExecutionPayload & { agentId: string }) => void): void {
    this.toolExecutionCallbacks.set(conversationId, callback);
    setTimeout(() => this.toolExecutionCallbacks.delete(conversationId), 5 * 60_000);
  }

  /** Enqueue a task on an agent via WS. */
  sendTaskToAgent(agentId: string, action: string, params: Record<string, unknown> = {}): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) return false;
    this.sendMessage(agent.ws, {
      messageId: `task-enq-${Date.now()}`,
      type: "task_enqueue",
      agentId,
      payload: { action, params } as any,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  /** Send a schedule upsert to an agent via WS. */
  sendScheduleToAgent(agentId: string, schedule: { id: string; name: string; cron: string; action: string; params?: Record<string, unknown>; enabled?: boolean }): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) return false;
    this.sendMessage(agent.ws, {
      messageId: `sched-up-${Date.now()}`,
      type: "schedule_update",
      agentId,
      payload: schedule as any,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  /** Delete a schedule on an agent via WS. */
  deleteScheduleOnAgent(agentId: string, scheduleId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) return false;
    this.sendMessage(agent.ws, {
      messageId: `sched-del-${Date.now()}`,
      type: "schedule_delete",
      agentId,
      payload: { id: scheduleId } as any,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  private handleDisconnect(ws: WebSocket): void {
    // Check pending connections
    const pending = this.pending.get(ws);
    if (pending) {
      clearTimeout(pending.timer);
      // If the agent was awaiting approval, clean up the DB row
      if (pending.registrationId) {
        deletePendingRegistration(pending.registrationId);
        logger.info({ registrationId: pending.registrationId, agentName: pending.agentName }, "Pending registration removed — agent disconnected");
        this.broadcastAdminUpdate("registration_disconnected");
      }
      this.pending.delete(ws);
      logger.debug({ sessionId: pending.sessionId }, "Pending connection closed");
      return;
    }

    // Check authenticated agents
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.ws === ws) {
        this.agents.delete(agentId);
        logActivity("agent_disconnected", agentId, agent.name);
        this.broadcastAdminUpdate("agent_disconnected");
        logger.info({ agentId, agentName: agent.name }, "Agent disconnected");
        break;
      }
    }
  }

  private sendMessage(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // --- Public API ---

  /**
   * Approve a pending registration.
   * Since auth already completed before pending, the agent's DID is verified.
   * Directly promotes the connection to authenticated with admin-assigned capabilities.
   */
  approveRegistration(registrationId: string, capabilities: AgentCapability[]): boolean {
    // Find the pending connection with this registration ID
    let target: PendingConnection | undefined;
    for (const pending of this.pending.values()) {
      if (pending.registrationId === registrationId && pending.phase === "awaiting_approval") {
        target = pending;
        break;
      }
    }

    if (!target) {
      logger.warn({ registrationId }, "No pending connection found for registration");
      return false;
    }

    if (!target.agentDid) {
      logger.warn({ registrationId }, "Pending connection has no verified DID — cannot approve");
      return false;
    }

    const agentDid = target.agentDid;

    // Remove from pending_registrations — activity_log keeps the approval record
    deletePendingRegistration(registrationId);

    // Upsert agent in DB with admin-assigned capabilities
    upsertAgent({
      did: agentDid,
      name: target.agentName ?? "unknown",
      capabilities,
      certificateData: target.certificateData,
    });

    // Promote to authenticated agent
    clearTimeout(target.timer);
    this.pending.delete(target.ws);

    const agent: ConnectedAgent = {
      id: agentDid,
      name: target.agentName ?? "unknown",
      ws: target.ws,
      capabilities,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    this.agents.set(agentDid, agent);

    logActivity("registration_approved", agentDid, agent.name, JSON.stringify({ registrationId, capabilities }));
    this.broadcastAdminUpdate("registration_approved");

    // Enroll agent in default realm on first approval
    enrollInDefaultRealm("agent", agentDid);

    // Notify agent — approved and connected
    this.sendMessage(target.ws, {
      messageId: `reg-approved-${Date.now()}`,
      type: "registration_approved",
      payload: {
        registrationId,
        capabilities,
      } satisfies WSRegistrationApprovedPayload,
      timestamp: new Date().toISOString(),
    });

    this.sendMessage(target.ws, {
      messageId: `auth-complete-${Date.now()}`,
      type: "auth_complete",
      agentId: agentDid,
      payload: {
        agentId: agentDid,
        did: agentDid,
        capabilities: capabilities as string[],
      } satisfies WSAuthCompletePayload,
      timestamp: new Date().toISOString(),
    });

    logger.info({ registrationId, agentDid, capabilities }, "Registration approved — agent connected");

    // Trigger a certificate reissue so the cert metadata reflects the admin-assigned
    // capabilities (and any active governance policy limits).
    const policyMeta = this.fetchActivePolicyMeta(agentDid);
    this.triggerCertReissue(agent, capabilities as AgentCapability[], policyMeta);

    // Push any stored LLM config now that the agent is registered and connected.
    this.pushStoredLlmConfig(agentDid);
    this.pushPeerCatalog(agentDid);
    this.pushSkillsConfig(agentDid);

    return true;
  }

  /**
   * Reject a pending registration. Closes the agent's connection.
   */
  rejectRegistration(registrationId: string, reason: string = "Registration rejected"): boolean {
    let target: PendingConnection | undefined;
    for (const pending of this.pending.values()) {
      if (pending.registrationId === registrationId && pending.phase === "awaiting_approval") {
        target = pending;
        break;
      }
    }

    // Get registration data from DB to get agent name (needed even if agent disconnected)
    const reg = getPendingRegistration(registrationId);
    if (!reg) {
      logger.warn({ registrationId }, "Registration not found");
      return false;
    }

    // Remove from pending_registrations — activity_log keeps the rejection record
    deletePendingRegistration(registrationId);

    logActivity("registration_rejected", undefined, reg.agent_name, JSON.stringify({ registrationId, reason }));
    this.broadcastAdminUpdate("registration_rejected");

    // If agent is still connected, send rejection message and clean up connection
    if (target) {
      this.sendMessage(target.ws, {
        messageId: `reg-rejected-${Date.now()}`,
        type: "registration_rejected",
        payload: {
          registrationId,
          reason,
        } satisfies WSRegistrationRejectedPayload,
        timestamp: new Date().toISOString(),
      });

      clearTimeout(target.timer);
      target.ws.close();
      this.pending.delete(target.ws);
    }

    logger.info({ registrationId, reason }, "Registration rejected");
    return true;
  }

  /**
   * Update an agent's capabilities. If the agent is connected, send an
   * update_capabilities message so the agent re-authenticates and gets
   * a fresh certificate with the new capabilities.
   */
  updateAgentCapabilities(agentDid: string, capabilities: AgentCapability[]): boolean {
    // Update in DB
    const existing = getAgent(agentDid);
    if (!existing) {
      logger.warn({ agentDid }, "Agent not found in DB for capability update");
      return false;
    }

    upsertAgent({
      did: agentDid,
      name: existing.name,
      capabilities,
      certificateData: existing.certificate_data ?? undefined,
    });

    logActivity("capabilities_updated", agentDid, existing.name, JSON.stringify({ capabilities }));
    this.broadcastAdminUpdate("capabilities_updated");

    // If agent is connected, notify it to re-authenticate
    const connected = this.agents.get(agentDid);
    if (connected) {
      // Update in-memory capabilities
      connected.capabilities = capabilities;

      // Create a new auth session for re-auth
      const { sessionId } = createAuthSession();

      // Move agent back to pending for re-auth
      const timer = setTimeout(() => {
        logger.warn({ agentDid }, "Re-auth timeout after capability update — keeping old connection");
        this.pending.delete(connected.ws);
      }, AUTH_TIMEOUT_MS);

      this.pending.set(connected.ws, {
        ws: connected.ws,
        sessionId,
        phase: "authenticating",
        agentName: connected.name,
        capabilities,
        timer,
      });

      // Send update_capabilities so agent knows to re-auth
      this.sendMessage(connected.ws, {
        messageId: `cap-update-${Date.now()}`,
        type: "update_capabilities",
        agentId: agentDid,
        payload: {
          capabilities,
          reason: "Capabilities updated by admin",
        } satisfies WSUpdateCapabilitiesPayload,
        timestamp: new Date().toISOString(),
      });

      // Send auth_challenge with empty data to start re-auth
      this.sendMessage(connected.ws, {
        messageId: `auth-${Date.now()}`,
        type: "auth_challenge",
        payload: { sessionId, data: "" } satisfies WSAuthChallengePayload,
        timestamp: new Date().toISOString(),
      });

      logger.info({ agentDid, capabilities }, "Sent capability update + re-auth to agent");
    } else {
      logger.info({ agentDid, capabilities }, "Capabilities updated in DB (agent offline)");
    }

    return true;
  }

  /**
   * Silently trigger a re-authentication on a connected agent so a new
   * certificate with correct capability metadata is issued.
   * Does NOT update the DB or emit admin broadcasts — purely an internal cert refresh.
   */
  private triggerCertReissue(agent: ConnectedAgent, capabilities: AgentCapability[], policyMeta?: PolicyMeta): void {
    const { sessionId } = createAuthSession();

    const timer = setTimeout(() => {
      logger.warn({ agentId: agent.id }, "Cert re-issue re-auth timeout — keeping existing connection");
      this.pending.delete(agent.ws);
    }, AUTH_TIMEOUT_MS);

    this.pending.set(agent.ws, {
      ws: agent.ws,
      sessionId,
      phase: "authenticating",
      agentName: agent.name,
      capabilities: capabilities as string[],
      policyMeta,
      isCertReissue: true,
      timer,
    });

    // Tell the agent its new capabilities + governance limits (embedded natively in the payload).
    this.sendMessage(agent.ws, {
      messageId: `cert-reissue-caps-${Date.now()}`,
      type: "update_capabilities",
      agentId: agent.id,
      payload: {
        capabilities,
        resourceLimits: policyMeta?.resourceLimits ?? null,
        policyId: policyMeta?.policyId ?? null,
        policyExpiresAt: policyMeta?.policyExpiresAt ?? null,
        reason: "Certificate reissue",
      } satisfies WSUpdateCapabilitiesPayload,
      timestamp: new Date().toISOString(),
    });

    // Start a fresh auth challenge so the cert gets the new metadata.
    this.sendMessage(agent.ws, {
      messageId: `cert-reissue-auth-${Date.now()}`,
      type: "auth_challenge",
      payload: { sessionId, data: "" } satisfies WSAuthChallengePayload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Look up the most recently created (non-expired) governance policy for an agent
   * and return its metadata for cert embedding.
   */
  private fetchActivePolicyMeta(agentDid: string): PolicyMeta | undefined {
    try {
      const policies = listPolicies({ agentDid, includeExpired: false });
      if (policies.length === 0) return undefined;
      const p = policies[0];
      return {
        resourceLimits: p.resource_limits ? JSON.parse(p.resource_limits) : null,
        policyId: p.id,
        policyExpiresAt: p.expires_at ?? null,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Apply a governance policy to an agent: sync capabilities to DB, update token
   * budget columns, then trigger a cert reissue so the new limits are signed into
   * the certificate immediately.
   *
   * Pass resourceLimits = null / policyId = null to clear a revoked policy.
   */
  applyPolicy(
    agentDid: string,
    capabilities: AgentCapability[],
    policyMeta?: PolicyMeta,
  ): boolean {
    // Always update the DB so the next reconnect picks up the correct capabilities.
    const knownAgent = getAgent(agentDid);
    if (!knownAgent) return false;

    upsertAgent({ did: agentDid, name: knownAgent.name, capabilities });

    // Sync token budget columns if resource limits changed.
    if (policyMeta?.resourceLimits !== undefined) {
      updateAgentBudget(agentDid, {
        tokenBudgetDaily: policyMeta.resourceLimits?.maxTokensPerDay ?? null,
        tokenBudgetMonthly: null,
      });
    }

    // If the agent is connected, trigger an immediate cert reissue.
    const agent = this.agents.get(agentDid);
    if (agent) {
      this.triggerCertReissue(agent, capabilities, policyMeta);
      return true;
    }

    return false; // DB updated; cert will be reissued on next connect.
  }

  getConnectedAgents(): ConnectedAgent[] {
    return Array.from(this.agents.values());
  }

  getAgent(agentId: string): ConnectedAgent | undefined {
    return this.agents.get(agentId);
  }

  disconnectAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.ws.readyState === WebSocket.OPEN) {
      agent.ws.close(1000, "Agent deleted");
    }
  }

  sendIntentToAgent(
    agentId: string,
    intentId: string,
    action: string,
    params: Record<string, any>,
    userDid?: string,
  ): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ agentId }, "Agent not connected");
      return false;
    }

    const message: WSMessage = {
      messageId: intentId,
      type: "intent",
      agentId,
      payload: {
        id: intentId,
        action,
        params,
        timestamp: new Date().toISOString(),
        ...(userDid ? { userDid } : {}),
      },
      timestamp: new Date().toISOString(),
    };

    try {
      agent.ws.send(JSON.stringify(message));
      logger.info({ agentId, intentId, action }, "Intent sent to agent");
      try { logIntent(intentId, agentId, action, params); } catch { /* non-fatal */ }
      return true;
    } catch (error) {
      logger.error(error, "Failed to send intent to agent");
      return false;
    }
  }

  /**
   * Send a chat message to a connected agent and register a callback that
   * receives streaming response chunks.  The callback is invoked once per
   * `chat_response` WS message from the agent (chunk, done, or error).
   *
   * Returns false if the agent is not connected.
   */
  sendChatToAgent(
    agentDid: string,
    conversationId: string,
    messages: ChatMessageEntry[],
    onChunk: (payload: WSChatResponsePayload) => void,
  ): boolean {
    const agent = this.agents.get(agentDid);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.chatCallbacks.set(conversationId, onChunk);

    // Auto-cleanup after 5 minutes to prevent memory leaks
    setTimeout(() => this.chatCallbacks.delete(conversationId), 5 * 60_000);

    this.sendMessage(agent.ws, {
      messageId: `chat-${Date.now()}`,
      type: "chat_message",
      agentId: agentDid,
      payload: { conversationId, messages } satisfies WSChatMessagePayload,
      timestamp: new Date().toISOString(),
    });

    logger.info({ agentDid, conversationId, messageCount: messages.length }, "Chat message sent to agent");
    return true;
  }

  broadcastIntentToCapability(
    capability: string,
    intentId: string,
    action: string,
    params: Record<string, any>,
    userDid?: string,
  ): string[] {
    const recipientIds: string[] = [];

    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.capabilities.includes(capability)) {
        if (this.sendIntentToAgent(agentId, intentId, action, params, userDid)) {
          recipientIds.push(agentId);
        }
      }
    }

    logger.info(
      { capability, recipients: recipientIds.length },
      "Intent broadcasted to agents with capability"
    );

    return recipientIds;
  }

  /** @deprecated Use applyPolicy() — policies are now enforced via cert reissue, not a separate message. */
  sendPolicyUpdate(_agentId: string, _policy: Record<string, unknown>): boolean {
    logger.warn("sendPolicyUpdate is deprecated — use applyPolicy() instead");
    return false;
  }

  /** @deprecated Use applyPolicy() — policies are now enforced via cert reissue, not a separate message. */
  broadcastPolicyUpdate(_policy: Record<string, unknown>): string[] {
    logger.warn("broadcastPolicyUpdate is deprecated — use applyPolicy() instead");
    return [];
  }

  /**
   * Build and broadcast an admin state snapshot to all admin WS clients.
   */
  broadcastAdminUpdate(event?: string): void {
    const adminWss = getAdminWSS();
    if (!adminWss || adminWss.clients.size === 0) return;

    const connectedDids = new Set(
      Array.from(this.agents.values()).map((a) => a.id)
    );

    const dbAgents = getAllAgents();
    const agents = dbAgents.map((agent) => {
      const connected = this.agents.get(agent.did);
      return {
        id: agent.did,
        name: connected?.name ?? agent.name,
        capabilities: JSON.parse(agent.capabilities),
        registeredAt: agent.registered_at,
        lastSeen: agent.last_seen,
        online: connectedDids.has(agent.did),
        connectedAt: connected?.connectedAt?.toISOString() ?? null,
        lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
        reportedLlm: connected?.reportedLlm ?? null,
        tokenUsage: connected?.tokenUsage ?? null,
        dailyTokenUsage: connected?.dailyTokenUsage ?? null,
        monthlyTokenUsage: connected?.monthlyTokenUsage ?? null,
        dailyPriceSpent: connected?.dailyPriceSpent ?? null,
      };
    });

    const registrations = getAllPendingRegistrations().filter(
      (r: any) => r.status === "pending"
    );

    const payload = JSON.stringify({
      type: "state_update",
      event,
      agents: {
        agents,
        total: agents.length,
        online: agents.filter((a) => a.online).length,
      },
      registrations,
      timestamp: new Date().toISOString(),
    });

    for (const client of adminWss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Push all delegation certs for a specific agent to that agent (if connected).
   */
  pushDelegationUpdate(agentDid: string): void {
    const agent = this.agents.get(agentDid);
    if (!agent) return;

    const certs = DelegationDao.listByAgent(agentDid);
    const delegations: DelegationCertPayload[] = certs.map((c) => ({
      id: c.id,
      grantId: c.grant_id,
      userDid: c.user_did,
      agentDid: c.agent_did,
      capabilities: JSON.parse(c.capabilities) as AgentCapability[],
      certificate: c.certificate,
      ...(c.expires_at ? { expiresAt: c.expires_at } : {}),
    }));

    this.sendMessage(agent.ws, {
      messageId: `delegation-${Date.now()}`,
      type: "delegation_update",
      agentId: agentDid,
      payload: { delegations } satisfies WSDelegationUpdatePayload,
      timestamp: new Date().toISOString(),
    });

    logger.info({ agentDid, count: delegations.length }, "Pushed delegation update to agent");
  }

  /**
   * Push delegation updates to all currently connected agents.
   * Used when a wildcard grant (agent_did = null) is created or revoked.
   */
  pushDelegationUpdateAll(): void {
    for (const agentDid of this.agents.keys()) {
      this.pushDelegationUpdate(agentDid);
    }
  }

  /**
   * Push the peer catalog (all outgoing peer grants) to a specific agent.
   * Called after auth_complete and whenever a grant is created or revoked.
   */
  pushPeerCatalog(agentDid: string): void {
    const agent = this.agents.get(agentDid);
    if (!agent) return;

    const rows = AgentPeerGrantDao.listBySource(agentDid);
    const peers: AgentPeerGrant[] = rows.map((r) => ({
      id: r.id,
      sourceDid: r.source_did,
      targetDid: r.target_did,
      targetName: r.target_name,
      skillDescription: r.skill_description,
      capabilities: JSON.parse(r.capabilities) as string[],
      certificate: r.certificate,
      ...(r.expires_at ? { expiresAt: r.expires_at } : {}),
    }));

    this.sendMessage(agent.ws, {
      messageId: `peer-catalog-${Date.now()}`,
      type: "agent_peer_catalog",
      agentId: agentDid,
      payload: { peers } satisfies WSAgentPeerCatalogPayload,
      timestamp: new Date().toISOString(),
    });

    logger.info({ agentDid, count: peers.length }, "Pushed peer catalog to agent");
  }

  /**
   * Push (or clear) LLM configuration to a connected agent.
   * Also persists the config in the DB so it is re-sent on next reconnect.
   * Returns true if the message was sent, false if the agent is not connected.
   */
  sendLlmConfig(agentDid: string, config: LlmConfig | null): boolean {
    // Always persist to DB regardless of online status
    setAgentLlmConfig(agentDid, config);

    const agent = this.agents.get(agentDid);
    if (!agent) return false;

    this.sendMessage(agent.ws, {
      messageId: `llm-config-${Date.now()}`,
      type: "llm_config",
      agentId: agentDid,
      payload: { config } satisfies WSLlmConfigPayload,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      { agentDid, provider: config?.provider ?? null, model: config?.model ?? null },
      config ? "LLM config pushed to agent" : "LLM config cleared for agent"
    );
    return true;
  }

  /**
   * Re-push stored LLM config to an agent that just (re-)connected.
   * Called automatically after auth_complete for registered agents.
   */
  private pushStoredLlmConfig(agentDid: string): void {
    const row = getAgent(agentDid);
    if (!row?.llm_config) return;
    try {
      const config = JSON.parse(row.llm_config) as LlmConfig;
      this.sendLlmConfig(agentDid, config);
    } catch {
      logger.warn({ agentDid }, "Failed to parse stored LLM config — skipping push");
    }
  }

  /**
   * Push the effective skills configuration to a specific connected agent.
   * Called on reconnect, registration approval, and when realm skills change.
   */
  pushSkillsConfig(agentDid: string): void {
    const agent = this.agents.get(agentDid);
    if (!agent) return;

    const skills = getAgentEffectiveSkills(agentDid);
    // Only push if there are realm-defined skills (empty = no realm config = agent uses all local skills)
    this.sendMessage(agent.ws, {
      messageId: `skills-config-${Date.now()}`,
      type: "skills_config",
      agentId: agentDid,
      payload: { skills } satisfies WSSkillsConfigPayload,
      timestamp: new Date().toISOString(),
    });

    logger.info({ agentDid, count: skills.length }, "Pushed skills config to agent");
  }

  /**
   * Register a callback for a workflow step result identified by intentId.
   * The callback is automatically removed after 30 seconds if not called.
   * Returns an unsubscribe function.
   */
  registerResultCallback(
    intentId: string,
    callback: (result: any) => void,
  ): () => void {
    this.resultCallbacks.set(intentId, callback);

    // Auto-cleanup after 30 seconds (timeout for agent response)
    const timer = setTimeout(() => {
      if (this.resultCallbacks.has(intentId)) {
        logger.warn({ intentId }, "Result callback timeout, cleaning up");
        this.resultCallbacks.delete(intentId);
      }
    }, 30_000);

    // Return unsubscribe function
    return () => {
      clearTimeout(timer);
      this.resultCallbacks.delete(intentId);
    };
  }

  /**
   * Check whether an agent is currently connected.
   */
  isAgentOnline(agentDid: string): boolean {
    const agent = this.agents.get(agentDid);
    return agent !== undefined && agent.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Dispatch a knowledge_sync intent to a specific agent.
   */
  sendKnowledgeSync(agentDid: string, messageId: string, payload: {
    sourceId: string;
    sourceName: string;
    sourceType: string;
    config: Record<string, unknown>;
  }): void {
    const agent = this.agents.get(agentDid);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ agentDid }, "sendKnowledgeSync: agent not connected");
      return;
    }
    this.sendMessage(agent.ws, {
      messageId,
      type: "knowledge_sync",
      agentId: agentDid,
      payload,
      timestamp: new Date().toISOString(),
    } as any);
    logger.info({ agentDid, messageId, sourceId: payload.sourceId }, "Knowledge sync dispatched to agent");
  }

  shutdown(): void {
    logger.info("Shutting down agent WebSocket server");

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.ws.close();
    }
    this.pending.clear();

    for (const agent of this.agents.values()) {
      agent.ws.close();
    }

    this.wss.close(() => {
      logger.info("Agent WebSocket server closed");
    });
    this.httpServer.close();
  }
}

// Use globalThis so the singleton survives Next.js module re-evaluation
// (API routes run in a separate compilation context from server.ts)
const globalForWS = globalThis as unknown as {
  __wsServer?: AgentWSServer;
  __adminWSS?: WebSocketServer;
};

export function initializeWSServer(port: number): AgentWSServer {
  // Shut down any previous instance so the new code + keepAliveTimeout fix applies
  // on every tsx-watch / HMR restart (globalThis survives module re-evaluation).
  if (globalForWS.__wsServer) {
    logger.info("Shutting down previous WS server instance (module re-evaluated)");
    try { globalForWS.__wsServer.shutdown(); } catch { /* best effort */ }
    globalForWS.__wsServer = undefined;
  }
  globalForWS.__wsServer = new AgentWSServer(port);
  return globalForWS.__wsServer;
}

export function getWSServer(): AgentWSServer | null {
  return globalForWS.__wsServer ?? null;
}

/** Alias for getWSServer — used by knowledge sync route. */
export const getWsServer = getWSServer;

function getAdminWSS(): WebSocketServer | null {
  return globalForWS.__adminWSS ?? null;
}

/**
 * Initialize the admin WebSocket server on the HTTP server.
 * Admin clients connect to ws://host:port/ws/admin for live state updates.
 */
export function initializeAdminWS(httpServer: import("node:http").Server): void {
  if (globalForWS.__adminWSS) return;

  const adminWSS = new WebSocketServer({ noServer: true });
  globalForWS.__adminWSS = adminWSS;

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url!, `http://${req.headers.host}`);

    if (pathname === "/ws/admin") {
      adminWSS.handleUpgrade(req, socket, head, (ws) => {
        adminWSS.emit("connection", ws, req);
      });
    }
    // Otherwise, let other handlers (e.g. Next.js HMR) handle the upgrade
  });

  adminWSS.on("connection", (ws) => {
    logger.info("Admin WS client connected");

    // Send initial state snapshot immediately
    const wsServer = getWSServer();
    if (wsServer) {
      wsServer.broadcastAdminUpdate("initial");
    }

    ws.on("close", () => {
      logger.debug("Admin WS client disconnected");
    });
  });
}

/**
 * Push updated skills configuration to a specific agent (by DID).
 * No-op if the agent is not connected.
 * Exported for use by API route handlers.
 */
export function sendSkillsConfig(agentDid: string): void {
  getWSServer()?.pushSkillsConfig(agentDid);
}

/**
 * Push updated skills configuration to all agents in a realm.
 * Called when realm skill definitions are created, updated, or deleted.
 * Exported for use by API route handlers.
 */
export function broadcastSkillsConfig(realmId: string): void {
  const wsServer = getWSServer();
  if (!wsServer) return;

  const agents = getRealmAgents(realmId);
  for (const agent of agents) {
    wsServer.pushSkillsConfig(agent.agent_did);
  }
}
