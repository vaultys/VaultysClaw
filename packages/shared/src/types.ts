/**
 * Non-transferable identity bound to a specific instance
 */
export interface VaultysIdentity {
  id: string;
  publicKey: string;
  type: "control_plane" | "agent_controller";
  createdAt: Date;
}

/**
 * Agent capability/permission grant
 */
export type AgentCapability =
  | "file_access"
  | "internet_access"
  | "browser_control"
  | "api_call"
  | "mail_send"
  | "code_execution"
  | "system_command"
  | "agent_communication"
  | "knowledge_search";

/**
 * Runtime constraints embedded in the agent certificate alongside capabilities.
 * All fields are optional — omitting a field means no limit for that dimension.
 */
export interface ResourceLimits {
  maxTokensPerDay?: number;
  maxRequestsPerHour?: number;
  allowedDomains?: string[];
}

/**
 * Policy that defines what an agent controller can do.
 * @deprecated Use the governance policies table + ResourceLimits + cert-embedded enforcement.
 */
export interface AgentPolicy {
  id: string;
  agentControllerId: string;
  capabilities: AgentCapability[];
  resourceLimits?: ResourceLimits;
  timeWindow?: {
    startTime: string; // ISO 8601
    endTime: string; // ISO 8601
  };
  updatedAt: Date;
  signedBy: string; // Control plane identity
  signature: string;
}

/**
 * Intent signed by an agent controller - request to perform an action
 */
export interface SignedIntent {
  id: string;
  agentControllerId: string;
  action: string;
  params: Record<string, any>;
  timestamp: Date;
  signature: string;
  publicKey: string;
}

/**
 * Result of executing an intent
 */
export interface ExecutionResult {
  intentId: string;
  status: "success" | "failed" | "pending";
  output?: any;
  error?: string;
  executedAt: Date;
  signature?: string;
  publicKey?: string;
}

/**
 * Agent controller registration
 */
export interface AgentControllerRegistration {
  id: string;
  name: string;
  publicKey: string;
  endpoint: string;
  capabilities: AgentCapability[];
  registeredAt: Date;
  lastHeartbeat?: Date;
  metadata?: Record<string, any>;
}

/**
 * Message exchanged between control plane and agent controller
 */
export interface ProtocolMessage {
  version: "1.0";
  messageId: string;
  type: "intent" | "policy_update" | "heartbeat" | "result" | "ack" | "error";
  sender: string; // Identity ID
  receiver: string; // Identity ID
  payload: any;
  timestamp: Date;
  signature: string;
}

/**
 * Request to register an agent controller
 */
export interface RegistrationRequest {
  name: string;
  publicKey: string;
  endpoint: string;
  capabilities?: AgentCapability[];
}

/**
 * WebSocket message types for agent-control plane communication
 */
export type WSMessageType =
  | "register"
  | "register_ack"
  | "registration_pending"
  | "registration_approved"
  | "registration_rejected"
  | "auth_challenge"
  | "auth_complete"
  | "auth_failed"
  | "update_capabilities"
  | "delegation_update"
  | "intent"
  | "intent_ack"
  | "policy_update"
  | "policy_ack"
  | "heartbeat"
  | "pong"
  | "result"
  | "error"
  | "llm_config"
  | "chat_message"
  | "chat_response"
  | "tool_approval_request"
  | "tool_approval_response"
  | "tool_execution"
  | "task_enqueue"
  | "task_status"
  | "schedule_update"
  | "schedule_delete"
  | "get_chat_sessions"
  | "chat_sessions_response"
  | "get_chat_history"
  | "chat_history_response"
  | "agent_peer_catalog"
  | "skills_config"
  | "knowledge_sync"
  | "knowledge_sync_result"
  | "knowledge_status_sync"
  | "channel_event"
  | "channel_message_send";

/**
 * LLM provider type — controls which AI SDK provider is instantiated.
 * - openai              → OpenAI API (GPT-4o, o3, etc.)
 * - anthropic           → Anthropic API (Claude 3/4)
 * - google              → Google Generative AI (Gemini 2.x)
 * - ollama              → Local Ollama (any pulled model)
 * - openai-compatible   → Any OpenAI-compatible server (LM Studio, llama.cpp, Groq, etc.)
 */
export type LlmProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "openai-compatible";

/**
 * LLM configuration shared between agent controller and control plane.
 * Stored in the agent's local DB (remote config) or loaded from env vars (local config).
 */
export interface LlmConfig {
  provider: LlmProviderType;
  /** Model identifier as required by the provider (e.g. "gpt-4o", "claude-sonnet-4-5", "llama3.2"). */
  model: string;
  /** API key for cloud providers. Never returned in GET responses. */
  apiKey?: string;
  /** Base URL override — required for ollama/openai-compatible, optional for OpenAI-compatible clouds. */
  baseUrl?: string;
  /** Optional system prompt sent on every intent. Defaults to a built-in agent system prompt. */
  systemPrompt?: string;
  /** Max tokens for the LLM response. */
  maxTokens?: number;
  /** Price per million input tokens in USD. Used to estimate costs. */
  pricePerMillionInputTokens?: number;
  /** Price per million output tokens in USD. Used to estimate costs. */
  pricePerMillionOutputTokens?: number;
  /** Embedding model override for RAG knowledge base indexing. */
  embeddingModel?: string;
  /** Skip the text-buffer workaround for tool-call parsing. Set to true for
   *  openai-compatible endpoints that support native function calling (e.g. LiteLLM). */
  disableStreamingBuffer?: boolean;
}

/**
 * Sent by control plane to push (or clear) LLM configuration to an agent.
 * When config is null the agent falls back to its local env-var config.
 */
export interface WSLlmConfigPayload {
  config: LlmConfig | null;
}

/**
 * Token usage statistics reported by agent in heartbeat.
 */
export interface TokenUsageReport {
  total: {
    promptTokens: number;
    completionTokens: number;
  };
  sinceLastSync: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * Sent by agent periodically to indicate it's alive.
 * Includes system stats, active LLM config, and token usage.
 */
export interface WSHeartbeatPayload {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  activeLlm?: {
    provider: LlmProviderType;
    model: string;
  };
  name: string;
  tokenUsage: TokenUsageReport;
}

/**
 * WebSocket message wrapper
 */
export interface WSMessage {
  messageId: string;
  type: WSMessageType;
  agentId?: string; // For agent identification
  payload: any;
  timestamp: string; // ISO 8601
  signature?: string; // For signed messages
}

/**
 * Agent registration via WebSocket
 */
export interface WSRegisterPayload {
  name: string;
  version: string;
  capabilities: AgentCapability[];
  publicKey: string;
}

/**
 * Acknowledgment for WebSocket messages
 */
export interface WSAckPayload {
  messageId: string;
  success: boolean;
  reason?: string;
}

/**
 * VaultysId challenge-response payload exchanged during authentication
 */
export interface WSAuthChallengePayload {
  sessionId: string;
  data: string; // base64-encoded encrypted challenge data
}

/**
 * Sent by control plane when authentication succeeds
 */
export interface WSAuthCompletePayload {
  agentId: string; // The agent's DID, used as canonical ID
  did: string;
  /** Capabilities assigned by the control plane. Agent must use these. */
  capabilities: string[];
}

/**
 * Sent by control plane when authentication fails
 */
export interface WSAuthFailedPayload {
  reason: string;
}

/**
 * Sent by agent when requesting registration (new agent)
 */
export interface WSRegisterRequestPayload {
  name: string;
  version?: string;
}

/**
 * Sent by control plane when registration is pending admin approval
 */
export interface WSRegistrationPendingPayload {
  registrationId: string;
  message: string;
}

/**
 * Sent by control plane when admin approves a registration
 */
export interface WSRegistrationApprovedPayload {
  registrationId: string;
  capabilities: AgentCapability[];
}

/**
 * Sent by control plane when admin rejects a registration
 */
export interface WSRegistrationRejectedPayload {
  registrationId: string;
  reason: string;
}

/**
 * Sent by control plane when admin updates an agent's capabilities.
 * Agent should initiate a new auth handshake to get a fresh certificate with
 * the new capabilities (and any resource limits) embedded in the cert metadata.
 */
export interface WSUpdateCapabilitiesPayload {
  capabilities: AgentCapability[];
  /** Governance resource limits to embed in the new certificate. Null clears existing limits. */
  resourceLimits?: ResourceLimits | null;
  /** ID of the authorising governance policy. */
  policyId?: string | null;
  /** ISO-8601 expiry of the policy; agent rejects intents after this time. */
  policyExpiresAt?: string | null;
  reason?: string;
}

/**
 * A single delegation certificate entry pushed to agents.
 */
export interface DelegationCertPayload {
  id: string;
  grantId: string;
  userDid: string;
  agentDid: string; // "*" = applies to all agents
  capabilities: AgentCapability[];
  certificate: string; // base64 signed cert (see delegation.ts)
  expiresAt?: string; // ISO 8601, omitted if no expiry
}

/**
 * Sent by control plane to push delegation certs to an agent.
 * Replaces the full set for all affected users — agent stores them locally.
 */
export interface WSDelegationUpdatePayload {
  delegations: DelegationCertPayload[];
}

/**
 * Chat message exchanged between user and agent.
 */
export interface ChatMessageEntry {
  role: "user" | "assistant";
  content: string;
  thinkingContent?: string;
}

/**
 * Sent by control plane to an agent to request a chat completion.
 */
export interface WSChatMessagePayload {
  conversationId: string;
  messages: ChatMessageEntry[];
  /**
   * When true, the agent streams the response token-by-token, bypassing the
   * text-buffer tool-call workaround. Toggled per-conversation from the chat UI.
   * Requires a provider with native function calling (e.g. LiteLLM / cloud).
   */
  stream?: boolean;
  /**
   * When true, ask the model to expose its reasoning. Forwarded to the provider
   * as a reasoning/thinking request (only effective on models that support it).
   * Toggled per-conversation from the chat UI.
   */
  thinking?: boolean;
}

/**
 * Sent by agent back to control plane with streaming chat response chunks.
 * - chunk: a text delta (one or more tokens)
 * - done: true when the full response has been sent
 * - error: set when the agent could not produce a response
 */
export interface WSChatResponsePayload {
  conversationId: string;
  chunk?: string;
  /** True when this chunk is part of the model's internal reasoning (<think> block). */
  thinking?: boolean;
  done?: boolean;
  error?: string;
  /**
   * Machine-readable error category sent alongside `error`.
   * - "llm_unavailable": LLM endpoint is unreachable (ECONNREFUSED / network error)
   * - "llm_error":       LLM returned an API-level error (auth, quota, bad request…)
   * - "agent_offline":   Agent disconnected before responding (set by control plane)
   */
  errorCode?: "llm_unavailable" | "llm_error" | "agent_offline";
}

// ---------------------------------------------------------------------------
// Tool approval (agent ↔ control plane)
// ---------------------------------------------------------------------------

/**
 * Sent by agent to control plane when a tool needs admin approval before executing.
 */
export interface WSToolApprovalRequestPayload {
  requestId: string;
  conversationId?: string;
  toolName: string;
  args: Record<string, unknown>;
  agentId?: string;
}

/**
 * Sent by control plane to agent after admin approves or rejects a tool execution.
 */
export interface WSToolApprovalResponsePayload {
  requestId: string;
  approved: boolean;
  reason?: string;
}

/**
 * Sent by agent to control plane to report a tool execution (for real-time UI).
 */
export interface WSToolExecutionPayload {
  conversationId?: string;
  /** Set when the tool call originates from an intent execution (not a chat). */
  intentId?: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  approved?: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Channel messaging (agent → control plane)
// ---------------------------------------------------------------------------

/**
 * Sent by agent to control plane to post a message to a channel (e.g., responding to a mention).
 */
export interface WSChannelMessageSendPayload {
  channelId: string;
  threadId?: string; // If responding to a mention/thread
  content: string;
  metadata?: Record<string, any>;
}

export type {
  VaultysIdentity as Identity,
  AgentPolicy as Policy,
  SignedIntent as Intent,
  ExecutionResult as Result,
};

// ---------------------------------------------------------------------------
// Task queue (control plane → agent and agent → control plane)
// ---------------------------------------------------------------------------

/**
 * Sent by control plane to agent to enqueue a task.
 */
export interface WSTaskEnqueuePayload {
  action: string;
  params?: Record<string, unknown>;
  /** 0 = normal, higher = more important. */
  priority?: number;
  /** ISO 8601 — defer execution until this time. */
  scheduledAt?: string;
  maxRetries?: number;
  /** Who/what triggered the enqueue (user DID, etc.). */
  createdBy?: string;
}

/**
 * Sent by agent to control plane to report task progress.
 */
export interface WSTaskStatusPayload {
  taskId: string;
  status: "pending" | "running" | "success" | "failed" | "dead";
  result?: unknown;
  error?: string;
  action: string;
  retryCount: number;
}

/**
 * Sent by control plane to agent to add or update a cron schedule.
 */
export interface WSScheduleUpdatePayload {
  id: string;
  name: string;
  cron: string;
  action: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
}

/**
 * Sent by control plane to agent to remove a schedule.
 */
export interface WSScheduleDeletePayload {
  id: string;
}

// ---- Workspaces ----

/** Role a user holds within the organisation / workspace hierarchy */
export type UserRole = "owner" | "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string; // Tailwind/hex accent color e.g. "#6366f1"
  isDefault: boolean;
  createdAt: string; // ISO datetime
}

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceColor: string;
  isPrimary: boolean;
}

export interface WorkspaceConfig {
  workspaceId: string;
  llmConfig?: import("./types").LlmConfig;
  defaultCapabilities?: import("./types").AgentCapability[];
}

// ---- Workspace skill management ----

export interface WorkspaceSkill {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  version: string | null;
  isRequired: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface AgentSkillOverride {
  agentDid: string;
  workspaceSkillId: string;
  enabled: boolean;
}

/** Effective skill entry delivered to an agent via skills_config. */
export interface SkillConfig {
  name: string;
  enabled: boolean;
  isRequired: boolean;
  config: Record<string, unknown>;
  /** Markdown instructions injected into the agent's system prompt when the skill is enabled. */
  content?: string;
}

/** Pushed by control plane to configure which skills the agent should activate. */
export interface WSSkillsConfigPayload {
  skills: SkillConfig[];
}

// ---- Graph visualisation ----

export type GraphNodeType = "workspace" | "user" | "agent";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  role?: UserRole; // users only
  color?: string; // workspace accent color or computed
  isOnline?: boolean; // agents only
}

export type GraphEdgeType =
  | "workspace_member" // user/agent belongs to workspace
  | "grant" // user grants capabilities to agent
  | "reports_to" // user reports to another user
  | "delegation" // delegation cert exists
  | "peer"; // agent-to-agent peer grant

export interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
  label?: string; // e.g. capability names
  capabilities?: AgentCapability[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---- Chat session types (agent ↔ control plane) ----

export interface ChatSession {
  id: string;
  title: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatHistoryMessage {
  id: number;
  role: string;
  content: string;
  /** The model's reasoning for an assistant message, when it was captured. */
  thinking?: string;
  toolCalls?: unknown;
  createdAt: string;
}

/** Sent by control plane to request the agent's session list. */
export interface WSGetChatSessionsPayload {
  limit?: number;
}

/** Sent by agent in response with its list of sessions. */
export interface WSChatSessionsResponsePayload {
  sessions: ChatSession[];
}

/** Sent by control plane to request full message history for one session. */
export interface WSGetChatHistoryPayload {
  sessionId: string;
}

/** Sent by agent in response with the session's messages. */
export interface WSChatHistoryResponsePayload {
  sessionId: string;
  messages: ChatHistoryMessage[];
}

// ---------------------------------------------------------------------------
// Agent peer grants (agent-to-agent communication)
// ---------------------------------------------------------------------------

/**
 * A peer grant authorises one agent (sourceDid) to invoke a remote agent
 * (targetDid) as an LLM tool.  The certificate is signed by the control
 * plane so both sides can verify it without a network round-trip.
 */
export interface AgentPeerGrant {
  /** Unique grant identifier. */
  id: string;
  /** DID of the agent that is allowed to call the remote agent. */
  sourceDid: string;
  /** DID of the remote agent to be called. */
  targetDid: string;
  /** Human-readable name for the remote agent (used as tool name suffix). */
  targetName: string;
  /**
   * Description of what the remote agent can do.  Written by the control
   * plane admin and used verbatim as the LLM tool description.
   */
  skillDescription: string;
  /** Capabilities the calling agent is allowed to request from the remote. */
  capabilities: string[];
  /** Base64 control-plane-signed certificate blob. */
  certificate: string;
  /** ISO 8601 expiry timestamp, omitted when the grant never expires. */
  expiresAt?: string;
  /**
   * Optional shared VaultysClaw channel ID for channel-based agent-to-agent invocation.
   * When set, the calling agent can post @mentions to this channel instead of using
   * the WebRTC PeerManager.  Falls back to WebRTC when absent.
   */
  channelId?: string;
}

/**
 * Sent by the control plane to push the complete set of peer grants for an
 * agent.  Replaces whatever the agent has stored locally.
 */
export interface WSAgentPeerCatalogPayload {
  peers: AgentPeerGrant[];
}

export interface VaultysIDInfo {
  did: string;
  fingerprint: string;
  version: number;
  type: string;
}
