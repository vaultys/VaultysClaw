/**
 * WebSocket server for agent controller connections
 * Handles VaultysId challenge-response authentication, intent distribution,
 * policy updates, and result collection
 */

import type { Server as HttpServer } from "node:http";
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
} from "@vaultysclaw/shared";
import { createAuthSession, processChallenge } from "./auth-handler";
import {
  updateAgentLastSeen,
  deleteExpiredAuthSessions,
  logActivity,
  createPendingRegistration,
  updatePendingRegistration,
  deletePendingRegistration,
  upsertAgent,
  getAgent,
  getAllAgents,
  getAllPendingRegistrations,
  setAgentLlmConfig,
  enrollInDefaultRealm,
} from "./db";
import { DelegationDao } from "./delegation-dao";
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
}

/**
 * WebSocket Server Manager with VaultysId authentication
 */
export class AgentWSServer {
  private wss: WebSocketServer;
  private agents: Map<string, ConnectedAgent> = new Map();
  private pending: Map<WebSocket, PendingConnection> = new Map();
  private port: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  /** Ping interval — keeps TCP connections alive and detects ghosts */
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  /** Callbacks for pending chat streaming responses keyed by conversationId */
  private chatCallbacks: Map<string, (payload: WSChatResponsePayload) => void> = new Map();
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

    this.wss = new WebSocketServer({ port });

    // Fix: Node.js defaults http.Server.keepAliveTimeout to 5 s.
    // The ws library creates an internal HTTP server when given { port }.
    // That 5 s timer fires after the WebSocket upgrade and closes idle sockets,
    // causing agents to disconnect exactly 5 s after authentication.
    // Access the internal server via the well-known _server property and zero it out.
    const internalServer = (this.wss as unknown as { _server?: HttpServer })._server;
    if (internalServer) {
      internalServer.keepAliveTimeout = 0;
      logger.info({ port }, "Agent WebSocket server started (keepAliveTimeout disabled)");
    } else {
      logger.info({ port }, "Agent WebSocket server started");
    }

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
        pending.capabilities ?? []
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
              this.triggerCertReissue(agent, storedCapabilities);
            } else {
              // Push delegation certs and LLM config for freshly reconnected agents
              this.pushDelegationUpdate(agentDid);
              this.pushStoredLlmConfig(agentDid);
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

      // Persist result so test/observability endpoints can retrieve it
      logActivity(
        "intent_result",
        agentId,
        agentId ? this.agents.get(agentId)?.name : undefined,
        JSON.stringify({ intentId: payload.intentId, status: payload.status, output: payload.output }),
      );
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
    // capabilities (the initial cert only carries the agent's requested capabilities).
    this.triggerCertReissue(agent, capabilities as AgentCapability[]);

    // Push any stored LLM config now that the agent is registered and connected.
    this.pushStoredLlmConfig(agentDid);

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

    if (!target) {
      logger.warn({ registrationId }, "No pending connection found for rejection");
      return false;
    }

    // Remove from pending_registrations — activity_log keeps the rejection record
    deletePendingRegistration(registrationId);

    logActivity("registration_rejected", undefined, target.agentName, JSON.stringify({ registrationId, reason }));
    this.broadcastAdminUpdate("registration_rejected");

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
  private triggerCertReissue(agent: ConnectedAgent, capabilities: AgentCapability[]): void {
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
      isCertReissue: true,
      timer,
    });

    // Tell the agent its capabilities (so it sends them back during the handshake)
    this.sendMessage(agent.ws, {
      messageId: `cert-reissue-caps-${Date.now()}`,
      type: "update_capabilities",
      agentId: agent.id,
      payload: {
        capabilities,
        reason: "Certificate reissue",
      } satisfies WSUpdateCapabilitiesPayload,
      timestamp: new Date().toISOString(),
    });

    // Start a fresh auth challenge
    this.sendMessage(agent.ws, {
      messageId: `cert-reissue-auth-${Date.now()}`,
      type: "auth_challenge",
      payload: { sessionId, data: "" } satisfies WSAuthChallengePayload,
      timestamp: new Date().toISOString(),
    });
  }

  getConnectedAgents(): ConnectedAgent[] {
    return Array.from(this.agents.values());
  }

  getAgent(agentId: string): ConnectedAgent | undefined {
    return this.agents.get(agentId);
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

  sendPolicyUpdate(agentId: string, policy: Record<string, any>): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ agentId }, "Agent not connected for policy update");
      return false;
    }

    const message: WSMessage = {
      messageId: `policy-${Date.now()}`,
      type: "policy_update",
      agentId,
      payload: policy,
      timestamp: new Date().toISOString(),
    };

    try {
      agent.ws.send(JSON.stringify(message));
      logger.info({ agentId, policyId: policy.id }, "Policy update sent to agent");
      return true;
    } catch (error) {
      logger.error(error, "Failed to send policy to agent");
      return false;
    }
  }

  broadcastPolicyUpdate(policy: Record<string, any>): string[] {
    const recipientIds: string[] = [];

    for (const agentId of this.agents.keys()) {
      if (this.sendPolicyUpdate(agentId, policy)) {
        recipientIds.push(agentId);
      }
    }

    logger.info(
      { policyId: policy.id, recipients: recipientIds.length },
      "Policy broadcasted to all agents"
    );

    return recipientIds;
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
        name: agent.name,
        capabilities: JSON.parse(agent.capabilities),
        registeredAt: agent.registered_at,
        lastSeen: agent.last_seen,
        online: connectedDids.has(agent.did),
        connectedAt: connected?.connectedAt?.toISOString() ?? null,
        lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
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
