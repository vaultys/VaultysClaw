import { ChatMessageEntry } from "@vaultysclaw/shared";

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

export type AgentStatus =
  | "initializing"
  | "connecting"
  | "pending_approval"
  | "connected"
  | "disconnected";

export interface AgentInfo {
  id: string;
  name: string;
  version: string;
  status: AgentStatus;
  capabilities: string[];
  uptime: number;
  lastHeartbeat: string | null;
  activeLlmProvider?: string;
  activeLlmModel?: string;
  recentLogs: LogEntry[];
  recentIntents: IntentEntry[];
}

export interface LlmConfigSafe {
  provider: string;
  model: string;
  hasApiKey: boolean;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  maxTokens?: number;
}

// A field descriptor serialized from a Zod schema
export interface SchemaField {
  type: string;
  description?: string;
  optional?: boolean;
  nullable?: boolean;
  enum?: unknown[];
  value?: unknown;
  items?: SchemaField;
  properties?: Record<string, SchemaField>;
  options?: SchemaField[];
}

// Tool call event emitted by the agent during chat streaming
export interface ToolCallEvent {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

// A chat "item" is either a message or an inline tool call
export type ChatItem =
  | { kind: "message"; msg: ChatMessageEntry }
  | { kind: "tool_call"; event: ToolCallEvent };

export interface ChatSession {
  id: string;
  title: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

// ---- Phase 2-4 types ----

export interface ToolEntry {
  name: string;
  capability: string;
  requiresApproval: boolean;
  description?: string;
  inputSchema?: Record<string, SchemaField>;
}

export interface SkillToolEntry {
  name: string;
  description?: string;
  inputSchema?: Record<string, SchemaField>;
}

export interface SkillEntry {
  name: string;
  description: string;
  version: string;
  toolCount: number;
  systemPromptExtension?: string;
  enabled: boolean;
  isRequired: boolean;
  realmManaged: boolean;
  tools: SkillToolEntry[];
}

export interface ApprovalEntry {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  conversationId?: string;
  requestedAt: string;
}

export interface TaskEntry {
  id: string;
  action: string;
  params: string;
  status: "pending" | "running" | "success" | "failed" | "dead";
  priority: number;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: string | null;
  error: string | null;
  created_by: string | null;
}

export interface ScheduleEntry {
  id: string;
  name: string;
  cron: string;
  action: string;
  params: string;
  enabled: number;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

export interface MemoryEntry {
  id: string;
  type: "fact" | "procedure" | "preference" | "conversation_summary";
  content: string;
  tags: string;
  importance: number;
  access_count: number;
  last_accessed: string | null;
  created_at: string;
}

export interface ToolLogEntry {
  tool_name: string;
  args: string;
  success: number;
  duration_ms: number;
  created_at: string;
}
