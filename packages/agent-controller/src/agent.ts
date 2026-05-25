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
  upsertChatSession, appendChatMessages,
  listChatSessions, getChatMessages, deleteChatSession,
  storePeerGrants, getAllPeerGrants, type PeerGrantRow,
  recordTokenUsage,
  getDailyTokenUsage,
  getMonthlyTokenUsage,
  listKnowledgeSources,
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
  type WSGetChatSessionsPayload,
  type WSChatSessionsResponsePayload,
  type WSGetChatHistoryPayload,
  type WSChatHistoryResponsePayload,
  type ExecutionResult,
  type AgentCapability,
  type LlmConfig,
  type WSAgentPeerCatalogPayload,
  type AgentPeerGrant,
  type WSSkillsConfigPayload,
  type SkillConfig,
  type ResourceLimits,
} from "@vaultysclaw/shared";
import { type AgentControllerConfig } from "./config";
import { runIntent, LlmNotConfiguredError, LlmProviderError, streamChat } from "./llm";
import { createToolRegistry, buildToolSet, type ToolRegistry, type ApprovalRequest } from "./tools";
import { buildRemoteAgentTools } from "./tools/remote-agent-tools";
import { PeerManager } from "./peer-manager";
import { SkillLoader, type SkillRegistry } from "./skills";
import { TaskQueue } from "./task-queue";
import { Scheduler } from "./scheduler";
import { MemoryStore, MemoryRetriever, ConversationSummarizer } from "./memory";
import type { MastraTool } from "@mastra/core/tools";
import { ingestSource, buildKnowledgeTool } from "./knowledge";
import type { KnowledgeSourceConfig } from "./knowledge";

const Buffer = crypto.Buffer;

// ---- LLM error classification ----

function classifyLlmError(err: unknown): "llm_unavailable" | "llm_error" {
  if (!(err instanceof Error)) return "llm_error";
  // AI SDK APICallError with ECONNREFUSED / network cause
  const cause = (err as any).cause;
  if (cause?.code === "ECONNREFUSED") return "llm_unavailable";
  if (cause?.constructor?.name === "AggregateError") return "llm_unavailable";
  // Mastra re-throws as a retryable APICallError
  if ((err as any)[Symbol.for("vercel.ai.error.AI_APICallError")] === true && (err as any).isRetryable) {
    if (err.message.includes("Cannot connect") || err.message.includes("ECONNREFUSED")) return "llm_unavailable";
  }
  // Wrapped in LlmProviderError
  if (err.name === "LlmProviderError") return classifyLlmError((err as any).providerCause);
  // Fallback string check
  if (err.message.includes("ECONNREFUSED") || err.message.includes("Cannot connect to API")) return "llm_unavailable";
  return "llm_error";
}

// ---- Zod schema serialization (for web dashboard display) ----

function serializeZodField(field: any): Record<string, unknown> {
  if (!field?._def) return { type: "any", optional: false };
  const def = field._def;
  const typeName: string = def.typeName ?? "";

  if (typeName === "ZodOptional") {
    return { ...serializeZodField(def.innerType), optional: true };
  }
  if (typeName === "ZodNullable") {
    return { ...serializeZodField(def.innerType), nullable: true };
  }

  const base: Record<string, unknown> = { optional: false };
  if (def.description) base.description = def.description;

  switch (typeName) {
    case "ZodString": return { ...base, type: "string" };
    case "ZodNumber": return { ...base, type: "number" };
    case "ZodBoolean": return { ...base, type: "boolean" };
    case "ZodArray": return { ...base, type: "array", items: serializeZodField(def.type) };
    case "ZodObject": return { ...base, type: "object", properties: serializeZodSchema(field) };
    case "ZodEnum": return { ...base, type: "enum", enum: def.values };
    case "ZodLiteral": return { ...base, type: "literal", value: def.value };
    case "ZodUnion": return { ...base, type: "union", options: (def.options as any[]).map(serializeZodField) };
    default: return { ...base, type: typeName.replace("Zod", "").toLowerCase() };
  }
}

function serializeZodSchema(schema: any): Record<string, unknown> | undefined {
  if (!schema?._def) return undefined;
  try {
    if (schema._def.typeName === "ZodObject") {
      const shape = typeof schema._def.shape === "function" ? schema._def.shape() : schema._def.shape;
      if (!shape) return undefined;
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) {
        result[key] = serializeZodField(value);
      }
      return result;
    }
  } catch { /* ignore */ }
  return undefined;
}

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
  /** Skill filter pushed by the control plane. null = no filter (use all local skills). */
  private realmSkillFilter: SkillConfig[] | null = null;
  private pendingApprovals = new Map<string, { resolve: (approved: boolean) => void; timer: ReturnType<typeof setTimeout> }>();
  private _pendingApprovalsMeta: Array<{ requestId: string; toolName: string; args: Record<string, unknown>; conversationId?: string; requestedAt: string }> = [];
  private static readonly DEFAULT_APPROVAL_TIMEOUT_MS = 600_000; // 10 minutes

  // Task queue & scheduler
  private taskQueue: TaskQueue | null = null;
  private scheduler: Scheduler | null = null;

  // Peer-to-peer agent communication
  private peerManager: PeerManager | null = null;
  private peerCatalog: AgentPeerGrant[] = [];
  private _peerListenerStarted = false;

  // Memory system
  private memoryStore = new MemoryStore();
  private memoryRetriever = new MemoryRetriever(this.memoryStore);
  private memorySummarizer: ConversationSummarizer | null = null;

  // Ring buffers
  private logBuffer = new RingBuffer<LogEntry>(200);
  private intentBuffer = new RingBuffer<IntentEntry>(100);

  // Token usage tracking
  private _tokenUsageSinceLastSync = { promptTokens: 0, completionTokens: 0 };
  private _tokenUsageTotal = { promptTokens: 0, completionTokens: 0 };

  // Active policy enforcement (populated from cert metadata or update_capabilities)
  private resourceLimits: ResourceLimits | null = null;
  private policyId: string | null = null;
  private policyExpiresAt: string | null = null;
  /** Rolling hourly request counter for maxRequestsPerHour enforcement. */
  private _requestsThisHour = { count: 0, hourStart: 0 };

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

    // Database is stored in the parent directory of .vaultys/
    const dbDir = path.dirname(path.dirname(this.config.vaultysIdPath));
    initDb(dbDir, "agent.db");
    this.log("info", "Local database initialized");

    await this.refreshActiveLlmConfig();

    await this.loadSkills();

    this.initTaskQueue();

    // Initialize peer manager for agent-to-agent communication
    this.peerManager = new PeerManager(this.vaultysId);
    this.peerManager.onInvoke(async (remoteDid, action, params) => {
      return this.executeAction(action, params, remoteDid);
    });
    // Restore peer catalog from local DB (populated on next auth_complete)
    const storedGrants = getAllPeerGrants();
    if (storedGrants.length > 0) {
      this.peerCatalog = storedGrants.map((g) => ({
        id: g.id,
        sourceDid: g.source_did,
        targetDid: g.target_did,
        targetName: g.target_name,
        skillDescription: g.skill_description,
        capabilities: JSON.parse(g.capabilities) as string[],
        certificate: g.certificate,
        ...(g.expires_at ? { expiresAt: g.expires_at } : {}),
      }));
      this.peerManager.updatePeerCatalog(this.peerCatalog);
    }

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
    this.peerManager?.shutdown().catch(() => { });
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

  /** Loaded skill definitions with tool schemas for the web dashboard. */
  getSkills(): Array<{ name: string; description: string; version: string; toolCount: number; systemPromptExtension?: string; enabled: boolean; isRequired: boolean; realmManaged: boolean; tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }> {
    if (!this.skillLoader) return [];
    try {
      const filterMap = this.realmSkillFilter
        ? new Map(this.realmSkillFilter.map((s) => [s.name, s]))
        : null;

      return this.skillLoader.lastRegistry.skills.map((s) => {
        const filterEntry = filterMap?.get(s.name);
        return {
          name: s.name,
          description: s.description,
          version: s.version,
          toolCount: s.tools?.length ?? 0,
          systemPromptExtension: s.systemPromptExtension,
          enabled: filterEntry ? filterEntry.enabled : true,
          isRequired: filterEntry?.isRequired ?? false,
          realmManaged: !!filterEntry,
          tools: (s.tools ?? []).map((t) => ({
            name: t.name,
            description: (t.tool as any).description as string | undefined,
            inputSchema: serializeZodSchema((t.tool as any).inputSchema),
          })),
        };
      });
    } catch { return []; }
  }

  /** All registered tools (built-in + skill) with descriptions and input schemas. */
  getToolList(): Array<{ name: string; capability: string; requiresApproval: boolean; description?: string; inputSchema?: Record<string, unknown> }> {
    return this.toolRegistry.tools.map((t) => ({
      name: t.name,
      capability: t.capability,
      requiresApproval: t.requiresApproval,
      description: (t.tool as any).description as string | undefined,
      inputSchema: serializeZodSchema((t.tool as any).inputSchema),
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

  /**
   * Toggle a skill on or off from the web dashboard.
   * Realm-managed skills (pushed by the control plane) cannot be changed locally.
   */
  toggleSkillEnabled(skillName: string, enabled: boolean): void {
    if (!this.skillLoader) return;
    const skill = this.skillLoader.lastRegistry.skills.find((s) => s.name === skillName);
    if (!skill) throw new Error(`Unknown skill: ${skillName}`);

    // Realm-managed skills are controlled by the control plane, not locally.
    if (this.realmSkillFilter) {
      const entry = this.realmSkillFilter.find((s) => s.name === skillName);
      if (entry?.isRequired) throw new Error(`Skill "${skillName}" is required by the realm and cannot be disabled`);
    }

    // Update or create a local filter entry
    if (!this.realmSkillFilter) this.realmSkillFilter = [];
    const existing = this.realmSkillFilter.find((s) => s.name === skillName);
    if (existing) {
      existing.enabled = enabled;
    } else {
      this.realmSkillFilter.push({ name: skillName, enabled, isRequired: false });
    }

    this.rebuildToolRegistry(this.skillLoader.lastRegistry);
    this.log("info", `Skill "${skillName}" ${enabled ? "enabled" : "disabled"} by dashboard user`);
  }

  /** List currently pending tool-approval requests. */
  getPendingApprovals(): Array<{ requestId: string; toolName: string; args: Record<string, unknown>; conversationId?: string; requestedAt: string }> {
    return this._pendingApprovalsMeta;
  }

  /** Resolve a pending tool-approval request from the web dashboard. */
  resolveApproval(requestId: string, approved: boolean): void {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) throw new Error(`No pending approval with id: ${requestId}`);
    clearTimeout(pending.timer);
    this.pendingApprovals.delete(requestId);
    this._pendingApprovalsMeta = this._pendingApprovalsMeta.filter((m) => m.requestId !== requestId);
    this.log("info", `Tool approval ${approved ? "granted" : "rejected"} by dashboard user: ${requestId}`);
    pending.resolve(approved);
  }

  /** Get the capability-filtered Mastra tool map for use in the web dashboard chat. */
  getAgentToolSet(): Record<string, MastraTool> {
    return this.buildAgentToolSet();
  }

  /**
   * Tool set for the web dashboard chat — auto-approves all tools since the
   * web user is already authenticated as admin.
   */
  getWebChatToolSet(): Record<string, MastraTool> {
    const caps = this.capabilities.length > 0
      ? this.capabilities
      : this.toolRegistry.tools.map((t) => t.capability);
    return buildToolSet(this.toolRegistry, caps, async (request) => {
      this.log("info", `Web dashboard tool auto-approved: ${request.toolName}`);
      return true;
    });
  }

  /**
   * Invoke a single tool by name with the given args.
   * Used by the web dashboard for direct tool testing.
   */
  async invokeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const def = this.toolRegistry.get(toolName);
    if (!def) throw new Error(`Unknown tool: ${toolName}`);
    if (!def.tool.execute) throw new Error(`Tool ${toolName} has no execute function`);
    const start = Date.now();
    try {
      const result = await def.tool.execute(args as any, {} as any);
      this.log("info", `Tool invoked from dashboard: ${toolName} (${Date.now() - start}ms)`);
      return result;
    } catch (err) {
      throw new Error(`Tool ${toolName} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
    // Calculate price spent based on token usage and pricing
    const calculatePrice = (): number => {
      if (!this.activeLlmConfig) return 0;
      const dailyUsage = getDailyTokenUsage();
      const inputPricePerToken = (this.activeLlmConfig.pricePerMillionInputTokens ?? 0) / 1_000_000;
      const outputPricePerToken = (this.activeLlmConfig.pricePerMillionOutputTokens ?? 0) / 1_000_000;
      return (dailyUsage.promptTokens * inputPricePerToken) + (dailyUsage.completionTokens * outputPricePerToken);
    };

    const dailyUsage = getDailyTokenUsage();
    const monthlyUsage = getMonthlyTokenUsage();

    const msg: WSMessage = {
      messageId: `heartbeat-${Date.now()}`,
      type: "heartbeat",
      agentId: this.id,
      payload: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        activeLlm: this.activeLlmConfig
          ? { provider: this.activeLlmConfig.provider, model: this.activeLlmConfig.model }
          : undefined,
        name: this.config.name,
        tokenUsage: {
          total: this._tokenUsageTotal,
          sinceLastSync: this._tokenUsageSinceLastSync,
          daily: dailyUsage,
          monthly: monthlyUsage,
          dailyPriceSpent: calculatePrice(),
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
        case "auth_complete": this.handleAuthComplete(message).catch((e) => this.log("error", "handleAuthComplete error", e)); break;
        case "auth_failed": this.handleAuthFailed(message); break;
        case "registration_pending": this.handleRegistrationPending(message); break;
        case "registration_approved": this.handleRegistrationApproved(message); break;
        case "registration_rejected": this.handleRegistrationRejected(message); break;
        case "update_capabilities": this.handleUpdateCapabilities(message); break;
        case "delegation_update": this.handleDelegationUpdate(message); break;
        case "agent_peer_catalog": this.handleAgentPeerCatalog(message); break;
        case "llm_config": this.handleLlmConfig(message); break;
        case "skills_config": this.handleSkillsConfig(message); break;
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
        case "get_chat_sessions":
          this.handleGetChatSessions(message);
          break;
        case "get_chat_history":
          this.handleGetChatHistory(message);
          break;
        case "policy_update":
          if (this._status !== "connected") { this.log("warn", "Received policy before auth — ignoring"); return; }
          this.handlePolicyUpdate(message);
          break;
        case "knowledge_sync":
          this.handleKnowledgeSync(message).catch((e) => this.log('error', 'handleKnowledgeSync error', e));
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

  private async handleAuthComplete(message: WSMessage): Promise<void> {
    const payload = message.payload as WSAuthCompletePayload;

    this.id = payload.agentId;

    if (payload.capabilities && payload.capabilities.length > 0) {
      this.capabilities = payload.capabilities as AgentCapability[];
    } else if (this.authChallenger) {
      try {
        const ctx = this.authChallenger.getContext();
        const metaCaps = ctx.metadata?.pk2?.capabilities;
        // Handle both native array (new certs) and legacy JSON-stringified string
        if (Array.isArray(metaCaps)) this.capabilities = metaCaps as AgentCapability[];
        else if (typeof metaCaps === "string") this.capabilities = JSON.parse(metaCaps);
      } catch { /* keep existing */ }
    }

    // Read policy governance metadata from cert (native types — no JSON.parse needed)
    if (this.authChallenger) {
      try {
        const ctx = this.authChallenger.getContext();
        const pk2 = ctx.metadata?.pk2;
        if (pk2) {
          this.resourceLimits = (pk2.resourceLimits as ResourceLimits | null | undefined) ?? null;
          this.policyId = (pk2.policyId as string | null | undefined) ?? null;
          this.policyExpiresAt = (pk2.policyExpiresAt as string | null | undefined) ?? null;
          if (this.resourceLimits || this.policyId) {
            this.log("info", `Policy applied from cert — id: ${this.policyId ?? "none"}, limits: ${JSON.stringify(this.resourceLimits)}`);
          }
        }
      } catch { /* keep existing limits */ }
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

    // Extract server public key from the certificate so peer grant certs can be verified offline.
    // The server's key is in pk1 of the completed Challenger certificate context.
    if (!this.serverPublicKey) {
      try {
        const latestCert = getDb().query("SELECT certificate_data FROM certificates ORDER BY id DESC LIMIT 1").get() as { certificate_data: string } | undefined;
        if (latestCert?.certificate_data) {
          const certBuf = Buffer.from(latestCert.certificate_data, "base64");
          const deserialized = Challenger.deserializeCertificate(certBuf);
          if (deserialized?.pk1) {
            const pk = Buffer.from(deserialized.pk1 as Uint8Array) as unknown as Buffer;
            this.serverPublicKey = pk;
            this.peerManager?.setServerPublicKey(deserialized.pk1 as Uint8Array);
          }
        }
      } catch (err) {
        this.log("warn", "Could not extract server public key from certificate", err);
      }
    }

    // Start P2P listener (idempotent — only starts once)
    if (this.peerManager && !this._peerListenerStarted) {
      this._peerListenerStarted = true;
      this.peerManager.startListening().catch((err) => {
        this.log("warn", "Failed to start P2P listener", err);
      });
    }

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.sendHeartbeat();
    }, 30000);

    // Push current knowledge source statuses so the control-plane can reconcile
    // any sources stuck in 'syncing' (e.g. after a server restart mid-sync).
    try {
      const sources = listKnowledgeSources();
      if (sources.length > 0) {
        this.send({
          messageId: `ks-status-${Date.now()}`,
          type: 'knowledge_status_sync',
          agentId: this.id,
          payload: {
            sources: sources.map(s => ({
              sourceId: s.id,
              status: s.status,
              docCount: s.doc_count,
              chunkCount: s.chunk_count,
              error: s.error ?? null,
            })),
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.log('warn', 'Could not push knowledge status on connect', err);
    }
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

    // Store incoming policy metadata so it is available after the re-auth cert is issued
    if (payload.resourceLimits !== undefined) this.resourceLimits = payload.resourceLimits ?? null;
    if (payload.policyId !== undefined) this.policyId = payload.policyId ?? null;
    if (payload.policyExpiresAt !== undefined) this.policyExpiresAt = payload.policyExpiresAt ?? null;

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

      // "agent" is the legacy name for "agent_communication"
      const effectiveAction = action === "agent" ? "agent_communication" : action;
      if (!this.capabilities.includes(effectiveAction as AgentCapability)) {
        throw new Error(`Capability '${action}' not granted`);
      }

      // ---- Policy enforcement ----

      // 1. Reject if the governing policy has expired
      if (this.policyExpiresAt) {
        const expiry = new Date(this.policyExpiresAt).getTime();
        if (!isNaN(expiry) && Date.now() > expiry) {
          throw new Error(`Policy '${this.policyId ?? "unknown"}' has expired — action blocked`);
        }
      }

      // 2. Reject if the daily token budget is exhausted
      if (this.resourceLimits?.maxTokensPerDay != null) {
        const daily = getDailyTokenUsage();
        const usedToday = (daily?.promptTokens ?? 0) + (daily?.completionTokens ?? 0);
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
        if (this._requestsThisHour.count >= this.resourceLimits.maxRequestsPerHour) {
          const resetIn = Math.ceil((this._requestsThisHour.hourStart + hourMs - now) / 1000);
          throw new Error(
            `Hourly request limit reached (${this.resourceLimits.maxRequestsPerHour} req/h) — resets in ${resetIn}s`
          );
        }
        this._requestsThisHour.count++;
      }

      if (userDid) {
        const ok = await this.verifyUserDelegation(userDid, effectiveAction);
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

  private async executeAction(action: string, params: Record<string, unknown>, _callerDid?: string): Promise<unknown> {
    if (!this.activeLlmConfig) throw new LlmNotConfiguredError();
    const tools = this.buildAgentToolSet();
    const queryText = `${action} ${JSON.stringify(params)}`;
    const memoryContext = this.memoryRetriever.retrieve(queryText) || undefined;
    const skillExtensions = this.realmSkillFilter
      ?.filter((s) => s.enabled && s.content)
      .map((s) => s.content as string);
    const { text, usage } = await runIntent(this.activeLlmConfig, action, params, tools, memoryContext, skillExtensions);

    // Record token usage to local DB and update counters
    if (usage) {
      this.emit('log', { level: 'info', message: 'Recording token usage from intent', data: { usage, provider: this.activeLlmConfig.provider, model: this.activeLlmConfig.model } });
      recordTokenUsage(usage.promptTokens, usage.completionTokens, this.activeLlmConfig.provider, this.activeLlmConfig.model);
      this._tokenUsageSinceLastSync.promptTokens += usage.promptTokens;
      this._tokenUsageSinceLastSync.completionTokens += usage.completionTokens;
      this._tokenUsageTotal.promptTokens += usage.promptTokens;
      this._tokenUsageTotal.completionTokens += usage.completionTokens;
    }

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

    const ts = buildToolSet(this.toolRegistry, caps as AgentCapability[], (request) => {
      return this.requestToolApproval(request, conversationId);
    });

    // Append remote agent tools from the peer catalog directly to the tool map
    if (this.peerCatalog.length > 0 && this.peerManager) {
      const remoteTools = buildRemoteAgentTools(this.peerCatalog, this.peerManager);
      for (const def of remoteTools) {
        ts[def.name] = def.tool as MastraTool;
      }
    }

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
        this._pendingApprovalsMeta = this._pendingApprovalsMeta.filter((m) => m.requestId !== request.requestId);
        this.log("warn", `Tool approval timed out: ${request.toolName} (${request.requestId})`);
        resolve(false);
      }, timeoutMs);

      this.pendingApprovals.set(request.requestId, { resolve, timer });

      const meta = {
        requestId: request.requestId,
        toolName: request.toolName,
        args: request.args,
        conversationId,
        requestedAt: new Date().toISOString(),
      };
      this._pendingApprovalsMeta.push(meta);
      this.emit("tool_approval_request", meta);

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
    this._pendingApprovalsMeta = this._pendingApprovalsMeta.filter((m) => m.requestId !== payload.requestId);

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

  /** Rebuild the tool registry from built-in tools + skill tools, applying realm skill filter. */
  private rebuildToolRegistry(skillRegistry: SkillRegistry): void {
    let extraTools = skillRegistry.getAllTools();

    if (this.realmSkillFilter !== null) {
      const filterMap = new Map(this.realmSkillFilter.map((s) => [s.name, s.enabled]));
      // Filter at skill level — collect tools only from enabled skills
      extraTools = skillRegistry.skills
        .filter((skill) => {
          const enabled = filterMap.get(skill.name);
          // Skill not referenced in filter → treat as enabled (not realm-managed)
          return enabled !== false;
        })
        .flatMap((skill) => skill.tools);
    }

    // Add knowledge_search tool — requires 'knowledge_search' capability to be granted
    const knowledgeTool = buildKnowledgeTool(() => this.activeLlmConfig);
    const knowledgeToolDef: import("./tools/types").AgentToolDefinition = {
      capability: 'knowledge_search' as import("@vaultysclaw/shared").AgentCapability,
      name: 'knowledge_search',
      requiresApproval: false,
      tool: knowledgeTool,
    };

    this.toolRegistry = createToolRegistry({
      workspaceRoot: this.config.workspaceRoot ?? process.cwd(),
      extraTools: [...extraTools, knowledgeToolDef],
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

    // Persist session + only new incoming messages (avoid duplicating history on each turn)
    const title = messages.find((m) => m.role === "user")?.content.slice(0, 80) ?? null;
    try {
      upsertChatSession(conversationId, title, "control_plane");
      const existingCount = getChatMessages(conversationId).length;
      const newMessages = messages.slice(existingCount);
      if (newMessages.length > 0) {
        appendChatMessages(conversationId, newMessages.map((m) => ({ role: m.role, content: m.content })));
      }
    } catch { /* non-fatal */ }

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
      }, memoryContext, this.realmSkillFilter?.filter((s) => s.enabled && s.content).map((s) => s.content as string));

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

      // Record token usage from streaming
      try {
        const usage = await result.usage;
        if (usage && this.activeLlmConfig) {
          this.emit('log', { level: 'info', message: 'Recording token usage from chat stream', data: { usage, provider: this.activeLlmConfig.provider, model: this.activeLlmConfig.model } });
          recordTokenUsage(usage.promptTokens, usage.completionTokens, this.activeLlmConfig.provider, this.activeLlmConfig.model);
          this._tokenUsageSinceLastSync.promptTokens += usage.promptTokens;
          this._tokenUsageSinceLastSync.completionTokens += usage.completionTokens;
          this._tokenUsageTotal.promptTokens += usage.promptTokens;
          this._tokenUsageTotal.completionTokens += usage.completionTokens;
        } else {
          this.emit('log', { level: 'warn', message: 'No usage data from chat stream', data: { usage, hasConfig: !!this.activeLlmConfig } });
        }
      } catch (e) {
        this.emit('log', { level: 'warn', message: 'Failed to record token usage from stream', data: { error: String(e) } });
      }

      // Persist assistant response
      try {
        appendChatMessages(conversationId, [{ role: "assistant", content: chunks.join("") }]);
      } catch { /* non-fatal */ }

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
      const errorCode = classifyLlmError(err);
      const errMsg = errorCode === "llm_unavailable"
        ? `LLM provider not reachable (${this.activeLlmConfig?.baseUrl ?? this.activeLlmConfig?.provider ?? "unknown"}). Check the agent's LLM configuration.`
        : (err instanceof Error ? err.message : String(err));
      this.log("error", `Chat ${conversationId} failed [${errorCode}]: ${errMsg}`);
      this.send({
        messageId: `chat-resp-${Date.now()}`,
        type: "chat_response",
        agentId: this.id,
        payload: { conversationId, error: errMsg, errorCode, done: true } satisfies WSChatResponsePayload,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ---- Chat session queries (from control plane) ----

  private handleGetChatSessions(message: WSMessage): void {
    const payload = (message.payload ?? {}) as WSGetChatSessionsPayload;
    const limit = payload.limit ?? 50;
    try {
      const rows = listChatSessions(limit);
      const sessions: WSChatSessionsResponsePayload["sessions"] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        source: r.source,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        messageCount: (r.message_count as number | undefined) ?? 0,
      }));
      this.send({
        messageId: `chat-sessions-${Date.now()}`,
        type: "chat_sessions_response",
        agentId: this.id,
        payload: { sessions } satisfies WSChatSessionsResponsePayload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.log("warn", "Failed to list chat sessions", err);
    }
  }

  private handleGetChatHistory(message: WSMessage): void {
    const payload = message.payload as WSGetChatHistoryPayload;
    const { sessionId } = payload;
    try {
      const rows = getChatMessages(sessionId);
      const messages: WSChatHistoryResponsePayload["messages"] = rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
        createdAt: r.created_at,
      }));
      this.send({
        messageId: `chat-history-${Date.now()}`,
        type: "chat_history_response",
        agentId: this.id,
        payload: { sessionId, messages } satisfies WSChatHistoryResponsePayload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.log("warn", "Failed to get chat history", err);
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

  // ---- Realm skills config ----

  private handleSkillsConfig(message: WSMessage): void {
    const payload = message.payload as WSSkillsConfigPayload;
    this.realmSkillFilter = payload.skills.length > 0 ? payload.skills : null;

    // Rebuild tool registry with updated filter
    if (this.skillLoader) {
      this.rebuildToolRegistry(this.skillLoader.lastRegistry);
    }

    const enabled = (this.realmSkillFilter ?? []).filter((s) => s.enabled).map((s) => s.name);
    const disabled = (this.realmSkillFilter ?? []).filter((s) => !s.enabled).map((s) => s.name);
    this.log("info", `Realm skills config received: ${enabled.length} enabled, ${disabled.length} disabled`);
  }

  /** Effective skill filter: skill name → enabled. null means no realm filter. */
  getRealmSkillFilter(): SkillConfig[] | null {
    return this.realmSkillFilter;
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

  private handleAgentPeerCatalog(message: WSMessage): void {
    try {
      const payload = message.payload as WSAgentPeerCatalogPayload;
      const peers = payload.peers ?? [];

      // Persist to local DB (replaces previous catalog for this agent)
      const ownDid = this.vaultysId?.did ?? this.id;
      storePeerGrants(ownDid, peers.map((p) => ({
        id: p.id,
        source_did: p.sourceDid,
        target_did: p.targetDid,
        target_name: p.targetName,
        skill_description: p.skillDescription,
        capabilities: JSON.stringify(p.capabilities),
        certificate: p.certificate,
        expires_at: p.expiresAt ?? null,
        created_at: new Date().toISOString(),
      })));

      this.peerCatalog = peers;
      this.peerManager?.updatePeerCatalog(peers);

      this.log("info", `Peer catalog updated: ${peers.length} peer grant(s)`);
    } catch (err) {
      this.log("error", "Error handling agent peer catalog", err);
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

  /**
   * @deprecated The `policy_update` message is superseded by the cert-reissue path
   * (`update_capabilities` → re-auth). Policy metadata (resourceLimits, policyId,
   * policyExpiresAt) is now embedded in the Challenger certificate and read in
   * handleAuthComplete / handleUpdateCapabilities. This handler is kept as a
   * no-op for backward compatibility with older control-plane builds.
   */
  private handlePolicyUpdate(message: WSMessage): void {
    const { messageId } = message;
    this.log("warn", "Received deprecated policy_update message — policies are now enforced via cert reissue");
    this.sendAck(messageId, true);
  }

  // ---- Knowledge sync ----

  private async handleKnowledgeSync(message: WSMessage): Promise<void> {
    const { messageId, payload } = message;
    const { sourceId, sourceName, sourceType, config, docling, fileAttachments } = payload as {
      sourceId: string;
      sourceName: string;
      sourceType: string;
      config: KnowledgeSourceConfig;
      docling?: { url: string; sourceEndpoint?: string; fileEndpoint?: string };
      fileAttachments?: Array<{ id: string; name: string; mimeType: string; size: number; content: string }>;
    };

    this.log('info', `Knowledge sync requested for source "${sourceName}" (${sourceId})`);

    if (!this.activeLlmConfig) {
      this.send({ type: 'result', messageId, payload: { status: 'failed', error: 'LLM not configured' }, timestamp: new Date().toISOString() });
      return;
    }

    // Immediate ACK so the control plane knows the sync started
    this.send({
      messageId: `intent-ack-${Date.now()}`,
      type: 'intent_ack',
      agentId: this.id,
      payload: { status: 'started', sourceId },
      timestamp: new Date().toISOString(),
    });

    // Run ingestion (non-blocking — reports status back to control-plane when done)
    ingestSource(sourceId, sourceName, sourceType, config, this.activeLlmConfig, docling, fileAttachments)
      .then((result) => {
        this.log('info', `Knowledge sync complete: ${result.docsProcessed} docs, ${result.chunksCreated} chunks`);
        // Mark as error if every document failed (docsProcessed=0 with errors)
        const status = result.docsProcessed === 0 && result.errors.length > 0 ? 'error' : 'ready';
        this.send({
          messageId: `ks-result-${Date.now()}`,
          type: 'knowledge_sync_result',
          agentId: this.id,
          payload: {
            sourceId,
            status,
            docsProcessed: result.docsProcessed,
            chunksCreated: result.chunksCreated,
            errors: result.errors,
          },
          timestamp: new Date().toISOString(),
        });
      })
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.log('error', `Knowledge sync failed: ${errMsg}`);
        this.send({
          messageId: `ks-result-${Date.now()}`,
          type: 'knowledge_sync_result',
          agentId: this.id,
          payload: {
            sourceId,
            status: 'error',
            docsProcessed: 0,
            chunksCreated: 0,
            errors: [errMsg],
          },
          timestamp: new Date().toISOString(),
        });
      });
  }
}
