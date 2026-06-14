/**
 * BaseAgentRuntime — abstract protocol layer for VaultysClaw agents.
 *
 * Handles WebSocket/WebRTC connection, VaultysId auth handshake, intent
 * routing, policy enforcement, peer catalog management, and delegation
 * verification.  Subclasses implement `executeIntent` and `executeChat`
 * to add LLM/tool execution on top.
 *
 * Emitted events (same contract as the original Agent class):
 *   status_changed  { status: AgentStatus }
 *   log             { level: 'info'|'warn'|'error'|'debug', message: string, data?: unknown }
 *   heartbeat       { uptime: number }
 *   intent_received { intentId: string; action: string; params: Record<string, unknown> }
 *   intent_result   { intentId: string; status: 'success'|'failed'; output?: unknown; error?: string }
 *   config_updated  { source: 'remote'|'env'; provider?: string; model?: string }
 */

import EventEmitter from "events";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { WebSocket } from "ws";
import { decode as msgpackDecode } from "@msgpack/msgpack";

// peerjs is CJS — ESM dynamic import() puts Peer inside mod["module.exports"],
// not as a named export. Load via createRequire so destructuring works and the
// module-level support-detection IIFE sees the polyfills set by the caller.
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PeerJS: { Peer: new (...args: any[]) => any } = _require("peerjs");

import { Challenger, VaultysId, crypto } from "@vaultys/id";
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
  type ExecutionResult,
  type AgentCapability,
  type LlmConfig,
  type WSAgentPeerCatalogPayload,
  type AgentPeerGrant,
  type WSSkillsConfigPayload,
  type ResourceLimits,
  type ChatMessageEntry,
} from "@vaultysclaw/shared";

type ChatErrorCode = "llm_unavailable" | "llm_error" | "agent_offline";
import { type AgentRuntimeConfig } from "./config.js";
import { PeerManager } from "./peer-manager.js";
import { verifyIntentMessage } from "./intent-verify.js";

const Buffer = crypto.Buffer;

// ---- Types ----

export type AgentStatus =
  | "initializing"
  | "connecting"
  | "pending_approval"
  | "connected"
  | "disconnected";

export interface LogEntry {
  ts: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: unknown;
}

export interface IntentEntry {
  intentId: string;
  action: string;
  params: Record<string, unknown>;
  status: "pending" | "success" | "failed";
  output?: unknown;
  error?: string;
  receivedAt: string;
  completedAt?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  version: string;
  status: AgentStatus;
  capabilities: AgentCapability[];
  uptime: number;
  lastHeartbeat: string | null;
  recentLogs: LogEntry[];
  recentIntents: IntentEntry[];
}

// ---- Ring buffer ----

class RingBuffer<T> {
  private buf: T[] = [];
  constructor(private readonly max: number) {}
  push(item: T): void {
    this.buf.push(item);
    if (this.buf.length > this.max) this.buf.shift();
  }
  toArray(): T[] {
    return [...this.buf];
  }
}

// ---- BaseAgentRuntime ----

export abstract class BaseAgentRuntime extends EventEmitter {
  protected config: AgentRuntimeConfig;

  // Identity
  protected vaultysId: VaultysId | null = null;

  // Connection
  protected ws: WebSocket | null = null;
  /** Active PeerJS DataConnection (when connecting via WebRTC instead of WebSocket). */
  protected peerjsConn: import("peerjs").DataConnection | null = null;
  /** Underlying PeerJS Peer instance (kept for cleanup on reconnect). */
  private peerjsPeer: import("peerjs").Peer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  protected stopped = false;
  /** Consecutive failed connection attempts — drives exponential backoff. */
  private reconnectAttempts = 0;

  // Status
  protected _status: AgentStatus = "initializing";
  protected id: string = "";
  protected capabilities: AgentCapability[] = [];
  private startedAt = Date.now();
  protected lastHeartbeat: Date | null = null;

  // Auth handshake state
  private authChallenger: Challenger | null = null;
  private authSessionId: string | null = null;
  private reAuthPending = false;

  // Server key (extracted after first auth for delegation verification)
  protected serverPublicKey: Buffer | null = null;

  // Peer-to-peer agent communication
  protected peerManager: PeerManager | null = null;
  protected peerCatalog: AgentPeerGrant[] = [];
  protected _peerListenerStarted = false;

  // Ring buffers
  protected logBuffer = new RingBuffer<LogEntry>(200);
  protected intentBuffer = new RingBuffer<IntentEntry>(100);

  // Token usage tracking (base layer tracks totals for heartbeat reporting)
  protected _tokenUsageSinceLastSync = { promptTokens: 0, completionTokens: 0 };
  protected _tokenUsageTotal = { promptTokens: 0, completionTokens: 0 };

  // Active policy enforcement (populated from cert metadata or update_capabilities)
  protected resourceLimits: ResourceLimits | null = null;
  protected policyId: string | null = null;
  protected policyExpiresAt: string | null = null;

  /** Rolling hourly request counter for maxRequestsPerHour enforcement. */
  protected _requestsThisHour = { count: 0, hourStart: 0 };

  constructor(config: AgentRuntimeConfig) {
    super();
    this.config = config;
    this.capabilities = config.requestedCapabilities;
  }

  // ---- Abstract methods (subclass must implement) ----

  abstract executeIntent(
    action: string,
    params: Record<string, unknown>,
    callerDid?: string,
    intentId?: string
  ): Promise<unknown>;

  abstract executeChat(
    messages: ChatMessageEntry[],
    conversationId: string,
    sendChunk: (
      chunk: string,
      done?: boolean,
      isError?: boolean,
      errorCode?: ChatErrorCode
    ) => void
  ): Promise<void>;

  // ---- Protected hooks (subclass can override) ----

  protected getDailyTokenUsageForBudget(): {
    promptTokens: number;
    completionTokens: number;
  } {
    return { promptTokens: 0, completionTokens: 0 };
  }

  protected async onAuthComplete(
    _payload: WSAuthCompletePayload
  ): Promise<void> {}

  protected async onDelegationUpdate(
    _payload: WSDelegationUpdatePayload
  ): Promise<void> {}

  protected async onPeerCatalogUpdated(
    _grants: AgentPeerGrant[]
  ): Promise<void> {}

  protected async onLlmConfig(_config: WSLlmConfigPayload): Promise<void> {}

  protected async onSkillsConfig(
    _payload: WSSkillsConfigPayload
  ): Promise<void> {}

  protected async onKnowledgeSources(_sources: unknown[]): Promise<void> {}

  protected async handleGetChatSessions(_msg: WSMessage): Promise<void> {}

  protected async handleGetChatHistory(_msg: WSMessage): Promise<void> {}

  protected async handleToolApprovalResponse(_msg: WSMessage): Promise<void> {}

  protected async handleTaskEnqueue(_msg: WSMessage): Promise<void> {}

  protected async handleScheduleUpdate(_msg: WSMessage): Promise<void> {}

  protected async handleScheduleDelete(_msg: WSMessage): Promise<void> {}

  protected async handleKnowledgeSync(_msg: WSMessage): Promise<void> {}

  // ---- Public API ----

  async start(): Promise<void> {
    this.log("info", `Initializing agent "${this.config.name}"`);

    this.vaultysId = await this.initVaultysId(this.config.vaultysIdPath);
    this.log("info", `VaultysId identity ready`, { did: this.vaultysId.did });

    // Initialize peer manager for agent-to-agent communication
    this.peerManager = new PeerManager(this.vaultysId);
    this.peerManager.onInvoke(async (remoteDid, action, params) => {
      return this.executeIntent(action, params, remoteDid);
    });

    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.peerjsConn) {
      this.peerjsConn.close();
      this.peerjsConn = null;
    }
    if (this.peerjsPeer) {
      this.peerjsPeer.destroy();
      this.peerjsPeer = null;
    }
    this.peerManager?.shutdown().catch(() => {});
    this.setStatus("disconnected");
  }

  getInfo(): AgentInfo {
    return {
      id: this.id,
      name: this.config.name,
      version: "0.0.1",
      status: this._status,
      capabilities: this.capabilities,
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      lastHeartbeat: this.lastHeartbeat?.toISOString() ?? null,
      recentLogs: this.logBuffer.toArray(),
      recentIntents: this.intentBuffer.toArray(),
    };
  }

  /**
   * Returns the agent's DID (stable identifier derived from its VaultysId).
   * Falls back to the control-plane-assigned id if VaultysId is not yet loaded.
   */
  getDid(): string {
    return this.vaultysId?.toVersion(1).did ?? this.id;
  }

  getStatus(): AgentStatus {
    return this._status;
  }

  /** Returns the current peer catalog (agents this agent has grants to talk to). */
  getPeerCatalog(): AgentPeerGrant[] {
    return [...this.peerCatalog];
  }

  /**
   * Invoke a peer agent via WebRTC.
   * Throws if the peer manager is not ready or the target is not in the catalog.
   */
  async invokePeer(
    targetDid: string,
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    if (!this.peerManager) throw new Error("Peer manager not initialised");
    return this.peerManager.invoke(targetDid, action, params);
  }

  getRecentLogs(limit = 200): LogEntry[] {
    return this.logBuffer.toArray().slice(-limit);
  }

  getRecentIntents(limit = 100): IntentEntry[] {
    return this.intentBuffer.toArray().slice(-limit);
  }

  // ---- Private helpers ----

  protected setStatus(s: AgentStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.emit("status_changed", { status: s });
  }

  protected log(
    level: LogEntry["level"],
    message: string,
    data?: unknown
  ): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      message,
      data,
    };
    this.logBuffer.push(entry);
    this.emit("log", entry);
  }

  protected async initVaultysId(identityPath: string): Promise<VaultysId> {
    const dir = path.dirname(identityPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(identityPath)) {
      this.log(
        "info",
        `Loading existing VaultysId identity from ${identityPath}`
      );
      const secret = fs.readFileSync(identityPath, "utf-8").trim();
      return VaultysId.fromSecret(secret, "base64").toVersion(1);
    }

    this.log("info", `Creating new VaultysId identity at ${identityPath}`);
    const vid = await VaultysId.generateMachine();
    fs.writeFileSync(
      identityPath,
      vid.toVersion(1).getSecret("base64"),
      "utf-8"
    );
    return vid.toVersion(1);
  }

  // ---- Transport connection ----

  protected connect(): void {
    if (this.stopped) return;
    if (this.config.peerjsControlPlaneId) {
      this.connectViaPeerjs();
    } else {
      this.connectViaWs();
    }
  }

  /**
   * Schedule a reconnect attempt with exponential backoff + ±20 % jitter.
   * Delay starts at 2 s and doubles each attempt, capped at 60 s.
   * Resets to 0 after a successful authentication.
   */
  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const base = Math.min(2_000 * 2 ** this.reconnectAttempts, 60_000);
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.round(base + jitter);
    this.reconnectAttempts++;
    this.log(
      "info",
      `Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts})`
    );
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private resetReconnectBackoff(): void {
    this.reconnectAttempts = 0;
  }

  private connectViaPeerjs(): void {
    if (this.stopped) return;

    const controlPlanePeerId = this.config.peerjsControlPlaneId!;
    this.log(
      "info",
      `Connecting to control plane via PeerJS: peer=${controlPlanePeerId}`
    );
    this.setStatus("connecting");

    this.authChallenger = null;
    this.authSessionId = null;
    this.reAuthPending = false;

    // Destroy old peer before creating a new one
    if (this.peerjsPeer) {
      this.peerjsPeer.destroy();
      this.peerjsPeer = null;
    }
    this.peerjsConn = null;

    // Parse optional custom signaling server
    const serverUrl = this.config.peerjsServerUrl;
    const peerOptions: import("peerjs").PeerOptions = serverUrl
      ? (() => {
          try {
            const parsed = new URL(serverUrl);
            return {
              host: parsed.hostname,
              port: parsed.port
                ? parseInt(parsed.port, 10)
                : parsed.protocol === "https:"
                  ? 443
                  : 80,
              path: parsed.pathname || "/",
              secure: parsed.protocol === "https:",
              debug: 1,
            };
          } catch {
            return { host: serverUrl, secure: true, debug: 1 };
          }
        })()
      : { host: "0.peerjs.com", port: 443, path: "/", secure: true, debug: 1 };

    // peerjs is required at module load (after polyfills) — construct directly.
    const { Peer } = PeerJS;
    const peer = new Peer(peerOptions);
    this.peerjsPeer = peer;

    peer.on("open", () => {
      if (this.stopped) {
        peer.destroy();
        return;
      }
      // Guard: a newer peer may have been created while this one was reconnecting.
      if (this.peerjsPeer !== peer) {
        peer.destroy();
        return;
      }
      this.log(
        "info",
        `PeerJS peer ready (id=${peer.id}) — connecting to control plane`
      );

      const conn = peer.connect(controlPlanePeerId, { reliable: true });
      this.peerjsConn = conn;

      conn.on("open", () => {
        this.log(
          "info",
          "PeerJS DataConnection open — awaiting auth challenge"
        );
      });

      conn.on("data", (raw: unknown) => {
        const data = typeof raw === "string" ? raw : JSON.stringify(raw);
        this.handleMessage(data);
      });

      conn.on("error", (err: unknown) => {
        if (this.stopped) return;
        if (this.peerjsConn !== conn) return; // stale
        this.log("error", "PeerJS connection error", err);
        // close event may not fire after a DataChannel error — schedule directly
        this.peerjsConn = null;
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        this.setStatus("disconnected");
        this.scheduleReconnect();
      });

      conn.on("close", () => {
        if (this.stopped) return;
        if (this.peerjsConn !== conn) return; // stale connection
        this.log("warn", "PeerJS connection closed");
        this.setStatus("disconnected");
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        this.peerjsConn = null;
        this.scheduleReconnect();
      });
    });

    peer.on("error", (err: unknown) => {
      if (this.stopped) return;
      if (this.peerjsPeer !== peer) return; // stale peer
      this.log("error", "PeerJS peer error", err);
      // Null out before destroy() for the same recursion reason as "disconnected".
      this.peerjsPeer = null;
      this.peerjsConn = null;
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      peer.destroy();
      this.setStatus("disconnected");
      this.scheduleReconnect();
    });

    peer.on("disconnected", () => {
      if (this.stopped) return;
      if (this.peerjsPeer !== peer) return; // stale peer — ignore
      // Don't use peer.reconnect(): if it fails silently, peerjs destroys the peer
      // with no error event, the event loop drains, and the process exits quietly.
      // Instead, destroy this peer and let our backoff loop create a fresh one.
      //
      // IMPORTANT: null out peerjsPeer BEFORE calling peer.destroy().
      // peer.destroy() → disconnect() emits "disconnected" synchronously, which
      // re-enters this handler. If peerjsPeer is still set at that point the guard
      // passes and scheduleReconnect() fires twice, double-incrementing the backoff.
      this.log(
        "warn",
        "PeerJS signaling server disconnected — scheduling reconnect"
      );
      this.peerjsPeer = null;
      this.peerjsConn = null;
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      peer.destroy(); // recursive "disconnected" now hits the stale-peer guard → no-op
      this.setStatus("disconnected");
      this.scheduleReconnect();
    });
  }

  // ---- WebSocket connection ----

  private connectViaWs(): void {
    if (this.stopped) return;

    const wsUrl = this.config.controlPlaneWsUrl ?? "ws://localhost:8080";
    this.log("info", `Connecting to control plane: ${wsUrl}`);
    this.setStatus("connecting");

    this.authChallenger = null;
    this.authSessionId = null;
    this.reAuthPending = false;

    let ws: WebSocket;
    try {
      // Capture socket reference locally so the onclose closure can detect if it
      // belongs to a stale socket that has been superseded by a newer connect() call.
      // When the server closes the OLD socket after the new one authenticates
      // ("replacing old connection"), that close event must not trigger yet another
      // reconnect — this.ws already points to the new socket at that point.
      ws = new WebSocket(wsUrl);
    } catch (err) {
      this.log("error", "Failed to create WebSocket (invalid URL?)", err);
      this.setStatus("disconnected");
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.onopen = () => {
      this.log("info", "Connected to control plane — awaiting auth challenge");
    };

    ws.onmessage = (event) => {
      this.handleMessage(event.data as string);
    };

    ws.onerror = (error) => {
      this.log("error", "WebSocket error", error);
    };

    ws.onclose = () => {
      if (this.stopped) return;
      // Guard: if this.ws has already moved to a newer socket, this close event
      // is from a superseded connection (e.g., the server closed our old socket
      // when a newer connection authenticated). Ignore it — the active socket is fine.
      if (this.ws !== ws) return;
      this.log("warn", "Disconnected from control plane");
      this.setStatus("disconnected");
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.scheduleReconnect();
    };
  }

  protected send(message: WSMessage): void {
    const data = JSON.stringify(message);

    if (this.peerjsConn) {
      if (!this.peerjsConn.open) {
        this.log("error", "PeerJS connection not open — cannot send message");
        return;
      }
      try {
        this.peerjsConn.send(data);
      } catch (err) {
        this.log("error", "Failed to send PeerJS message", err);
      }
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log("error", "WebSocket not open — cannot send message");
      return;
    }
    try {
      this.ws.send(data);
    } catch (err) {
      this.log("error", "Failed to send message", err);
    }
  }

  protected sendHeartbeat(): void {
    const daily = this.getDailyTokenUsageForBudget();

    const msg: WSMessage = {
      messageId: `heartbeat-${Date.now()}`,
      type: "heartbeat",
      agentId: this.id,
      payload: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        name: this.config.name,
        tokenUsage: {
          total: this._tokenUsageTotal,
          sinceLastSync: this._tokenUsageSinceLastSync,
          daily,
        },
      },
      timestamp: new Date().toISOString(),
    };
    this.send(msg);
    this.lastHeartbeat = new Date();

    // Reset the sync counter for next heartbeat
    this._tokenUsageSinceLastSync = { promptTokens: 0, completionTokens: 0 };

    this.emit("heartbeat", { uptime: process.uptime() });
  }

  protected sendResult(intentId: string, result: ExecutionResult): void {
    this.send({
      messageId: `result-${Date.now()}`,
      type: "result",
      agentId: this.id,
      payload: result,
      timestamp: new Date().toISOString(),
    });
  }

  protected sendAck(
    messageId: string,
    success: boolean,
    reason?: string
  ): void {
    this.send({
      messageId: `ack-${Date.now()}`,
      type: "intent_ack",
      agentId: this.id,
      payload: { messageId, success, reason },
      timestamp: new Date().toISOString(),
    });
  }

  // ---- Message routing ----

  protected handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);
      switch (message.type) {
        case "auth_challenge":
          this.handleAuthChallenge(message).catch((e) =>
            this.log("error", "handleAuthChallenge error", e)
          );
          break;
        case "auth_complete":
          this.handleAuthComplete(message).catch((e) =>
            this.log("error", "handleAuthComplete error", e)
          );
          break;
        case "auth_failed":
          this.handleAuthFailed(message);
          break;
        case "registration_pending":
          this.handleRegistrationPending(message);
          break;
        case "registration_approved":
          this.handleRegistrationApproved(message);
          break;
        case "registration_rejected":
          this.handleRegistrationRejected(message);
          break;
        case "update_capabilities":
          this.handleUpdateCapabilities(message);
          break;
        case "delegation_update":
          this.handleDelegationUpdateMsg(message);
          break;
        case "agent_peer_catalog":
          this.handleAgentPeerCatalog(message);
          break;
        case "llm_config":
          this.onLlmConfig(message.payload as WSLlmConfigPayload).catch((e) =>
            this.log("error", "onLlmConfig error", e)
          );
          break;
        case "skills_config":
          this.onSkillsConfig(
            message.payload as WSSkillsConfigPayload
          ).catch((e) => this.log("error", "onSkillsConfig error", e));
          break;
        case "tool_approval_response":
          this.handleToolApprovalResponse(message).catch((e) =>
            this.log("error", "handleToolApprovalResponse error", e)
          );
          break;
        case "task_enqueue":
          this.handleTaskEnqueue(message).catch((e) =>
            this.log("error", "handleTaskEnqueue error", e)
          );
          break;
        case "schedule_update":
          this.handleScheduleUpdate(message).catch((e) =>
            this.log("error", "handleScheduleUpdate error", e)
          );
          break;
        case "schedule_delete":
          this.handleScheduleDelete(message).catch((e) =>
            this.log("error", "handleScheduleDelete error", e)
          );
          break;
        case "intent":
          if (this._status !== "connected") {
            this.log("warn", "Received intent before auth — ignoring");
            return;
          }
          this.handleIntent(message);
          break;
        case "chat_message":
          if (this._status !== "connected") {
            this.log("warn", "Received chat_message before auth — ignoring");
            return;
          }
          this.handleChatMessageProtocol(message);
          break;
        case "get_chat_sessions":
          this.handleGetChatSessions(message).catch((e) =>
            this.log("error", "handleGetChatSessions error", e)
          );
          break;
        case "get_chat_history":
          this.handleGetChatHistory(message).catch((e) =>
            this.log("error", "handleGetChatHistory error", e)
          );
          break;
        case "policy_update":
          if (this._status !== "connected") {
            this.log("warn", "Received policy before auth — ignoring");
            return;
          }
          this.handlePolicyUpdate(message);
          break;
        case "knowledge_sync":
          this.handleKnowledgeSync(message).catch((e) =>
            this.log("error", "handleKnowledgeSync error", e)
          );
          break;
        case "pong":
          break;
        case "error":
          this.log("error", "Error from control plane", message.payload);
          break;
        default:
          this.log("warn", `Unknown message type: ${message.type}`);
      }
    } catch (err) {
      this.log("error", "Error handling message", err);
    }
  }

  // ---- Auth ----

  private async handleAuthChallenge(message: WSMessage): Promise<void> {
    const payload = message.payload as WSAuthChallengePayload;
    if (!this.vaultysId) return;

    try {
      if (!this.authChallenger && !payload.data && this.reAuthPending) {
        this.authSessionId = payload.sessionId;
        this.reAuthPending = false;
        this.startAuthHandshake();
      } else if (!this.authChallenger && !payload.data && !this.authSessionId) {
        this.authSessionId = payload.sessionId;
        this.send({
          messageId: `register-${Date.now()}`,
          type: "register",
          payload: { name: this.config.name, version: "0.0.1" },
          timestamp: new Date().toISOString(),
        });
        this.log("info", "Sent registration request");
      } else if (!this.authChallenger && !payload.data && this.authSessionId) {
        this.authSessionId = payload.sessionId;
        this.startAuthHandshake();
      } else if (this.authChallenger) {
        const serverCert = Buffer.from(payload.data, "base64");
        await this.authChallenger.update(serverCert);
        const cert = this.authChallenger.getCertificate();
        this.send({
          messageId: `auth-${Date.now()}`,
          type: "auth_challenge",
          payload: {
            sessionId: this.authSessionId,
            data: Buffer.from(cert).toString("base64"),
            name: this.config.name,
            capabilities: this.capabilities,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.log("error", "Error in auth challenge", err);
      this.authChallenger = null;
      this.authSessionId = null;
    }
  }

  private startAuthHandshake(): void {
    if (!this.vaultysId) return;
    this.authChallenger = new Challenger(this.vaultysId.toVersion(1));
    this.authChallenger.createChallenge("p2p", "auth");
    const cert = this.authChallenger.getCertificate();
    this.send({
      messageId: `auth-${Date.now()}`,
      type: "auth_challenge",
      payload: {
        sessionId: this.authSessionId,
        data: Buffer.from(cert).toString("base64"),
        name: this.config.name,
        capabilities: this.capabilities,
      },
      timestamp: new Date().toISOString(),
    });
    this.log("debug", "Sent initial auth challenge");
  }

  private async handleAuthComplete(message: WSMessage): Promise<void> {
    const payload = message.payload as WSAuthCompletePayload;

    this.id = payload.agentId;

    if (Array.isArray(payload.capabilities)) {
      this.capabilities = payload.capabilities as AgentCapability[];
    } else if (this.authChallenger) {
      try {
        const ctx = this.authChallenger.getContext();
        const metaCaps = ctx.metadata?.pk2?.capabilities;
        // Handle both native array (new certs) and legacy JSON-stringified string
        if (Array.isArray(metaCaps))
          this.capabilities = metaCaps as AgentCapability[];
        else if (typeof metaCaps === "string")
          this.capabilities = JSON.parse(metaCaps);
      } catch {
        /* keep existing */
      }
    }

    // Read policy governance metadata from cert (native types — no JSON.parse needed)
    if (this.authChallenger) {
      try {
        const ctx = this.authChallenger.getContext();
        const pk2 = ctx.metadata?.pk2;
        if (pk2) {
          this.resourceLimits =
            (pk2.resourceLimits as ResourceLimits | null | undefined) ?? null;
          this.policyId = (pk2.policyId as string | null | undefined) ?? null;
          this.policyExpiresAt =
            (pk2.policyExpiresAt as string | null | undefined) ?? null;
          if (this.resourceLimits || this.policyId) {
            this.log(
              "info",
              `Policy applied from cert — id: ${this.policyId ?? "none"}, limits: ${JSON.stringify(this.resourceLimits)}`
            );
          }
        }
      } catch {
        /* keep existing limits */
      }
    }

    this.authChallenger = null;
    this.authSessionId = null;
    this.reAuthPending = false;

    this.resetReconnectBackoff();
    this.setStatus("connected");
    this.log(
      "info",
      `Auth complete — agent id: ${this.id}, did: ${payload.did}`
    );

    // Start P2P listener (idempotent — only starts once)
    if (this.peerManager && !this._peerListenerStarted) {
      this._peerListenerStarted = true;
      this.peerManager.startListening().catch((err) => {
        this.log("warn", "Failed to start P2P listener", err);
      });
    }

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      // Send heartbeat over whichever transport is currently open.
      const wsOpen = this.ws?.readyState === WebSocket.OPEN;
      const pjOpen = !!this.peerjsConn?.open;
      if (wsOpen || pjOpen) this.sendHeartbeat();
    }, 30000);

    // Call the subclass hook for additional auth-complete processing
    await this.onAuthComplete(payload);
  }

  private handleAuthFailed(message: WSMessage): void {
    const payload = message.payload as WSAuthFailedPayload;
    this.log("error", `Auth failed: ${payload.reason}`);
    this.authChallenger = null;
    this.authSessionId = null;
    this.reAuthPending = false;
  }

  private handleRegistrationPending(message: WSMessage): void {
    const payload = message.payload as WSRegistrationPendingPayload;
    this.setStatus("pending_approval");
    this.log(
      "info",
      `Registration pending (id: ${payload.registrationId}): ${payload.message}`
    );
  }

  private handleRegistrationApproved(message: WSMessage): void {
    const payload = message.payload as WSRegistrationApprovedPayload;
    this.capabilities = payload.capabilities as AgentCapability[];
    this.log(
      "info",
      `Registration approved — capabilities: ${payload.capabilities.join(", ")}`
    );
  }

  private handleRegistrationRejected(message: WSMessage): void {
    const payload = message.payload as WSRegistrationRejectedPayload;
    this.log("error", `Registration rejected: ${payload.reason}`);
  }

  private handleUpdateCapabilities(message: WSMessage): void {
    const payload = message.payload as WSUpdateCapabilitiesPayload;
    this.capabilities = payload.capabilities as AgentCapability[];

    // Store incoming policy metadata so it is available after the re-auth cert is issued
    if (payload.resourceLimits !== undefined)
      this.resourceLimits = payload.resourceLimits ?? null;
    if (payload.policyId !== undefined)
      this.policyId = payload.policyId ?? null;
    if (payload.policyExpiresAt !== undefined)
      this.policyExpiresAt = payload.policyExpiresAt ?? null;

    this.authChallenger = null;
    this.authSessionId = null;
    this.reAuthPending = true;
    this.log(
      "info",
      `Capabilities updated: ${payload.capabilities.join(", ")} — re-auth pending`
    );
  }

  // ---- Intent handling ----

  private handleIntent(message: WSMessage): void {
    const { messageId, payload } = message;
    const { action, params, userDid } = payload as {
      action: string;
      params: Record<string, unknown>;
      userDid?: string;
    };

    // Verify the control-plane signature before doing anything
    if (!this.verifyIntentSignature(message)) {
      this.log(
        "error",
        `Rejected unsigned/invalid intent ${messageId} (${action})`
      );
      const result: ExecutionResult = {
        intentId: messageId,
        status: "failed",
        error: "Intent signature verification failed",
        executedAt: new Date(),
      };
      this.sendResult(messageId, result);
      this.sendAck(messageId, false, "Intent signature verification failed");
      return;
    }

    const entry: IntentEntry = {
      intentId: messageId,
      action,
      params,
      status: "pending",
      receivedAt: new Date().toISOString(),
    };
    this.intentBuffer.push(entry);
    this.emit("intent_received", { intentId: messageId, action, params });

    (async () => {
      try {
        this.log("info", `Intent received: ${action} (${messageId})`);

        // "agent" is the legacy name for "agent_communication"
        const effectiveAction =
          action === "agent" ? "agent_communication" : action;
        if (!this.capabilities.includes(effectiveAction as AgentCapability)) {
          throw new Error(`Capability '${action}' not granted`);
        }

        // ---- Policy enforcement ----

        // 1. Reject if the governing policy has expired
        if (this.policyExpiresAt) {
          const expiry = new Date(this.policyExpiresAt).getTime();
          if (!isNaN(expiry) && Date.now() > expiry) {
            throw new Error(
              `Policy '${this.policyId ?? "unknown"}' has expired — action blocked`
            );
          }
        }

        // 2. Reject if the daily token budget is exhausted
        if (this.resourceLimits?.maxTokensPerDay != null) {
          const daily = this.getDailyTokenUsageForBudget();
          const usedToday =
            (daily?.promptTokens ?? 0) + (daily?.completionTokens ?? 0);
          if (usedToday >= this.resourceLimits.maxTokensPerDay) {
            throw new Error(
              `Daily token budget exhausted (used ${usedToday} / limit ${this.resourceLimits.maxTokensPerDay})`
            );
          }
        }

        // 3. Reject if the hourly request rate is exceeded
        if (this.resourceLimits?.maxRequestsPerHour != null) {
          const now = Date.now();
          const hourMs = 60 * 60 * 1000;
          if (now - this._requestsThisHour.hourStart > hourMs) {
            // Roll over to a fresh window
            this._requestsThisHour = { count: 0, hourStart: now };
          }
          if (
            this._requestsThisHour.count >=
            this.resourceLimits.maxRequestsPerHour
          ) {
            const resetIn = Math.ceil(
              (this._requestsThisHour.hourStart + hourMs - now) / 1000
            );
            throw new Error(
              `Hourly request limit reached (${this.resourceLimits.maxRequestsPerHour} req/h) — resets in ${resetIn}s`
            );
          }
          this._requestsThisHour.count++;
        }

        if (userDid) {
          const ok = await this.verifyUserDelegation(
            userDid,
            effectiveAction
          );
          if (!ok)
            throw new Error(
              `User '${userDid}' has no valid delegation for '${action}'`
            );
          this.log("info", `Delegation verified for ${userDid}`);
        }

        const output = await this.executeIntent(
          action,
          params,
          userDid,
          messageId
        );

        entry.status = "success";
        entry.output = output;
        entry.completedAt = new Date().toISOString();

        const result: ExecutionResult = {
          intentId: messageId,
          status: "success",
          output,
          executedAt: new Date(),
        };
        this.sendResult(messageId, result);
        this.sendAck(messageId, true);
        this.emit("intent_result", {
          intentId: messageId,
          status: "success",
          output,
        });
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : String(error);
        entry.status = "failed";
        entry.error = errMsg;
        entry.completedAt = new Date().toISOString();

        const result: ExecutionResult = {
          intentId: messageId,
          status: "failed",
          error: errMsg,
          executedAt: new Date(),
        };
        this.sendResult(messageId, result);
        this.sendAck(messageId, false, errMsg);
        this.emit("intent_result", {
          intentId: messageId,
          status: "failed",
          error: errMsg,
        });
        this.log("error", `Intent ${messageId} failed: ${errMsg}`);
      }
    })();
  }

  // ---- Chat (streaming via WS) ----

  private handleChatMessageProtocol(message: WSMessage): void {
    const payload = message.payload as WSChatMessagePayload;
    const { conversationId, messages } = payload;

    this.log(
      "info",
      `Chat request ${conversationId} (${messages.length} messages)`
    );

    const sendChunk = (
      chunk: string,
      done?: boolean,
      isError?: boolean,
      errorCode?: ChatErrorCode
    ) => {
      if (isError) {
        this.send({
          messageId: `chat-resp-${Date.now()}`,
          type: "chat_response",
          agentId: this.id,
          payload: {
            conversationId,
            error: chunk,
            ...(errorCode ? { errorCode } : {}),
            done: true,
          } satisfies WSChatResponsePayload,
          timestamp: new Date().toISOString(),
        });
      } else if (done && !chunk) {
        this.send({
          messageId: `chat-resp-${Date.now()}`,
          type: "chat_response",
          agentId: this.id,
          payload: { conversationId, done: true } satisfies WSChatResponsePayload,
          timestamp: new Date().toISOString(),
        });
      } else {
        this.send({
          messageId: `chat-resp-${Date.now()}`,
          type: "chat_response",
          agentId: this.id,
          payload: {
            conversationId,
            chunk,
            ...(done ? { done: true } : {}),
          } satisfies WSChatResponsePayload,
          timestamp: new Date().toISOString(),
        });
      }
    };

    this.executeChat(messages, conversationId, sendChunk).catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log("error", `Chat ${conversationId} failed: ${errMsg}`);
      sendChunk(errMsg, true, true);
    });
  }

  // ---- Delegations ----

  private handleDelegationUpdateMsg(message: WSMessage): void {
    const payload = message.payload as WSDelegationUpdatePayload;
    this.onDelegationUpdate(payload).catch((e) =>
      this.log("error", "onDelegationUpdate error", e)
    );
  }

  private handleAgentPeerCatalog(message: WSMessage): void {
    try {
      const payload = message.payload as WSAgentPeerCatalogPayload;
      const peers = payload.peers ?? [];

      this.peerCatalog = peers;
      this.peerManager?.updatePeerCatalog(peers);

      this.log("info", `Peer catalog updated: ${peers.length} peer grant(s)`);

      this.onPeerCatalogUpdated(peers).catch((e) =>
        this.log("error", "onPeerCatalogUpdated error", e)
      );
    } catch (err) {
      this.log("error", "Error handling agent peer catalog", err);
    }
  }

  /**
   * Verify an intent message's ECDSA signature produced by the control plane.
   */
  private verifyIntentSignature(message: WSMessage): boolean {
    if (!this.serverPublicKey) {
      this.log(
        "warn",
        "Server public key unavailable — cannot verify intent signature"
      );
      return false;
    }
    const ok = verifyIntentMessage(message, this.serverPublicKey);
    if (!ok) {
      this.log(
        "warn",
        `Intent signature verification failed for ${message.messageId}`
      );
    }
    return ok;
  }

  protected async verifyUserDelegation(
    userDid: string,
    capability: string
  ): Promise<boolean> {
    if (!this.serverPublicKey) {
      this.log(
        "warn",
        "Server public key not available — cannot verify delegation"
      );
      return false;
    }

    // Base implementation: no delegations stored. Subclass overrides this if it has a DB.
    void userDid;
    void capability;
    return false;
  }

  // ---- Policy ----

  /**
   * @deprecated The `policy_update` message is superseded by the cert-reissue path.
   */
  private handlePolicyUpdate(message: WSMessage): void {
    const { messageId } = message;
    this.log(
      "warn",
      "Received deprecated policy_update message — policies are now enforced via cert reissue"
    );
    this.sendAck(messageId, true);
  }

  // ---- PeerJS server URL helper ----

  protected getPeerjsServerUrl(): string | null {
    return this.config.peerjsServer ?? null;
  }
}
