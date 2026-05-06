/**
 * Agent — EventEmitter-based agent controller class.
 *
 * Emitted events:
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
import { WebSocket } from "ws";
import { decode as msgpackDecode } from "@msgpack/msgpack";
import { Challenger, VaultysId, crypto } from "@vaultys/id";
import {
  initDb, storeCertificate,
  storeDelegation, clearAllDelegations,
  getAllDelegations, type DelegationRow,
  getLlmConfig, setLlmConfig,
  setEncryptedLlmConfigBlob, getEncryptedLlmConfigBlob,
  getPeerjsServer,
  getDb, getRecentTasks,
} from "./db";
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
  type ExecutionResult,
  type AgentCapability,
  type LlmConfig,
} from "@vaultysclaw/shared";
import { type AgentControllerConfig } from "./config";
import { runIntent, LlmNotConfiguredError, LlmProviderError, streamChat } from "./llm";
import { createToolRegistry, buildToolSet, type ToolRegistry, type ApprovalRequest } from "./tools";
import { SkillLoader, type SkillRegistry } from "./skills";
import { TaskQueue } from "./task-queue";
import { Scheduler } from "./scheduler";
import { MemoryStore, MemoryRetriever, ConversationSummarizer } from "./memory";
import type { MastraTool } from "@mastra/core/tools";

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
  activeLlmProvider?: string;
  activeLlmModel?: string;
  recentLogs: LogEntry[];
  recentIntents: IntentEntry[];
}

// ---- Ring buffer ----

class RingBuffer<T> {
  private buf: T[] = [];
  constructor(private readonly max: number) { }
  push(item: T): void {
    this.buf.push(item);
    if (this.buf.length > this.max) this.buf.shift();
  }
  toArray(): T[] {
    return [...this.buf];
  }
}

// ---- Agent class ----

export class Agent extends EventEmitter {
  private config: AgentControllerConfig;

  // Identity
  private vaultysId: VaultysId | null = null;

  // Connection
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  // Status
  private _status: AgentStatus = "initializing";
  private id: string = "";
  private capabilities: AgentCapability[] = [];
  private startedAt = Date.now();
  private lastHeartbeat: Date | null = null;

  // Auth handshake state
  private authChallenger: Challenger | null = null;
  private authSessionId: string | null = null;
  private reAuthPending = false;

  // Server key (extracted after first auth for delegation verification)
  private serverPublicKey: Buffer | null = null;

  // LLM
  private activeLlmConfig: LlmConfig | null = null;

  // Tool system
  private toolRegistry: ToolRegistry;
  private skillLoader: SkillLoader | null = null;
  private pendingApprovals = new Map<string, { resolve: (approved: boolean) => void; timer: ReturnType<typeof setTimeout> }>();
  private static readonly DEFAULT_APPROVAL_TIMEOUT_MS = 600_000; // 10 minutes

  // Task queue & scheduler
  private taskQueue: TaskQueue | null = null;
  private scheduler: Scheduler | null = null;

  // Memory system
  private memoryStore = new MemoryStore();
  private memoryRetriever = new MemoryRetriever(this.memoryStore);
  private memorySummarizer: ConversationSummarizer | null = null;

  // Ring buffers
  private logBuffer = new RingBuffer<LogEntry>(200);
  private intentBuffer = new RingBuffer<IntentEntry>(100);

  constructor(config: AgentControllerConfig) {
    super();
    this.config = config;
    this.capabilities = config.requestedCapabilities;
    // Initial tool registry (no skill tools yet — will be updated after skills load)
    this.toolRegistry = createToolRegistry({
      workspaceRoot: config.workspaceRoot ?? process.cwd(),
    });
  }

  // ---- Public API ----

  async start(): Promise<void> {
    this.log("info", `Initializing agent "${this.config.name}"`);

    this.vaultysId = await this.loadOrCreateIdentity(this.config.vaultysIdPath);
    this.log("info", `VaultysId identity ready`, { did: this.vaultysId.did });

    const dbDir = path.dirname(this.config.vaultysIdPath);
    initDb(dbDir);
    this.log("info", "Local database initialized");

    await this.refreshActiveLlmConfig();

    await this.loadSkills();

    this.initTaskQueue();

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
    this.taskQueue?.stop();
    this.scheduler?.stop();
    this.skillLoader?.stopWatch();
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
      activeLlmProvider: this.activeLlmConfig?.provider,
      activeLlmModel: this.activeLlmConfig?.model,
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

  /** Exposes the agent's VaultysId instance for P2P auth sessions. */
  getVaultysId(): VaultysId | null {
    return this.vaultysId?.toVersion(1) ?? null;
  }

  /** Returns the configured PeerJS relay server URL, or null for the public default.
   *  DB value (set by control plane) takes priority over the env/config value. */
  getPeerjsServer(): string | null {
    return getPeerjsServer() ?? this.config.peerjsServer ?? null;
  }

  /**
   * Returns the active LLM config with the apiKey masked for safe display.
   * The returned apiKey is either undefined (not set) or '***' (set but hidden).
   */
  getLlmConfigSafe(): (Omit<LlmConfig, "apiKey"> & { apiKey?: string; hasApiKey: boolean }) | null {
    if (!this.activeLlmConfig) return null;
    const { apiKey, ...rest } = this.activeLlmConfig;
    return { ...rest, apiKey: apiKey ? "***" : undefined, hasApiKey: !!apiKey };
  }

  /** Returns the active LLM config (with real apiKey) for direct LLM calls. */
  getActiveLlmConfig(): LlmConfig | null {
    return this.activeLlmConfig;
  }

  // ---- Data access for web dashboard ----

  /** Recent tasks from the persistent queue. */
  getRecentTasks(limit = 50): import("./db").TaskRow[] {
    try { return getRecentTasks(limit); } catch { return []; }
  }

  /** Active (and disabled) schedules. */
  getSchedules(): import("./db").ScheduleRow[] {
    try {
      return getDb().query("SELECT * FROM schedules ORDER BY created_at DESC").all() as import("./db").ScheduleRow[];
    } catch { return []; }
  }

  /** Loaded skill definitions. */
  getSkills(): Array<{ name: string; description: string; version: string; toolCount: number }> {
    if (!this.skillLoader) return [];
    try {
      return this.skillLoader.lastRegistry.skills.map((s) => ({
        name: s.name,
        description: s.description,
        version: s.version,
        toolCount: s.tools?.length ?? 0,
      }));
    } catch { return []; }
  }

  /** All registered tools (built-in + skill). */
  getToolList(): Array<{ name: string; capability: string; requiresApproval: boolean }> {
    return this.toolRegistry.tools.map((t) => ({
      name: t.name,
      capability: t.capability,
      requiresApproval: t.requiresApproval,
    }));
  }

  /** Recent tool usage log entries. */
  getToolLog(limit = 100): Array<{ tool_name: string; args: string; success: number; duration_ms: number; created_at: string }> {
    try {
      return getDb().query(
        "SELECT tool_name, args, success, duration_ms, created_at FROM tool_usage_log ORDER BY created_at DESC LIMIT $limit"
      ).all({ $limit: limit }) as any[];
    } catch { return []; }
  }

  /** Search or list memories. */
  getMemories(query?: string, limit = 20): import("./db").MemoryRow[] {
    if (query && query.trim()) {
      try { return this.memoryStore.search(query, limit); } catch { return []; }
    }
    try { return this.memoryStore.recent(undefined, limit); } catch { return []; }
  }

  /** Save a memory manually from the dashboard. */
  saveMemory(opts: import("./memory/store").SaveMemoryOptions): string {
    return this.memoryStore.save(opts);
  }

  /** Delete a memory by ID. */
  deleteMemory(id: string): void {
    this.memoryStore.delete(id);
  }

  /** Enqueue a task from the dashboard. */
  enqueueTask(action: string, params: Record<string, unknown> = {}, opts: import("./task-queue").EnqueueOptions = {}): string | null {
    if (!this.taskQueue) return null;
    return this.taskQueue.enqueue(action, params, opts);
  }

  /** Add or update a schedule from the dashboard. */
  upsertSchedule(s: import("./scheduler").ScheduleInput): void {
    if (!this.scheduler) return;
    this.scheduler.addSchedule(s);
  }

  /** Remove a schedule. */
  removeSchedule(id: string): void {
    if (!this.scheduler) return;
    this.scheduler.removeSchedule(id);
  }

  /** Get the capability-filtered Mastra tool map for use in the web dashboard chat. */
  getAgentToolSet(): Record<string, MastraTool> {
    return this.buildAgentToolSet();
  }

  /**
   * Update the LLM config from the dashboard (local edit). The API key is
   * encrypted at rest using the agent's VaultysId before writing to SQLite.
   * Pass null to clear the stored config and fall back to env-var values.
   */
  async updateLlmConfig(config: LlmConfig | null): Promise<void> {
    await this.persistEncryptedLlmConfig(config);
    const loaded = config ? await this.loadDecryptedLlmConfig() : null;
    this.activeLlmConfig = loaded ?? this.config.llmConfig;
    if (this.activeLlmConfig) {
      this.emit("config_updated", { source: "local", provider: this.activeLlmConfig.provider, model: this.activeLlmConfig.model });
    }
    this.log("info", config
      ? `LLM config updated locally: ${config.provider}/${config.model}`
      : "LLM config cleared — falling back to env config");
  }

  // ---- Private helpers ----

  private setStatus(s: AgentStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.emit("status_changed", { status: s });
  }

  private log(level: LogEntry["level"], message: string, data?: unknown): void {
    const entry: LogEntry = { ts: new Date().toISOString(), level, message, data };
    this.logBuffer.push(entry);
    this.emit("log", entry);
  }

  private async refreshActiveLlmConfig(): Promise<void> {
    // Prefer encrypted remote config; fall back to plaintext remote, then env vars.
    const remote = await this.loadDecryptedLlmConfig() ?? getLlmConfig();
    this.activeLlmConfig = remote ?? this.config.llmConfig;
    if (this.activeLlmConfig) {
      const source = remote ? "remote" : "env";
      this.log("info", `Active LLM config: ${this.activeLlmConfig.provider}/${this.activeLlmConfig.model} (${source})`);
      this.emit("config_updated", { source, provider: this.activeLlmConfig.provider, model: this.activeLlmConfig.model });
    } else {
      this.log("warn", "No LLM config — intents requiring LLM will fail");
    }
  }

  /**
   * Encrypt the apiKey field and persist the config blob.
   * Other fields are stored in plaintext. Pass null to clear.
   */
  private async persistEncryptedLlmConfig(config: LlmConfig | null): Promise<void> {
    if (config === null) {
      setLlmConfig(null); // clears both llm_config and llm_config_encrypted
      return;
    }
    const { apiKey, ...rest } = config;
    if (apiKey && this.vaultysId) {
      // Encrypt the apiKey for this agent's VaultysId only
      const encryptedApiKey = await VaultysId.encrypt(apiKey, [this.vaultysId.id]);
      const blob = JSON.stringify({ ...rest, encryptedApiKey, apiKeyEncrypted: true });
      setEncryptedLlmConfigBlob(blob);
    } else {
      // No apiKey to encrypt — store plaintext blob so loadDecryptedLlmConfig can read it
      setEncryptedLlmConfigBlob(JSON.stringify({ ...rest }));
    }
    // Also update the plaintext slot (apiKey omitted) so getLlmConfig() still works
    setLlmConfig({ ...rest, apiKey: undefined });
  }

  /**
   * Load and decrypt the persisted LLM config.
   * Returns null if no encrypted blob exists or decryption fails.
   */
  private async loadDecryptedLlmConfig(): Promise<LlmConfig | null> {
    const raw = getEncryptedLlmConfigBlob();
    if (!raw) return null;
    try {
      type Blob = LlmConfig & { encryptedApiKey?: string; apiKeyEncrypted?: boolean };
      const stored = JSON.parse(raw) as Blob;
      const { encryptedApiKey, apiKeyEncrypted, ...rest } = stored;
      if (encryptedApiKey && apiKeyEncrypted && this.vaultysId) {
        const decrypted = (await this.vaultysId.decrypt(encryptedApiKey)) as string;
        return { ...rest, apiKey: decrypted } as LlmConfig;
      }
      return rest as LlmConfig;
    } catch {
      return null;
    }
  }

  private async loadOrCreateIdentity(identityPath: string): Promise<VaultysId> {
    const dir = path.dirname(identityPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(identityPath)) {
      this.log("info", `Loading existing VaultysId identity from ${identityPath}`);
      const secret = fs.readFileSync(identityPath, "utf-8").trim();
      return VaultysId.fromSecret(secret, "base64").toVersion(1);
    }

    this.log("info", `Creating new VaultysId identity at ${identityPath}`);
    const vid = await VaultysId.generateMachine();
    fs.writeFileSync(identityPath, vid.toVersion(1).getSecret("base64"), "utf-8");
    return vid.toVersion(1);
  }

  // ---- WebSocket connection ----

  private connect(): void {
    if (this.stopped) return;

    const wsUrl = this.config.controlPlaneWsUrl;
    this.log("info", `Connecting to control plane: ${wsUrl}`);
    this.setStatus("connecting");

    this.authChallenger = null;
    this.authSessionId = null;
    this.reAuthPending = false;

    // Capture socket reference locally so the onclose closure can detect if it
    // belongs to a stale socket that has been superseded by a newer connect() call.
    // When the server closes the OLD socket after the new one authenticates
    // ("replacing old connection"), that close event must not trigger yet another
    // reconnect — this.ws already points to the new socket at that point.
    const ws = new WebSocket(wsUrl);
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
      this.log("warn", "Disconnected from control plane — reconnecting in 5s");
      this.setStatus("disconnected");
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
  }

  private send(message: WSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log("error", "WebSocket not open — cannot send message");
      return;
    }
    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      this.log("error", "Failed to send message", err);
    }
  }

  private sendHeartbeat(): void {
    const msg: WSMessage = {
      messageId: `heartbeat-${Date.now()}`,
      type: "heartbeat",
      agentId: this.id,
      payload: { uptime: process.uptime(), memory: process.memoryUsage() },
      timestamp: new Date().toISOString(),
    };
    this.send(msg);
    this.lastHeartbeat = new Date();
    this.emit("heartbeat", { uptime: process.uptime() });
  }

  private sendResult(intentId: string, result: ExecutionResult): void {
    this.send({
      messageId: `result-${Date.now()}`,
      type: "result",
      agentId: this.id,
      payload: result,
      timestamp: new Date().toISOString(),
    });
  }

  private sendAck(messageId: string, success: boolean, reason?: string): void {
    this.send({
      messageId: `ack-${Date.now()}`,
      type: "intent_ack",
      agentId: this.id,
      payload: { messageId, success, reason },
      timestamp: new Date().toISOString(),
    });
  }

  // ---- Message routing ----

  private handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);
      switch (message.type) {
        case "auth_challenge": this.handleAuthChallenge(message); break;
        case "auth_complete": this.handleAuthComplete(message); break;
        case "auth_failed": this.handleAuthFailed(message); break;
        case "registration_pending": this.handleRegistrationPending(message); break;
        case "registration_approved": this.handleRegistrationApproved(message); break;
        case "registration_rejected": this.handleRegistrationRejected(message); break;
        case "update_capabilities": this.handleUpdateCapabilities(message); break;
        case "delegation_update": this.handleDelegationUpdate(message); break;
        case "llm_config": this.handleLlmConfig(message); break;
        case "tool_approval_response": this.handleToolApprovalResponse(message); break;
        case "task_enqueue": this.handleTaskEnqueue(message); break;
        case "schedule_update": this.handleScheduleUpdate(message); break;
        case "schedule_delete": this.handleScheduleDelete(message); break;
        case "intent":
          if (this._status !== "connected") { this.log("warn", "Received intent before auth — ignoring"); return; }
          this.handleIntent(message);
          break;
        case "chat_message":
          if (this._status !== "connected") { this.log("warn", "Received chat_message before auth — ignoring"); return; }
          this.handleChatMessage(message);
          break;
        case "policy_update":
          if (this._status !== "connected") { this.log("warn", "Received policy before auth — ignoring"); return; }
          this.handlePolicyUpdate(message);
          break;
        case "pong": break;
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

  private handleAuthComplete(message: WSMessage): void {
    const payload = message.payload as WSAuthCompletePayload;

    this.id = payload.agentId;

    if (payload.capabilities && payload.capabilities.length > 0) {
      this.capabilities = payload.capabilities as AgentCapability[];
    } else if (this.authChallenger) {
      try {
        const ctx = this.authChallenger.getContext();
        const metaCaps = ctx.metadata?.pk2?.capabilities;
        if (metaCaps) this.capabilities = JSON.parse(metaCaps);
      } catch { /* keep existing */ }
    }

    if (this.authChallenger) {
      try {
        const cert = this.authChallenger.getCertificate();
        storeCertificate(Buffer.from(cert).toString("base64"), this.capabilities as string[], payload.did);
      } catch (err) {
        this.log("warn", "Failed to store certificate", err);
      }
    }

    this.authChallenger = null;
    this.authSessionId = null;
    this.reAuthPending = false;

    this.setStatus("connected");
    this.log("info", `Auth complete — agent id: ${this.id}, did: ${payload.did}`);

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.sendHeartbeat();
    }, 30000);
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
    this.log("info", `Registration pending (id: ${payload.registrationId}): ${payload.message}`);
  }

  private handleRegistrationApproved(message: WSMessage): void {
    const payload = message.payload as WSRegistrationApprovedPayload;
    this.capabilities = payload.capabilities as AgentCapability[];
    this.log("info", `Registration approved — capabilities: ${payload.capabilities.join(", ")}`);
  }

  private handleRegistrationRejected(message: WSMessage): void {
    const payload = message.payload as WSRegistrationRejectedPayload;
    this.log("error", `Registration rejected: ${payload.reason}`);
  }

  private handleUpdateCapabilities(message: WSMessage): void {
    const payload = message.payload as WSUpdateCapabilitiesPayload;
    this.capabilities = payload.capabilities as AgentCapability[];
    this.authChallenger = null;
    this.authSessionId = null;
    this.reAuthPending = true;
    this.log("info", `Capabilities updated: ${payload.capabilities.join(", ")} — re-auth pending`);
  }

  // ---- Intent handling ----

  private async handleIntent(message: WSMessage): Promise<void> {
    const { messageId, payload } = message;
    const { action, params, userDid } = payload as { action: string; params: Record<string, unknown>; userDid?: string };

    const entry: IntentEntry = {
      intentId: messageId,
      action,
      params,
      status: "pending",
      receivedAt: new Date().toISOString(),
    };
    this.intentBuffer.push(entry);
    this.emit("intent_received", { intentId: messageId, action, params });

    try {
      this.log("info", `Intent received: ${action} (${messageId})`);

      if (!this.capabilities.includes(action as AgentCapability)) {
        throw new Error(`Capability '${action}' not granted`);
      }

      if (userDid) {
        const ok = await this.verifyUserDelegation(userDid, action);
        if (!ok) throw new Error(`User '${userDid}' has no valid delegation for '${action}'`);
        this.log("info", `Delegation verified for ${userDid}`);
      }

      const output = await this.executeAction(action, params);

      entry.status = "success";
      entry.output = output;
      entry.completedAt = new Date().toISOString();

      const result: ExecutionResult = { intentId: messageId, status: "success", output, executedAt: new Date() };
      this.sendResult(messageId, result);
      this.sendAck(messageId, true);
      this.emit("intent_result", { intentId: messageId, status: "success", output });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      entry.status = "failed";
      entry.error = errMsg;
      entry.completedAt = new Date().toISOString();

      const result: ExecutionResult = { intentId: messageId, status: "failed", error: errMsg, executedAt: new Date() };
      this.sendResult(messageId, result);
      this.sendAck(messageId, false, errMsg);
      this.emit("intent_result", { intentId: messageId, status: "failed", error: errMsg });
      this.log("error", `Intent ${messageId} failed: ${errMsg}`);
    }
  }

  private async executeAction(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.activeLlmConfig) throw new LlmNotConfiguredError();
    const tools = this.buildAgentToolSet();
    const queryText = `${action} ${JSON.stringify(params)}`;
    const memoryContext = this.memoryRetriever.retrieve(queryText) || undefined;
    const { text, usage } = await runIntent(this.activeLlmConfig, action, params, tools, memoryContext);
    return { text, usage };
  }

  // ---- Tool system ----

  /**
   * Build a Mastra tool map filtered by the agent's granted capabilities.
   * When no capabilities are assigned (local/standalone mode), all tools are available.
   * Tools requiring approval will send a WS request and wait for admin response.
   */
  private buildAgentToolSet(conversationId?: string): Record<string, MastraTool> {
    // If no capabilities assigned (standalone mode), grant all tools
    const caps = this.capabilities.length > 0
      ? this.capabilities
      : this.toolRegistry.tools.map((t) => t.capability);
    const ts = buildToolSet(this.toolRegistry, caps, (request) => {
      return this.requestToolApproval(request, conversationId);
    });
    this.log("debug", `buildAgentToolSet: caps=${JSON.stringify([...new Set(caps)])}, tools=${Object.keys(ts).join(",")}`);
    return ts;
  }

  /**
   * Send a tool approval request to the control plane and wait for the response.
   */
  private requestToolApproval(request: ApprovalRequest, conversationId?: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timeoutMs = this.config.approvalTimeoutMs ?? Agent.DEFAULT_APPROVAL_TIMEOUT_MS;
      // Set up timeout — auto-reject after timeoutMs
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(request.requestId);
        this.log("warn", `Tool approval timed out: ${request.toolName} (${request.requestId})`);
        resolve(false);
      }, timeoutMs);

      this.pendingApprovals.set(request.requestId, { resolve, timer });

      // Send approval request to control plane
      this.send({
        messageId: request.requestId,
        type: "tool_approval_request",
        agentId: this.id,
        payload: {
          requestId: request.requestId,
          conversationId,
          toolName: request.toolName,
          args: request.args,
          agentId: this.id,
        } satisfies WSToolApprovalRequestPayload,
        timestamp: new Date().toISOString(),
      });

      this.log("info", `Tool approval requested: ${request.toolName} (${request.requestId})`);
    });
  }

  /**
   * Handle an approval response from the control plane.
   */
  private handleToolApprovalResponse(message: WSMessage): void {
    const payload = message.payload as WSToolApprovalResponsePayload;
    const pending = this.pendingApprovals.get(payload.requestId);
    if (!pending) {
      this.log("warn", `Received approval response for unknown request: ${payload.requestId}`);
      return;
    }

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(payload.requestId);

    this.log("info", `Tool approval ${payload.approved ? "granted" : "rejected"}: ${payload.requestId}${payload.reason ? ` (${payload.reason})` : ""}`);
    pending.resolve(payload.approved);
  }

  // ---- Skill system ----

  /**
   * Load skills from the configured skills directory and rebuild the tool registry.
   * Called once on start and whenever skills are hot-reloaded.
   */
  private async loadSkills(): Promise<void> {
    const defaultSkillsDir = path.join(
      process.env.HOME ?? process.cwd(),
      ".vaultysclaw",
      "skills",
    );
    const skillsDir = this.config.skillsDir ?? defaultSkillsDir;

    this.skillLoader = new SkillLoader({ skillsDir });
    const skillRegistry = await this.skillLoader.load();

    this.rebuildToolRegistry(skillRegistry);
    this.log("info", `Skills loaded: ${skillRegistry.skills.map((s) => s.name).join(", ") || "(none)"}`);

    if (this.config.watchSkills) {
      this.skillLoader.startWatch((newRegistry) => {
        this.rebuildToolRegistry(newRegistry);
        this.log("info", `Skills hot-reloaded: ${newRegistry.skills.map((s) => s.name).join(", ") || "(none)"}`);
      });
    }
  }

  /** Rebuild the tool registry from built-in tools + skill tools. */
  private rebuildToolRegistry(skillRegistry: SkillRegistry): void {
    this.toolRegistry = createToolRegistry({
      workspaceRoot: this.config.workspaceRoot ?? process.cwd(),
      extraTools: skillRegistry.getAllTools(),
    });
  }

  // ---- Task queue & scheduler ----

  private initTaskQueue(): void {
    // The executor runs `executeAction` which already uses the tool registry
    this.taskQueue = new TaskQueue(
      async (action, params) => {
        return this.executeAction(action, params);
      },
      {
        onTaskUpdate: (task) => {
          this.emit("task_update", task);
          this.log("info", `Task ${task.id} → ${task.status}${task.error ? `: ${task.error}` : ""}`);
        },
      },
    );

    this.scheduler = new Scheduler();
    this.taskQueue.start();
    this.scheduler.start(this.taskQueue);
    this.log("info", "Task queue and scheduler started");
  }

  private handleTaskEnqueue(message: WSMessage): void {
    if (!this.taskQueue) return;

    const p = message.payload as import("@vaultysclaw/shared").WSTaskEnqueuePayload;
    const taskId = this.taskQueue.enqueue(
      p.action,
      p.params ?? {},
      {
        priority: p.priority,
        scheduledAt: p.scheduledAt,
        maxRetries: p.maxRetries,
        createdBy: p.createdBy,
      },
    );

    this.log("info", `Task enqueued via WS: ${taskId} (${p.action})`);

    this.send({
      messageId: `task-ack-${Date.now()}`,
      type: "task_status",
      payload: {
        taskId,
        status: "pending",
        action: p.action,
        retryCount: 0,
      } satisfies import("@vaultysclaw/shared").WSTaskStatusPayload,
      timestamp: new Date().toISOString(),
    });
  }

  private handleScheduleUpdate(message: WSMessage): void {
    if (!this.scheduler) return;

    const p = message.payload as import("@vaultysclaw/shared").WSScheduleUpdatePayload;
    this.scheduler.addSchedule({
      id: p.id,
      name: p.name,
      cron: p.cron,
      action: p.action,
      params: p.params,
      enabled: p.enabled,
    });
    this.log("info", `Schedule updated: ${p.id} (${p.cron} → ${p.action})`);
  }

  private handleScheduleDelete(message: WSMessage): void {
    if (!this.scheduler) return;

    const p = message.payload as import("@vaultysclaw/shared").WSScheduleDeletePayload;
    this.scheduler.removeSchedule(p.id);
    this.log("info", `Schedule deleted: ${p.id}`);
  }

  // ---- Chat (streaming via WS) ----

  private async handleChatMessage(message: WSMessage): Promise<void> {
    const payload = message.payload as WSChatMessagePayload;
    const { conversationId, messages } = payload;

    this.log("info", `Chat request ${conversationId} (${messages.length} messages)`);

    if (!this.activeLlmConfig) {
      this.send({
        messageId: `chat-resp-${Date.now()}`,
        type: "chat_response",
        agentId: this.id,
        payload: { conversationId, error: "LLM not configured", done: true } satisfies WSChatResponsePayload,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      // Retrieve relevant memories for context
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const memoryContext = lastUserMsg ? this.memoryRetriever.retrieve(lastUserMsg) : undefined;

      const tools = this.buildAgentToolSet(conversationId);
      const result = streamChat(this.activeLlmConfig, messages, tools, (event) => {
        // Report tool executions to control plane for real-time UI
        if (event.toolCalls && event.toolCalls.length > 0) {
          for (const tc of event.toolCalls) {
            const toolResult = event.toolResults?.find((r: any) => r.toolCallId === tc.toolCallId);
            this.send({
              messageId: `tool-exec-${Date.now()}`,
              type: "tool_execution",
              agentId: this.id,
              payload: {
                conversationId,
                toolName: tc.toolName,
                args: tc.args,
                result: toolResult?.result,
                durationMs: 0,
              } satisfies WSToolExecutionPayload,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }, memoryContext);

      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
        this.send({
          messageId: `chat-resp-${Date.now()}`,
          type: "chat_response",
          agentId: this.id,
          payload: { conversationId, chunk } satisfies WSChatResponsePayload,
          timestamp: new Date().toISOString(),
        });
      }
      this.send({
        messageId: `chat-resp-${Date.now()}`,
        type: "chat_response",
        agentId: this.id,
        payload: { conversationId, done: true } satisfies WSChatResponsePayload,
        timestamp: new Date().toISOString(),
      });

      // Async post-processing: summarize the conversation to extract memories
      if (this.activeLlmConfig && messages.length >= 4) {
        const assistantResponse = chunks.join("");
        const fullHistory = [
          ...messages,
          { role: "assistant" as const, content: assistantResponse },
        ];
        const config = this.activeLlmConfig;
        setImmediate(() => {
          if (!this.memorySummarizer) {
            this.memorySummarizer = new ConversationSummarizer(this.memoryStore);
          }
          this.memorySummarizer
            .summarize(fullHistory, config, [`conversation:${conversationId}`])
            .catch((err) => this.log("warn", "Memory summarization failed", err));
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log("error", `Chat ${conversationId} failed: ${errMsg}`);
      this.send({
        messageId: `chat-resp-${Date.now()}`,
        type: "chat_response",
        agentId: this.id,
        payload: { conversationId, error: errMsg, done: true } satisfies WSChatResponsePayload,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ---- LLM config ----

  private handleLlmConfig(message: WSMessage): void {
    const payload = message.payload as WSLlmConfigPayload;
    // Encrypt apiKey and persist; then refresh runtime config asynchronously
    this.persistEncryptedLlmConfig(payload.config).then(() => this.refreshActiveLlmConfig()).catch((err) => {
      this.log("error", "Failed to persist remote LLM config", err);
    });
    if (payload.config === null) {
      this.log("info", "Remote LLM config cleared — falling back to env config");
    } else {
      this.log("info", `Remote LLM config received: ${payload.config.provider}/${payload.config.model}`);
    }
  }

  // ---- Delegations ----

  private handleDelegationUpdate(message: WSMessage): void {
    try {
      const payload = message.payload as WSDelegationUpdatePayload;
      const delegations = payload.delegations ?? [];

      if (delegations.length === 0) {
        clearAllDelegations();
        this.log("info", "All delegations cleared");
        return;
      }

      for (const d of delegations) {
        storeDelegation({
          id: d.id,
          grant_id: d.grantId,
          user_did: d.userDid,
          agent_did: d.agentDid,
          capabilities: JSON.stringify(d.capabilities),
          certificate: d.certificate,
          expires_at: d.expiresAt ?? null,
        });
      }
      this.log("info", `Delegation update: ${delegations.length} cert(s) stored`);
    } catch (err) {
      this.log("error", "Error handling delegation update", err);
    }
  }

  private async verifyUserDelegation(userDid: string, capability: string): Promise<boolean> {
    if (!this.serverPublicKey) {
      this.log("warn", "Server public key not available — cannot verify delegation");
      return false;
    }

    const rows = getAllDelegations().filter((r) => r.user_did === userDid);

    for (const row of rows) {
      if (row.expires_at && new Date(row.expires_at) < new Date()) continue;
      try {
        const combined = Buffer.from(row.certificate, "base64");
        if (combined.length < 5) continue;
        const bodyLen = combined.readUInt32LE(0);
        if (combined.length < 4 + bodyLen) continue;
        const body = combined.subarray(4, 4 + bodyLen);
        const signature = combined.subarray(4 + bodyLen);

        const serverVid = VaultysId.fromId(this.serverPublicKey);
        const valid = serverVid.verifyChallenge(Buffer.from(body), Buffer.from(signature), false);
        if (!valid) continue;

        const p = msgpackDecode(body) as {
          type: string; userDid: string; agentDid: string;
          capabilities: string[]; expiresAt?: number;
        };
        if (p.type !== "delegation") continue;
        if (p.expiresAt && p.expiresAt < Date.now()) continue;
        if (p.agentDid !== this.id && p.agentDid !== "*") continue;
        if (!p.capabilities.includes(capability)) continue;
        return true;
      } catch { continue; }
    }
    return false;
  }

  // ---- Policy ----

  private handlePolicyUpdate(message: WSMessage): void {
    try {
      const { messageId, payload } = message;
      this.log("info", `Policy update received: ${payload.id}`);
      this.sendAck(messageId, true);
    } catch (err) {
      this.log("error", "Error handling policy update", err);
    }
  }
}
