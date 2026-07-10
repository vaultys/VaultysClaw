/**
 * WebSocket server for agent controller connections
 * Handles VaultysId challenge-response authentication, intent distribution,
 * policy updates, and result collection
 */

import {
  createServer as createHttpServer,
  type Server as HttpServer,
} from "node:http";
import { WebSocket, WebSocketServer, type Data as WebSocketData } from "ws";
import pino from "pino";
import { type AgentSender, WsSender } from "./agent-sender";
import {
  ActivityLogDAO,
  AgentDAO,
  AuthSessionDAO,
  DelegationCertDAO,
  IntentDAO,
  KnowledgeDAO,
  PendingRegistrationDAO,
  PolicyDAO,
  WorkspaceDAO,
  SkillOverrideDAO,
} from "@/db";
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
  type WSSkillsConfigPayload,
  type WSChannelMessageSendPayload,
  ResourceLimits,
} from "@vaultysclaw/shared";
import {
  createAuthSession,
  processChallenge,
  type PolicyMeta,
} from "./auth-handler";
import { geolocateIp } from "./geoip";
import {
  trace,
  context,
  propagation,
  SpanStatusCode,
} from "@opentelemetry/api";
import { agentsConnected, llmTokens, intentsTotal } from "./metrics";
import { ChannelService } from "./channel-service";
import { enqueueNotification } from "./notification-queue";
import { crypto } from "@vaultys/id";
import { signIntent } from "./intent-signing";
import {
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
  createAgentKey,
} from "./litellm-client";

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
type PendingPhase =
  | "awaiting_register"
  | "awaiting_approval"
  | "authenticating";

export type ToolApproval = WSToolApprovalRequestPayload & {
  agentId: string;
  agentName?: string;
  createdAt: number;
};

interface PendingConnection {
  sender: AgentSender;
  sessionId: string;
  phase: PendingPhase;
  registrationId?: string;
  agentName?: string;
  agentDid?: string;
  certificateData?: string;
  capabilities?: string[];
  /** Raw client IP captured at connection time, used for auto-geolocation. */
  clientIp?: string;
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
  sender: AgentSender;
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
  /** Transport used by this agent connection. */
  transport: "ws" | "peerjs";
}

/**
 * WebSocket Server Manager with VaultysId authentication
 */
export class AgentWSServer {
  private wss: WebSocketServer;
  private httpServer: HttpServer;
  private agents: Map<string, ConnectedAgent> = new Map();
  private pending: Map<AgentSender, PendingConnection> = new Map();
  /** Map from raw WebSocket to its WsSender wrapper — for event handler lookups */
  private wsSenders: Map<WebSocket, WsSender> = new Map();
  private port: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  /** Ping interval — keeps TCP connections alive and detects ghosts */
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  /** Callbacks for pending chat streaming responses keyed by conversationId */
  private chatCallbacks: Map<string, (payload: WSChatResponsePayload) => void> =
    new Map();
  /** Callbacks for tool approval requests forwarded to the active chat SSE stream, keyed by conversationId */
  private chatApprovalCallbacks: Map<
    string,
    (payload: WSToolApprovalRequestPayload) => void
  > = new Map();
  /** Callbacks for workflow step results keyed by intentId */
  private resultCallbacks: Map<string, (payload: any) => void> = new Map();
  /** Pending tool approval requests from agents. Key = requestId */
  private pendingToolApprovals: Map<
    string,
    {
      agentId: string;
      payload: WSToolApprovalRequestPayload;
      createdAt: number;
    }
  > = new Map();
  /** Callbacks for tool execution events from agents */
  private toolExecutionCallbacks: Map<
    string,
    (payload: WSToolExecutionPayload & { agentId: string }) => void
  > = new Map();
  /** Pending one-shot callbacks for chat session list responses. Key = agentId */
  private chatSessionsCallbacks: Map<
    string,
    (
      payload: import("@vaultysclaw/shared").WSChatSessionsResponsePayload
    ) => void
  > = new Map();
  /** Pending one-shot callbacks for chat history responses. Key = `agentId:sessionId` */
  private chatHistoryCallbacks: Map<
    string,
    (
      payload: import("@vaultysclaw/shared").WSChatHistoryResponsePayload
    ) => void
  > = new Map();
  /** Cumulative message counters per transport, reset on server restart. */
  private transportStats = {
    ws: {
      messagesIn: 0,
      messagesOut: 0,
      bytesIn: 0,
      bytesOut: 0,
      connectionsTotal: 0,
    },
    peerjs: {
      messagesIn: 0,
      messagesOut: 0,
      bytesIn: 0,
      bytesOut: 0,
      connectionsTotal: 0,
    },
  };
  private startedAt = new Date();

  /** Circular log buffer — max 500 entries across all transports. */
  private logBuffer: Array<{
    id: string;
    timestamp: string;
    transport: "ws" | "peerjs";
    level: "info" | "warn" | "error";
    event: string;
    detail?: string;
  }> = [];
  private static LOG_MAX = 500;
  private logSeq = 0;

  private appendLog(
    transport: "ws" | "peerjs",
    level: "info" | "warn" | "error",
    event: string,
    detail?: string
  ): void {
    this.logBuffer.push({
      id: `${++this.logSeq}`,
      timestamp: new Date().toISOString(),
      transport,
      level,
      event,
      detail,
    });
    if (this.logBuffer.length > AgentWSServer.LOG_MAX) {
      this.logBuffer.shift();
    }
  }

  getLogs(transport?: "ws" | "peerjs", limit = 200) {
    const entries = transport
      ? this.logBuffer.filter((e) => e.transport === transport)
      : this.logBuffer;
    return entries.slice(-limit);
  }

  get wsPort(): number {
    return this.port;
  }

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
    this.cleanupInterval = setInterval(async () => {
      const deleted = await AuthSessionDAO.deleteExpired(
        AUTH_TIMEOUT_MS / 1000
      );
      if (deleted > 0) {
        logger.debug({ deleted }, "Pruned expired auth sessions");
      }
    }, SESSION_CLEANUP_INTERVAL_MS);

    // Ping all connected WS agents every 20 s to keep the TCP connection alive
    // and to detect stale/ghost connections (no pong → terminate).
    // PeerJS connections have their own keep-alive mechanism.
    this.pingInterval = setInterval(() => {
      for (const agent of this.agents.values()) {
        agent.sender.ping?.();
      }
      for (const conn of this.pending.values()) {
        conn.sender.ping?.();
      }
    }, 20_000);
  }

  private setupServer(): void {
    this.wss.on(
      "connection",
      async (ws: WebSocket, request: import("http").IncomingMessage) => {
        logger.info(
          "New WebSocket connection — awaiting register or auth_challenge"
        );

        const clientIp =
          (request.headers["x-forwarded-for"] as string | undefined)
            ?.split(",")[0]
            ?.trim() ??
          request.socket.remoteAddress ??
          undefined;

        const sender = new WsSender(ws);
        this.wsSenders.set(ws, sender);
        this.transportStats.ws.connectionsTotal++;
        this.appendLog("ws", "info", "connected", `new TCP connection`);

        try {
          const { sessionId } = await createAuthSession();

          // Set initial auth timeout
          const timer = setTimeout(() => {
            logger.warn({ sessionId }, "Auth timeout — closing connection");
            this.appendLog(
              "ws",
              "warn",
              "auth_timeout",
              `session ${sessionId.slice(0, 8)}`
            );
            this.sendMessage(sender, {
              messageId: `auth-fail-${Date.now()}`,
              type: "auth_failed",
              payload: {
                reason: "Authentication timeout",
              } satisfies WSAuthFailedPayload,
              timestamp: new Date().toISOString(),
            });
            sender.close();
            this.pending.delete(sender);
          }, AUTH_TIMEOUT_MS);

          this.pending.set(sender, {
            sender,
            sessionId,
            phase: "awaiting_register",
            timer,
            clientIp,
          });

          // Send session ID to agent — agent decides to register (new) or auth (returning)
          this.appendLog(
            "ws",
            "info",
            "auth_challenge_sent",
            `session ${sessionId.slice(0, 8)}`
          );
          this.sendMessage(sender, {
            messageId: `auth-${Date.now()}`,
            type: "auth_challenge",
            payload: { sessionId, data: "" } satisfies WSAuthChallengePayload,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error(error, "Failed to start auth session");
          sender.close();
          this.wsSenders.delete(ws);
          return;
        }

        ws.on("message", (data: WebSocketData) => {
          this.handleMessage(sender, data as string);
        });

        ws.on("close", () => {
          this.handleDisconnect(sender);
          this.wsSenders.delete(ws);
        });

        ws.on("error", (error: Error) => {
          logger.error(error, "WebSocket error");
        });
      }
    );
  }

  private handleMessage(
    sender: AgentSender,
    data: string | WebSocketData
  ): void {
    try {
      const raw = data as string;
      const bucket = this.transportStats[sender.transport];
      bucket.messagesIn++;
      bucket.bytesIn += raw.length;
      const message: WSMessage = JSON.parse(raw);

      logger.debug(
        { messageId: message.messageId, type: message.type },
        "Received message"
      );

      // If connection is still pending, route based on phase
      const pendingConn = this.pending.get(sender);
      if (pendingConn) {
        if (
          message.type === "register" &&
          pendingConn.phase === "awaiting_register"
        ) {
          this.handleRegisterRequest(pendingConn, message);
          return;
        } else if (
          message.type === "auth_challenge" &&
          pendingConn.phase === "authenticating"
        ) {
          this.handleAuthChallenge(pendingConn, message);
          return;
        } else if (pendingConn.isCertReissue) {
          // During a cert reissue the agent is still fully authenticated — only
          // its certificate is being refreshed. Non-auth messages (e.g.
          // knowledge_status_sync sent immediately after auth_complete) arrive
          // while the reissue pending entry is set up. Route them through the
          // normal authenticated handler below rather than rejecting them.
          logger.debug(
            { type: message.type },
            "Non-auth message during cert reissue — routing to authenticated handler"
          );
          // fall through to authenticated handler
        } else {
          logger.warn(
            { type: message.type, phase: pendingConn.phase },
            "Rejecting message — not expected in current phase"
          );
          this.sendMessage(sender, {
            messageId: `err-${Date.now()}`,
            type: "error",
            payload: { error: "Unexpected message in current phase" },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // Authenticated messages
      switch (message.type) {
        case "result":
          this.handleResult(message);
          break;

        case "knowledge_sync_result":
          this.handleKnowledgeSyncResult(message);
          break;

        case "knowledge_status_sync":
          this.handleKnowledgeStatusSync(message);
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

        case "channel_message_send":
          this.handleChannelMessageSend(message);
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

    logger.info(
      { agentName },
      "Agent registering — starting auth to verify identity"
    );

    // Send auth_challenge to start VaultysId handshake
    // DID-based approval happens after auth completes
    this.sendMessage(pending.sender, {
      messageId: `auth-${Date.now()}`,
      type: "auth_challenge",
      payload: {
        sessionId: pending.sessionId,
        data: "",
      } satisfies WSAuthChallengePayload,
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
        pending.policyMeta
      );

      if (result.done && result.success) {
        // Auth succeeded — identity verified via certificate
        const agentDid = result.agentDid!;

        // Check if this DID is already registered in the DB.
        // This is the secure auto-approve: the DID is derived from the
        // agent's public key proven by the certificate handshake,
        // so it cannot be spoofed by reusing another agent's name.
        const knownAgent = await AgentDAO.findByDid(agentDid);

        if (knownAgent) {
          // Known agent — auto-approve with stored capabilities
          clearTimeout(pending.timer);
          this.pending.delete(pending.sender);

          const storedCapabilities =
            knownAgent.capabilities as AgentCapability[];

          // Close existing connection if agent reconnected from new socket
          const existing = this.agents.get(agentDid);
          if (existing && existing.sender !== pending.sender) {
            logger.info(
              { agentDid },
              "Agent reconnecting with verified certificate — replacing old connection"
            );
            existing.sender.close();
          }

          const agent: ConnectedAgent = {
            id: agentDid,
            name: result.agentName ?? knownAgent.name,
            sender: pending.sender,
            capabilities: storedCapabilities,
            connectedAt: new Date(),
            lastHeartbeat: new Date(),
            transport: pending.sender.transport,
            dailyPriceSpent: knownAgent.dailyPriceSpent ?? undefined,
          };

          this.agents.set(agentDid, agent);
          agentsConnected.add(1);

          // Update agent record (certificate, last_seen)
          await AgentDAO.upsert({
            did: agentDid,
            name: agent.name,
            capabilities: agent.capabilities,
            certificateData: result.certificateData,
          });

          // Auto-geolocate from IP if no location stored yet
          if (!knownAgent.locationLat && pending.clientIp) {
            geolocateIp(pending.clientIp)
              .then((geo) => {
                if (geo) AgentDAO.updateLocation(agentDid, geo).catch(() => {});
              })
              .catch(() => {});
          }

          await ActivityLogDAO.log("agent_reconnected", agentDid, agent.name);
          this.appendLog(
            pending.sender.transport,
            "info",
            "auth_complete",
            agent.name
          );
          this.broadcastAdminUpdate("agent_reconnected");

          // Send auth_complete
          this.sendMessage(pending.sender, {
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
            this.sendMessage(pending.sender, {
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
            const reportedCaps = (pending.capabilities ?? [])
              .slice()
              .sort()
              .join(",");
            const correctCaps = storedCapabilities.slice().sort().join(",");
            if (reportedCaps !== correctCaps) {
              logger.info(
                { agentDid },
                "Cert metadata mismatch — triggering silent re-auth to reissue certificate"
              );
              const policyMeta = await this.fetchActivePolicyMeta(agentDid);
              this.triggerCertReissue(agent, storedCapabilities, policyMeta);
            } else {
              // Push delegation certs, LLM config, and skills config
              this.pushDelegationUpdate(agentDid);
              this.pushStoredLlmConfig(agentDid);
              this.pushSkillsConfig(agentDid);
            }
          } else {
            // Cert reissue completed — push the latest stored config so the
            // agent is fully up-to-date (LLM config may have been saved while
            // the reissue handshake was in flight).
            this.pushDelegationUpdate(agentDid);
            this.pushStoredLlmConfig(agentDid);
            this.pushSkillsConfig(agentDid);
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
          pending.timer = setTimeout(async () => {
            logger.warn(
              { registrationId },
              "Registration approval timeout — closing connection"
            );
            this.sendMessage(pending.sender, {
              messageId: `auth-fail-${Date.now()}`,
              type: "auth_failed",
              payload: {
                reason: "Registration approval timeout",
              } satisfies WSAuthFailedPayload,
              timestamp: new Date().toISOString(),
            });
            pending.sender.close();
            this.pending.delete(pending.sender);
            await PendingRegistrationDAO.delete(registrationId);
          }, REGISTRATION_TIMEOUT_MS);

          // Persist pending registration with the capabilities the agent requested
          await PendingRegistrationDAO.create(
            registrationId,
            pending.sessionId,
            pending.agentName ?? "unknown",
            pending.capabilities ?? []
          );

          await ActivityLogDAO.log(
            "registration_requested",
            agentDid,
            pending.agentName,
            JSON.stringify({ registrationId, did: agentDid })
          );
          this.appendLog(
            pending.sender.transport,
            "info",
            "registration_pending",
            pending.agentName ?? agentDid.slice(0, 16)
          );
          this.broadcastAdminUpdate("registration_requested");

          // Notify agent it's pending
          this.sendMessage(pending.sender, {
            messageId: `reg-pending-${Date.now()}`,
            type: "registration_pending",
            payload: {
              registrationId,
              message:
                "Identity verified. Registration pending admin approval.",
            } satisfies WSRegistrationPendingPayload,
            timestamp: new Date().toISOString(),
          });

          logger.info(
            { registrationId, agentDid, agentName: pending.agentName },
            "Unknown DID — registration pending admin approval"
          );
        }
      } else if (result.done && !result.success) {
        // Auth failed
        clearTimeout(pending.timer);
        this.pending.delete(pending.sender);

        this.sendMessage(pending.sender, {
          messageId: `auth-fail-${Date.now()}`,
          type: "auth_failed",
          payload: {
            reason: result.error ?? "Authentication failed",
          } satisfies WSAuthFailedPayload,
          timestamp: new Date().toISOString(),
        });

        logger.warn(
          { sessionId: pending.sessionId, error: result.error },
          "Auth failed"
        );
        pending.sender.close();
      } else {
        // Challenge in progress — send next data
        if (result.responseData) {
          this.sendMessage(pending.sender, {
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
      this.sendMessage(pending.sender, {
        messageId: `auth-fail-${Date.now()}`,
        type: "auth_failed",
        payload: { reason: "Internal error" } satisfies WSAuthFailedPayload,
        timestamp: new Date().toISOString(),
      });
      pending.sender.close();
      clearTimeout(pending.timer);
      this.pending.delete(pending.sender);
    }
  }

  private async handleResult(message: WSMessage): Promise<void> {
    try {
      const { agentId, payload } = message;

      logger.info(
        { agentId, intentId: payload.intentId, status: payload.status },
        "Received execution result from agent"
      );

      if (agentId) await AgentDAO.updateLastSeen(agentId);

      // Call registered callback if one exists (for workflow execution)
      if (payload.intentId && this.resultCallbacks.has(payload.intentId)) {
        const callback = this.resultCallbacks.get(payload.intentId);
        if (callback) {
          callback({ ...payload, agentId });
          this.resultCallbacks.delete(payload.intentId);
        }
      }

      // Record OTel span + metric for intent result
      if (payload.intentId) {
        const tracer = trace.getTracer("vaultysclaw-control-plane");
        const span = tracer.startSpan("vc.intent.result", {
          attributes: {
            "agent.did": agentId ?? "",
            "intent.id": payload.intentId,
            "intent.status": payload.status ?? "unknown",
          },
        });
        if (payload.status !== "success")
          span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        intentsTotal.add(1, {
          status: payload.status ?? "unknown",
          "agent.did": agentId ?? "",
        });
      }

      // Persist result so test/observability endpoints can retrieve it
      await ActivityLogDAO.log(
        "intent_result",
        agentId,
        agentId ? this.agents.get(agentId)?.name : undefined,
        JSON.stringify({
          intentId: payload.intentId,
          status: payload.status,
          output: payload.output,
        })
      );
      if (payload.intentId) {
        try {
          await IntentDAO.updateResult(
            payload.intentId,
            payload.status === "success" ? "success" : "failed",
            payload.output,
            typeof payload.error === "string" ? payload.error : undefined
          );
        } catch {
          /* non-fatal — intent may not have been logged (e.g. peer-originated) */
        }
      }
    } catch (error) {
      logger.error(error, "Error handling execution result");
    }
  }

  /** Bulk reconcile knowledge source statuses pushed by the agent on (re)connect. */
  private async handleKnowledgeStatusSync(message: WSMessage): Promise<void> {
    try {
      const { agentId, payload } = message;
      const sources = (payload.sources ?? []) as Array<{
        sourceId: string;
        status: string;
        docCount?: number;
        chunkCount?: number;
        error?: string | null;
      }>;

      let updated = 0;
      for (const s of sources) {
        if (!s.sourceId || !s.status) continue;
        // Only overwrite if the CP thinks the source is still syncing — never
        // downgrade a ready/error state the CP already recorded.
        const existing = await KnowledgeDAO.findSource(s.sourceId);
        if (!existing || existing.status !== "syncing") continue;

        await KnowledgeDAO.updateSourceStatus(s.sourceId, s.status, {
          docCount: s.docCount,
          chunkCount: s.chunkCount,
          error: s.error ?? null,
        });
        updated++;
      }

      if (updated > 0) {
        logger.info(
          { agentId, updated },
          "Reconciled stuck knowledge sources on agent reconnect"
        );
      }
    } catch (err) {
      logger.error(err, "Error handling knowledge_status_sync");
    }
  }

  private async handleKnowledgeSyncResult(message: WSMessage): Promise<void> {
    try {
      const { agentId, payload } = message;
      const { sourceId, status, docsProcessed, chunksCreated, errors } =
        payload as {
          sourceId: string;
          status: "ready" | "error";
          docsProcessed?: number;
          chunksCreated?: number;
          errors?: string[];
        };

      if (!sourceId) {
        logger.warn(
          { agentId },
          "knowledge_sync_result missing sourceId — ignored"
        );
        return;
      }

      const errorMsg = errors?.length ? errors.join("; ") : undefined;
      await KnowledgeDAO.updateSourceStatus(sourceId, status, {
        docCount: docsProcessed,
        chunkCount: chunksCreated,
        error: errorMsg ?? null,
      });

      logger.info(
        { agentId, sourceId, status, docsProcessed, chunksCreated, errors },
        "Knowledge sync result received — status updated"
      );

      if (agentId) await AgentDAO.updateLastSeen(agentId);
    } catch (err) {
      logger.error(err, "Error handling knowledge_sync_result");
    }
  }

  private async handleHeartbeat(message: WSMessage): Promise<void> {
    const { agentId } = message;

    const agent = agentId ? this.agents.get(agentId) : undefined;
    if (agent && agentId) {
      agent.lastHeartbeat = new Date();
      if (agentId) await AgentDAO.updateLastSeen(agentId);

      // Sync agent-reported config from heartbeat payload
      const hbPayload = message.payload as
        | {
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
          }
        | undefined;
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
        agent.tokenUsage.completionTokens =
          hbPayload.tokenUsage.total.completionTokens;

        // Store daily and monthly stats
        if (hbPayload.tokenUsage.daily) {
          agent.dailyTokenUsage = hbPayload.tokenUsage.daily;
        }
        if (hbPayload.tokenUsage.monthly) {
          agent.monthlyTokenUsage = hbPayload.tokenUsage.monthly;
        }
        if (hbPayload.tokenUsage.dailyPriceSpent !== undefined) {
          agent.dailyPriceSpent = hbPayload.tokenUsage.dailyPriceSpent;
          // Persist daily price spent to DB
          await AgentDAO.updateDailyPriceSpent(
            agentId,
            hbPayload.tokenUsage.dailyPriceSpent
          );
        }

        // Persist token usage to DB for the agent
        await AgentDAO.upsertTokenUsage(
          agentId,
          agent.tokenUsage.promptTokens,
          agent.tokenUsage.completionTokens
        );

        // Update workspace token usage if delta is provided
        if (hbPayload.tokenUsage.sinceLastSync) {
          const agentWorkspaces = await AgentDAO.getWorkspaces(agentId);
          const deltaPrompt = hbPayload.tokenUsage.sinceLastSync.promptTokens;
          const deltaCompletion =
            hbPayload.tokenUsage.sinceLastSync.completionTokens;

          // Emit OTel token metrics
          const llmAttrs = {
            "agent.did": agentId,
            model: agent.reportedLlm?.model ?? "unknown",
            provider: agent.reportedLlm?.provider ?? "unknown",
          };
          if (deltaPrompt > 0)
            llmTokens.add(deltaPrompt, { ...llmAttrs, token_type: "prompt" });
          if (deltaCompletion > 0)
            llmTokens.add(deltaCompletion, {
              ...llmAttrs,
              token_type: "completion",
            });

          // Record in daily/monthly history buckets
          await AgentDAO.addTokenUsageHistory(
            agentId,
            deltaPrompt,
            deltaCompletion
          );

          for (const workspaceMembership of agentWorkspaces) {
            const workspaceId = workspaceMembership.workspaceId;
            // Get current workspace token usage (uses snake_case fields from DB row)
            const currentUsage = await WorkspaceDAO.getTokenUsage(workspaceId);
            const currentPrompt = currentUsage?.promptTokens ?? 0;
            const currentCompletion = currentUsage?.completionTokens ?? 0;
            // Add the delta
            await WorkspaceDAO.upsertTokenUsage(
              workspaceId,
              currentPrompt + deltaPrompt,
              currentCompletion + deltaCompletion
            );
          }
        }
      }

      logger.debug({ agentId }, "Heartbeat received");

      this.sendMessage(agent.sender, {
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
        this.chatApprovalCallbacks.delete(payload.conversationId);
      }
    } else {
      logger.warn(
        { conversationId: payload.conversationId },
        "No callback for chat response"
      );
    }
  }

  private handleChatSessionsResponse(message: WSMessage): void {
    const agentId = message.agentId ?? "";
    const cb = this.chatSessionsCallbacks.get(agentId);
    if (cb) {
      this.chatSessionsCallbacks.delete(agentId);
      cb(
        message.payload as import("@vaultysclaw/shared").WSChatSessionsResponsePayload
      );
    }
  }

  private handleChatHistoryResponse(message: WSMessage): void {
    const payload =
      message.payload as import("@vaultysclaw/shared").WSChatHistoryResponsePayload;
    const key = `${message.agentId ?? ""}:${payload.sessionId}`;
    const cb = this.chatHistoryCallbacks.get(key);
    if (cb) {
      this.chatHistoryCallbacks.delete(key);
      cb(payload);
    }
  }

  private handleChannelMessageSend(message: WSMessage): void {
    try {
      const payload = message.payload as WSChannelMessageSendPayload;
      const agentId = message.agentId ?? "";

      if (!payload.channelId || !payload.content) {
        logger.error("Missing required fields in channel message payload");
        return;
      }

      // Post message to channel on behalf of agent
      ChannelService.postMessage({
        channelId: payload.channelId,
        authorDid: agentId,
        authorType: "agent",
        content: payload.content,
        threadId: payload.threadId,
        metadata: payload.metadata,
      });

      logger.info(
        { agentId, channelId: payload.channelId, threadId: payload.threadId },
        "Channel message posted by agent"
      );
    } catch (err) {
      logger.error(err, "Error posting channel message from agent");
    }
  }

  /** Request the list of chat sessions from an agent. Resolves when the agent responds (10 s timeout). */
  getChatSessions(
    agentDid: string,
    limit = 50
  ): Promise<import("@vaultysclaw/shared").ChatSession[]> {
    return new Promise((resolve, reject) => {
      const agent = this.agents.get(agentDid);
      if (!agent || !agent.sender.isOpen()) {
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
      this.sendMessage(agent.sender, {
        messageId: `get-sessions-${Date.now()}`,
        type: "get_chat_sessions",
        agentId: agentDid,
        payload: {
          limit,
        } satisfies import("@vaultysclaw/shared").WSGetChatSessionsPayload,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /** Request the full message history of one session from an agent. */
  getChatHistory(
    agentDid: string,
    sessionId: string
  ): Promise<import("@vaultysclaw/shared").ChatHistoryMessage[]> {
    return new Promise((resolve, reject) => {
      const agent = this.agents.get(agentDid);
      if (!agent || !agent.sender.isOpen()) {
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
      this.sendMessage(agent.sender, {
        messageId: `get-history-${Date.now()}`,
        type: "get_chat_history",
        agentId: agentDid,
        payload: {
          sessionId,
        } satisfies import("@vaultysclaw/shared").WSGetChatHistoryPayload,
        timestamp: new Date().toISOString(),
      });
    });
  }

  // ---- Tool approval system ----

  private handleToolApprovalRequest(message: WSMessage): void {
    const payload = message.payload as WSToolApprovalRequestPayload;
    const agentId = message.agentId ?? payload.agentId ?? "";

    logger.info(
      { agentId, requestId: payload.requestId, tool: payload.toolName },
      "Tool approval request received"
    );

    this.pendingToolApprovals.set(payload.requestId, {
      agentId,
      payload,
      createdAt: Date.now(),
    });

    // Auto-cleanup after 3 minutes
    setTimeout(
      () => this.pendingToolApprovals.delete(payload.requestId),
      180_000
    );

    // Forward to active chat stream if this approval is tied to a conversation
    if (payload.conversationId) {
      const chatCb = this.chatApprovalCallbacks.get(payload.conversationId);
      if (chatCb) chatCb(payload);
    }
  }

  private handleToolExecution(message: WSMessage): void {
    const payload = message.payload as WSToolExecutionPayload;
    const agentId = message.agentId ?? "";

    // Forward to any registered listener (e.g. SSE stream for the chat UI)
    if (payload.conversationId) {
      const cb = this.toolExecutionCallbacks.get(payload.conversationId);
      if (cb) cb({ ...payload, agentId });
    }

    // Persist to activity log (fire-and-forget)
    const agent = this.agents.get(agentId);
    ActivityLogDAO.log(
      "tool_execution",
      agentId,
      agent?.name,
      JSON.stringify({
        intentId: payload.intentId,
        conversationId: payload.conversationId,
        toolName: payload.toolName,
        args: payload.args,
        result: payload.result,
        error: payload.error,
        durationMs: payload.durationMs,
      })
    ).catch((err) =>
      logger.warn({ err }, "Failed to persist tool_execution to activity log")
    );

    logger.info(
      { agentId, tool: payload.toolName, intentId: payload.intentId },
      "Tool execution reported"
    );
  }

  /** Get all pending tool approval requests (for admin UI). */
  getPendingToolApprovals(): ToolApproval[] {
    const result: ToolApproval[] = [];

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
  async respondToToolApproval(
    requestId: string,
    approved: boolean,
    reason?: string
  ): Promise<boolean> {
    const entry = this.pendingToolApprovals.get(requestId);
    if (!entry) {
      logger.warn({ requestId }, "No pending approval for this request");
      return false;
    }

    const agent = this.agents.get(entry.agentId);
    if (!agent || !agent.sender.isOpen()) {
      logger.warn({ requestId, agentId: entry.agentId }, "Agent not connected");
      this.pendingToolApprovals.delete(requestId);
      return false;
    }

    this.sendMessage(agent.sender, {
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

    logger.info(
      { requestId, approved, agentId: entry.agentId },
      "Tool approval response sent"
    );
    await ActivityLogDAO.log(
      approved ? "tool_approved" : "tool_rejected",
      entry.agentId,
      undefined,
      JSON.stringify({
        tool: entry.payload.toolName,
        args: entry.payload.args,
        reason,
      })
    );

    return true;
  }

  /** Register a callback for tool execution events on a conversation. */
  onToolExecution(
    conversationId: string,
    callback: (payload: WSToolExecutionPayload & { agentId: string }) => void
  ): void {
    this.toolExecutionCallbacks.set(conversationId, callback);
    setTimeout(
      () => this.toolExecutionCallbacks.delete(conversationId),
      5 * 60_000
    );
  }

  /** Enqueue a task on an agent via WS. */
  sendTaskToAgent(
    agentId: string,
    action: string,
    params: Record<string, unknown> = {}
  ): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.sender.isOpen()) return false;
    this.sendMessage(agent.sender, {
      messageId: `task-enq-${Date.now()}`,
      type: "task_enqueue",
      agentId,
      payload: { action, params } as any,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  /** Send a schedule upsert to an agent via WS. */
  sendScheduleToAgent(
    agentId: string,
    schedule: {
      id: string;
      name: string;
      cron: string;
      action: string;
      params?: Record<string, unknown>;
      enabled?: boolean;
    }
  ): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.sender.isOpen()) return false;
    this.sendMessage(agent.sender, {
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
    if (!agent || !agent.sender.isOpen()) return false;
    this.sendMessage(agent.sender, {
      messageId: `sched-del-${Date.now()}`,
      type: "schedule_delete",
      agentId,
      payload: { id: scheduleId } as any,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  private async handleDisconnect(sender: AgentSender): Promise<void> {
    // Check pending connections
    const pending = this.pending.get(sender);
    if (pending) {
      clearTimeout(pending.timer);
      // If the agent was awaiting approval, clean up the DB row
      if (pending.registrationId) {
        await PendingRegistrationDAO.delete(pending.registrationId);
        logger.info(
          {
            registrationId: pending.registrationId,
            agentName: pending.agentName,
          },
          "Pending registration removed — agent disconnected"
        );
        this.appendLog(
          sender.transport,
          "warn",
          "pending_disconnected",
          pending.agentName ?? pending.registrationId
        );
        this.broadcastAdminUpdate("registration_disconnected");
      }
      this.pending.delete(sender);
      logger.debug(
        { sessionId: pending.sessionId },
        "Pending connection closed"
      );
      return;
    }

    // Check authenticated agents
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.sender === sender) {
        this.agents.delete(agentId);
        agentsConnected.add(-1);
        await ActivityLogDAO.log("agent_disconnected", agentId, agent.name);
        this.appendLog(sender.transport, "info", "disconnected", agent.name);
        this.broadcastAdminUpdate("agent_disconnected");
        logger.info({ agentId, agentName: agent.name }, "Agent disconnected");
        break;
      }
    }
  }

  private sendMessage(sender: AgentSender, message: WSMessage): void {
    if (sender.isOpen()) {
      const raw = JSON.stringify(message);
      sender.sendRaw(raw);
      const bucket = this.transportStats[sender.transport];
      bucket.messagesOut++;
      bucket.bytesOut += raw.length;
    }
  }

  // --- Public API ---

  /**
   * Approve a pending registration.
   * Since auth already completed before pending, the agent's DID is verified.
   * Directly promotes the connection to authenticated with admin-assigned capabilities.
   */
  async approveRegistration(
    registrationId: string,
    capabilities: AgentCapability[]
  ): Promise<boolean> {
    // Find the pending connection with this registration ID
    let target: PendingConnection | undefined;
    for (const pending of this.pending.values()) {
      if (
        pending.registrationId === registrationId &&
        pending.phase === "awaiting_approval"
      ) {
        target = pending;
        break;
      }
    }

    if (!target) {
      logger.warn(
        { registrationId },
        "No pending connection found for registration"
      );
      return false;
    }

    if (!target.agentDid) {
      logger.warn(
        { registrationId },
        "Pending connection has no verified DID — cannot approve"
      );
      return false;
    }

    const agentDid = target.agentDid;

    // Remove from pending_registrations — activity_log keeps the approval record
    await PendingRegistrationDAO.delete(registrationId);

    // Upsert agent in DB with admin-assigned capabilities
    await AgentDAO.upsert({
      did: agentDid,
      name: target.agentName ?? "unknown",
      capabilities,
      certificateData: target.certificateData,
    });

    void enqueueNotification({
      eventType: "agent.created",
      data: { agentDid, agentName: target.agentName ?? "unknown" },
    });

    // Promote to authenticated agent
    clearTimeout(target.timer);
    this.pending.delete(target.sender);

    // Load agent from DB to get persisted fields like dailyPriceSpent
    const dbAgent = await AgentDAO.findByDid(agentDid);

    const agent: ConnectedAgent = {
      id: agentDid,
      name: target.agentName ?? "unknown",
      sender: target.sender,
      capabilities,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      transport: target.sender.transport,
      dailyPriceSpent: dbAgent?.dailyPriceSpent ?? undefined,
    };

    this.agents.set(agentDid, agent);
    agentsConnected.add(1);

    await ActivityLogDAO.log(
      "registration_approved",
      agentDid,
      agent.name,
      JSON.stringify({ registrationId, capabilities })
    );
    this.appendLog(
      target.sender.transport,
      "info",
      "approved",
      `${agent.name} · ${capabilities.length} caps`
    );
    this.broadcastAdminUpdate("registration_approved");

    // Enroll agent in default workspace on first approval
    await WorkspaceDAO.enrollInDefault("agent", agentDid);

    // Notify agent — approved and connected
    this.sendMessage(target.sender, {
      messageId: `reg-approved-${Date.now()}`,
      type: "registration_approved",
      payload: {
        registrationId,
        capabilities,
      } satisfies WSRegistrationApprovedPayload,
      timestamp: new Date().toISOString(),
    });

    this.sendMessage(target.sender, {
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

    logger.info(
      { registrationId, agentDid, capabilities },
      "Registration approved — agent connected"
    );

    // Trigger a certificate reissue so the cert metadata reflects the admin-assigned
    // capabilities (and any active governance policy limits).
    const policyMeta = await this.fetchActivePolicyMeta(agentDid);
    await this.triggerCertReissue(agent, capabilities, policyMeta);

    // Auto-provision a per-agent LiteLLM virtual key if LiteLLM is configured
    // and the agent's primary workspace has a router key set up.
    if (isLiteLLMConfigured()) {
      try {
        const agentWorkspaces = await AgentDAO.getWorkspaces(agentDid);
        const primary = agentWorkspaces.find((r) => r.isPrimary) ?? agentWorkspaces[0];
        if (primary) {
          const routerKey = await WorkspaceDAO.getRouterKey(primary.workspaceId);
          if (routerKey?.litellmVirtualKey && routerKey.allowedModelIds) {
            const allowedModels = routerKey.allowedModelIds as string[];
            const virtualKey = await createAgentKey(agentDid, allowedModels);
            await AgentDAO.updateLiteLLMKey(
              agentDid,
              virtualKey,
              allowedModels
            );
            logger.info(
              { agentDid, modelCount: allowedModels.length },
              "Auto-provisioned LiteLLM agent key"
            );
          }
        }
      } catch (err) {
        logger.warn(
          { agentDid, err: String(err) },
          "Failed to auto-provision LiteLLM agent key — skipping"
        );
      }
    }

    // Push any stored LLM config now that the agent is registered and connected.
    await this.pushStoredLlmConfig(agentDid);
    await this.pushSkillsConfig(agentDid);

    return true;
  }

  /**
   * Reject a pending registration. Closes the agent's connection.
   */
  async rejectRegistration(
    registrationId: string,
    reason: string = "Registration rejected"
  ): Promise<boolean> {
    let target: PendingConnection | undefined;
    for (const pending of this.pending.values()) {
      if (
        pending.registrationId === registrationId &&
        pending.phase === "awaiting_approval"
      ) {
        target = pending;
        break;
      }
    }

    // Get registration data from DB to get agent name (needed even if agent disconnected)
    const reg = await PendingRegistrationDAO.findById(registrationId);
    if (!reg) {
      logger.warn({ registrationId }, "Registration not found");
      return false;
    }

    // Remove from pending_registrations — activity_log keeps the rejection record
    await PendingRegistrationDAO.delete(registrationId);

    await ActivityLogDAO.log(
      "registration_rejected",
      undefined,
      reg.agentName,
      JSON.stringify({ registrationId, reason })
    );
    this.broadcastAdminUpdate("registration_rejected");

    // If agent is still connected, send rejection message and clean up connection
    if (target) {
      this.sendMessage(target.sender, {
        messageId: `reg-rejected-${Date.now()}`,
        type: "registration_rejected",
        payload: {
          registrationId,
          reason,
        } satisfies WSRegistrationRejectedPayload,
        timestamp: new Date().toISOString(),
      });

      clearTimeout(target.timer);
      target.sender.close();
      this.pending.delete(target.sender);
    }

    logger.info({ registrationId, reason }, "Registration rejected");
    return true;
  }

  /**
   * Update an agent's capabilities. If the agent is connected, send an
   * update_capabilities message so the agent re-authenticates and gets
   * a fresh certificate with the new capabilities.
   */
  async updateAgentCapabilities(
    agentDid: string,
    capabilities: AgentCapability[]
  ): Promise<boolean> {
    // Update in DB
    const existing = await AgentDAO.findByDid(agentDid);
    if (!existing) {
      logger.warn({ agentDid }, "Agent not found in DB for capability update");
      return false;
    }

    await AgentDAO.upsert({
      did: agentDid,
      name: existing.name,
      capabilities,
      certificateData: existing.certificateData ?? undefined,
    });

    await ActivityLogDAO.log(
      "capabilities_updated",
      agentDid,
      existing.name,
      JSON.stringify({ capabilities })
    );
    this.broadcastAdminUpdate("capabilities_updated");

    // If agent is connected, notify it to re-authenticate
    const connected = this.agents.get(agentDid);
    if (connected) {
      // Update in-memory capabilities
      connected.capabilities = capabilities;

      // Create a new auth session for re-auth
      const { sessionId } = await createAuthSession();

      // Move agent back to pending for re-auth
      const timer = setTimeout(() => {
        logger.warn(
          { agentDid },
          "Re-auth timeout after capability update — keeping old connection"
        );
        this.pending.delete(connected.sender);
      }, AUTH_TIMEOUT_MS);

      this.pending.set(connected.sender, {
        sender: connected.sender,
        sessionId,
        phase: "authenticating",
        agentName: connected.name,
        capabilities,
        timer,
      });

      // Send update_capabilities so agent knows to re-auth
      this.sendMessage(connected.sender, {
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
      this.sendMessage(connected.sender, {
        messageId: `auth-${Date.now()}`,
        type: "auth_challenge",
        payload: { sessionId, data: "" } satisfies WSAuthChallengePayload,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        { agentDid, capabilities },
        "Sent capability update + re-auth to agent"
      );
    } else {
      logger.info(
        { agentDid, capabilities },
        "Capabilities updated in DB (agent offline)"
      );
    }

    return true;
  }

  /**
   * Silently trigger a re-authentication on a connected agent so a new
   * certificate with correct capability metadata is issued.
   * Does NOT update the DB or emit admin broadcasts — purely an internal cert refresh.
   */
  private async triggerCertReissue(
    agent: ConnectedAgent,
    capabilities: AgentCapability[],
    policyMeta?: PolicyMeta
  ): Promise<void> {
    const { sessionId } = await createAuthSession();

    const timer = setTimeout(() => {
      logger.warn(
        { agentId: agent.id },
        "Cert re-issue re-auth timeout — keeping existing connection"
      );
      this.pending.delete(agent.sender);
    }, AUTH_TIMEOUT_MS);

    this.pending.set(agent.sender, {
      sender: agent.sender,
      sessionId,
      phase: "authenticating",
      agentName: agent.name,
      capabilities: capabilities,
      policyMeta,
      isCertReissue: true,
      timer,
    });

    // Tell the agent its new capabilities + governance limits (embedded natively in the payload).
    this.sendMessage(agent.sender, {
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
    this.sendMessage(agent.sender, {
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
  private async fetchActivePolicyMeta(
    agentDid: string
  ): Promise<PolicyMeta | undefined> {
    try {
      const policies = await PolicyDAO.list({
        agentDid,
        includeExpired: false,
      });
      if (policies.length === 0) return undefined;
      const p = policies[0];
      return {
        resourceLimits: p.resourceLimits as ResourceLimits,
        policyId: p.id,
        policyExpiresAt: p.expiresAt?.toISOString() ?? null,
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
  async applyPolicy(
    agentDid: string,
    capabilities: AgentCapability[],
    policyMeta?: PolicyMeta
  ): Promise<boolean> {
    // Always update the DB so the next reconnect picks up the correct capabilities.
    const knownAgent = await AgentDAO.findByDid(agentDid);
    if (!knownAgent) return false;

    await AgentDAO.upsert({
      did: agentDid,
      name: knownAgent.name,
      capabilities,
    });

    // Sync token budget columns if resource limits changed.
    if (policyMeta?.resourceLimits !== undefined) {
      await AgentDAO.updateBudget(agentDid, {
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

  getNetworkStats() {
    const agents = Array.from(this.agents.values());
    const pending = Array.from(this.pending.values());
    return {
      startedAt: this.startedAt.toISOString(),
      ws: {
        ...this.transportStats.ws,
        activeAgents: agents.filter((a) => a.transport === "ws").length,
        pendingConnections: pending.filter((p) => p.sender.transport === "ws")
          .length,
      },
      peerjs: {
        ...this.transportStats.peerjs,
        activeAgents: agents.filter((a) => a.transport === "peerjs").length,
        pendingConnections: pending.filter(
          (p) => p.sender.transport === "peerjs"
        ).length,
      },
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        transport: a.transport,
        connectedAt: a.connectedAt.toISOString(),
        lastHeartbeat: a.lastHeartbeat.toISOString(),
      })),
    };
  }

  disconnectAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.sender.isOpen()) {
      agent.sender.close(1000, "Agent deleted");
    }
  }

  async sendIntentToAgent(
    agentId: string,
    intentId: string,
    action: string,
    params: Record<string, any>,
    userDid?: string
  ): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.sender.isOpen()) {
      logger.warn({ agentId }, "Agent not connected");
      return false;
    }

    const tracer = trace.getTracer("vaultysclaw-control-plane");
    return tracer.startActiveSpan(
      "vc.intent.dispatch",
      {
        attributes: {
          "agent.did": agentId,
          "intent.id": intentId,
          "intent.action": action,
        },
      },
      async (span) => {
        // Inject W3C traceparent so the agent can create a child span
        const traceContext: Record<string, string> = {};
        propagation.inject(context.active(), traceContext);

        const signature = await signIntent(intentId, action, agentId);

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
            ...(Object.keys(traceContext).length > 0
              ? { _traceContext: traceContext }
              : {}),
          },
          timestamp: new Date().toISOString(),
          ...(signature ? { signature } : {}),
        };

        try {
          agent.sender.sendRaw(JSON.stringify(message));
          logger.info({ agentId, intentId, action }, "Intent sent to agent");
          try {
            await IntentDAO.log(intentId, agentId, action, params, signature);
          } catch {
            /* non-fatal */
          }
          span.end();
          return true;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();
          logger.error(error, "Failed to send intent to agent");
          return false;
        }
      }
    );
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
    onApprovalRequest?: (payload: WSToolApprovalRequestPayload) => void,
    opts?: { stream?: boolean; thinking?: boolean }
  ): boolean {
    const agent = this.agents.get(agentDid);
    if (!agent || !agent.sender.isOpen()) {
      return false;
    }

    this.chatCallbacks.set(conversationId, onChunk);
    if (onApprovalRequest) {
      this.chatApprovalCallbacks.set(conversationId, onApprovalRequest);
    }

    // Auto-cleanup after 5 minutes to prevent memory leaks
    setTimeout(() => {
      this.chatCallbacks.delete(conversationId);
      this.chatApprovalCallbacks.delete(conversationId);
    }, 5 * 60_000);

    this.sendMessage(agent.sender, {
      messageId: `chat-${Date.now()}`,
      type: "chat_message",
      agentId: agentDid,
      payload: {
        conversationId,
        messages,
        ...(opts?.stream ? { stream: true } : {}),
        ...(opts?.thinking ? { thinking: true } : {}),
      } satisfies WSChatMessagePayload,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      { agentDid, conversationId, messageCount: messages.length },
      "Chat message sent to agent"
    );
    return true;
  }

  async broadcastIntentToCapability(
    capability: string,
    intentId: string,
    action: string,
    params: Record<string, any>,
    userDid?: string
  ): Promise<string[]> {
    const recipientIds: string[] = [];

    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.capabilities.includes(capability)) {
        if (
          await this.sendIntentToAgent(
            agentId,
            intentId,
            action,
            params,
            userDid
          )
        ) {
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
  sendPolicyUpdate(
    _agentId: string,
    _policy: Record<string, unknown>
  ): boolean {
    logger.warn("sendPolicyUpdate is deprecated — use applyPolicy() instead");
    return false;
  }

  /** @deprecated Use applyPolicy() — policies are now enforced via cert reissue, not a separate message. */
  broadcastPolicyUpdate(_policy: Record<string, unknown>): string[] {
    logger.warn(
      "broadcastPolicyUpdate is deprecated — use applyPolicy() instead"
    );
    return [];
  }

  /**
   * Build and broadcast an admin state snapshot to all admin WS clients.
   */
  async broadcastAdminUpdate(event?: string): Promise<void> {
    const adminWss = getAdminWSS();
    if (!adminWss || adminWss.clients.size === 0) return;

    const connectedDids = new Set(
      Array.from(this.agents.values()).map((a) => a.id)
    );

    const dbAgents = await AgentDAO.findAll();
    const agents = dbAgents.map((agent) => {
      const connected = this.agents.get(agent.did);
      return {
        id: agent.did,
        name: connected?.name ?? agent.name,
        capabilities: agent.capabilities,
        registeredAt: agent.registeredAt,
        lastSeen: agent.lastSeen,
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

    const pendingRegs = (await PendingRegistrationDAO.findAll()).filter(
      (r: any) => r.status === "pending"
    );
    const regMeta = new Map<
      string,
      { connected: boolean; agentDid: string | null }
    >();
    for (const p of this.pending.values()) {
      if (p.registrationId && p.phase === "awaiting_approval") {
        regMeta.set(p.registrationId, {
          connected: true,
          agentDid: p.agentDid ?? null,
        });
      }
    }
    const registrations = pendingRegs.map((r: any) => ({
      ...r,
      connected: regMeta.get(r.id)?.connected ?? false,
      agentDid: regMeta.get(r.id)?.agentDid ?? null,
    }));

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
  async pushDelegationUpdate(agentDid: string): Promise<void> {
    const agent = this.agents.get(agentDid);
    if (!agent) return;

    const certs = await DelegationCertDAO.listByAgent(agentDid);
    const delegations: DelegationCertPayload[] = certs.map((c) => ({
      id: c.id,
      grantId: c.grantId,
      userDid: c.userDid,
      agentDid: c.agentDid,
      capabilities: c.capabilities as AgentCapability[],
      certificate: c.certificate,
      ...(c.expiresAt ? { expiresAt: c.expiresAt.toISOString() } : {}),
    }));

    this.sendMessage(agent.sender, {
      messageId: `delegation-${Date.now()}`,
      type: "delegation_update",
      agentId: agentDid,
      payload: { delegations } satisfies WSDelegationUpdatePayload,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      { agentDid, count: delegations.length },
      "Pushed delegation update to agent"
    );
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
  async sendLlmConfig(
    agentDid: string,
    config: LlmConfig | null
  ): Promise<boolean> {
    const agent = this.agents.get(agentDid);
    if (!agent) return false;

    this.sendMessage(agent.sender, {
      messageId: `llm-config-${Date.now()}`,
      type: "llm_config",
      agentId: agentDid,
      payload: { config } satisfies WSLlmConfigPayload,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      {
        agentDid,
        provider: config?.provider ?? null,
        model: config?.model ?? null,
      },
      config ? "LLM config pushed to agent" : "LLM config cleared for agent"
    );

    // Persist so the config is re-pushed on next reconnect
    await AgentDAO.setLlmConfig(agentDid, config);

    return true;
  }

  /**
   * Re-push effective LLM config to an agent that just (re-)connected.
   * Priority:
   *   1. Explicit llmConfig set manually by admin (stored on agent row)
   *   2. Per-agent LiteLLM virtual key (litellmVirtualKey on agent row)
   *   3. Workspace-level LiteLLM virtual key (WorkspaceRouterKey)
   * Called automatically after auth_complete for registered agents.
   */
  private async pushStoredLlmConfig(agentDid: string): Promise<void> {
    const row = await AgentDAO.findByDid(agentDid);
    if (!row) return;

    // Priority 1: manually configured llmConfig
    if (row.llmConfig) {
      try {
        const config = row.llmConfig as unknown as LlmConfig;
        await this.sendLlmConfig(agentDid, config);
        return;
      } catch {
        logger.warn(
          { agentDid },
          "Failed to parse stored LLM config — skipping push"
        );
      }
    }

    // Priority 2: per-agent LiteLLM virtual key
    const agentKey = row.litellmVirtualKey;
    if (agentKey && isLiteLLMConfigured()) {
      const allowedModels = (row.litellmAllowedModels as string[]) ?? [];
      const model = allowedModels[0] ?? "all-team-models";
      await this.sendLlmConfig(agentDid, {
        provider: "openai-compatible",
        baseUrl: getLiteLLMBaseUrl(),
        apiKey: agentKey,
        model,
      } as LlmConfig);
      return;
    }

    // Priority 3: workspace-level LiteLLM virtual key
    if (isLiteLLMConfigured()) {
      const agentWorkspaces = await AgentDAO.getWorkspaces(agentDid);
      const primary = agentWorkspaces.find((r) => r.isPrimary) ?? agentWorkspaces[0];
      if (primary) {
        const routerKey = await WorkspaceDAO.getRouterKey(primary.workspaceId);
        if (routerKey?.litellmVirtualKey) {
          const allowedModels = (routerKey.allowedModelIds as string[]) ?? [];
          const model = allowedModels[0] ?? "all-team-models";
          await this.sendLlmConfig(agentDid, {
            provider: "openai-compatible",
            baseUrl: getLiteLLMBaseUrl(),
            apiKey: routerKey.litellmVirtualKey,
            model,
          } as LlmConfig);
        }
      }
    }
  }

  /**
   * Push the effective skills configuration to a specific connected agent.
   * Called on reconnect, registration approval, and when workspace skills change.
   */
  async pushSkillsConfig(agentDid: string): Promise<void> {
    const agent = this.agents.get(agentDid);
    if (!agent) return;

    const skills = await SkillOverrideDAO.getEffectiveSkills(agentDid);
    // Only push if there are workspace-defined skills (empty = no workspace config = agent uses all local skills)
    this.sendMessage(agent.sender, {
      messageId: `skills-config-${Date.now()}`,
      type: "skills_config",
      agentId: agentDid,
      payload: { skills } satisfies WSSkillsConfigPayload,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      { agentDid, count: skills.length },
      "Pushed skills config to agent"
    );
  }

  /**
   * Register a callback for a workflow step result identified by intentId.
   * The callback is automatically removed after 30 seconds if not called.
   * Returns an unsubscribe function.
   */
  registerResultCallback(
    intentId: string,
    callback: (result: any) => void
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
    return agent !== undefined && agent.sender.isOpen();
  }

  /**
   * Dispatch a knowledge_sync intent to a specific agent.
   */
  sendKnowledgeSync(
    agentDid: string,
    messageId: string,
    payload: {
      sourceId: string;
      sourceName: string;
      sourceType: string;
      config: Record<string, unknown>;
      docling?: { url: string; sourceEndpoint?: string; fileEndpoint?: string };
      fileAttachments?: Array<{
        id: string;
        name: string;
        mimeType: string;
        size: number;
        content: string;
      }>;
    }
  ): void {
    const agent = this.agents.get(agentDid);
    if (!agent || !agent.sender.isOpen()) {
      logger.warn({ agentDid }, "sendKnowledgeSync: agent not connected");
      return;
    }
    this.sendMessage(agent.sender, {
      messageId,
      type: "knowledge_sync",
      agentId: agentDid,
      payload,
      timestamp: new Date().toISOString(),
    } as any);
    logger.info(
      { agentDid, messageId, sourceId: payload.sourceId },
      "Knowledge sync dispatched to agent"
    );
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
      pending.sender.close();
    }
    this.pending.clear();

    for (const agent of this.agents.values()) {
      agent.sender.close();
    }

    this.wss.close(() => {
      logger.info("Agent WebSocket server closed");
    });
    this.httpServer.close();
  }

  // ---- PeerJS transport bridge ----

  /**
   * Called by the PeerJS server when an agent connects via WebRTC.
   * Initiates the same auth challenge flow as a WebSocket connection.
   */
  async acceptPeerjsConnection(sender: AgentSender): Promise<void> {
    try {
      this.transportStats.peerjs.connectionsTotal++;
      this.appendLog(
        "peerjs",
        "info",
        "connected",
        "WebRTC data channel opened"
      );
      const { sessionId } = await createAuthSession();

      const timer = setTimeout(() => {
        logger.warn({ sessionId }, "PeerJS auth timeout — closing connection");
        this.sendMessage(sender, {
          messageId: `auth-fail-${Date.now()}`,
          type: "auth_failed",
          payload: {
            reason: "Authentication timeout",
          } satisfies WSAuthFailedPayload,
          timestamp: new Date().toISOString(),
        });
        sender.close();
        this.pending.delete(sender);
      }, AUTH_TIMEOUT_MS);

      this.pending.set(sender, {
        sender,
        sessionId,
        phase: "awaiting_register",
        timer,
      });

      this.sendMessage(sender, {
        messageId: `auth-${Date.now()}`,
        type: "auth_challenge",
        payload: { sessionId, data: "" } satisfies WSAuthChallengePayload,
        timestamp: new Date().toISOString(),
      });

      this.appendLog(
        "peerjs",
        "info",
        "auth_challenge_sent",
        `session ${sessionId.slice(0, 8)}`
      );
      logger.info(
        "PeerJS agent connection accepted — awaiting register or auth_challenge"
      );
    } catch (error) {
      this.appendLog("peerjs", "error", "accept_failed", String(error));
      logger.error(error, "Failed to accept PeerJS connection");
      sender.close();
    }
  }

  /**
   * Route a message received from a PeerJS-connected agent through
   * the same message handling pipeline as WebSocket messages.
   */
  routePeerjsMessage(sender: AgentSender, data: string): void {
    this.handleMessage(sender, data);
  }

  /**
   * Called by the PeerJS server when a PeerJS agent disconnects.
   */
  handlePeerjsDisconnect(sender: AgentSender): void {
    this.handleDisconnect(sender);
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
    logger.info(
      "Shutting down previous WS server instance (module re-evaluated)"
    );
    try {
      globalForWS.__wsServer.shutdown();
    } catch {
      /* best effort */
    }
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
export function initializeAdminWS(
  httpServer: import("node:http").Server
): void {
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
 * Push updated skills configuration to all agents in a workspace.
 * Called when workspace skill definitions are created, updated, or deleted.
 * Exported for use by API route handlers.
 */
export async function broadcastSkillsConfig(workspaceId: string): Promise<void> {
  const wsServer = getWSServer();
  if (!wsServer) return;

  const agents = await WorkspaceDAO.getAgents(workspaceId);
  for (const agent of agents) {
    wsServer.pushSkillsConfig(agent.agentDid);
  }
}
