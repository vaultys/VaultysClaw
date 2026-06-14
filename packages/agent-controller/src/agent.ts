/**
 * AgentController — full-featured agent with LLM, tools, skills, memory, scheduling.
 *
 * Extends BaseAgentRuntime (protocol layer) with:
 *   - LLM execution via Mastra
 *   - Tool registry (built-in tools + skill plugins)
 *   - Memory store (semantic retrieval, conversation summarization)
 *   - Task queue & scheduler
 *   - Knowledge source ingestion
 *
 * Emitted events (from BaseAgentRuntime):
 *   status_changed  { status: AgentStatus }
 *   log             { level: 'info'|'warn'|'error'|'debug', message: string, data?: unknown }
 *   heartbeat       { uptime: number }
 *   intent_received { intentId: string; action: string; params: Record<string, unknown> }
 *   intent_result   { intentId: string; status: 'success'|'failed'; output?: unknown; error?: string }
 *   config_updated  { source: 'remote'|'env'; provider?: string; model?: string }
 */

import path from "path";
import { VaultysId, crypto } from "@vaultys/id";
import { decode as msgpackDecode } from "@msgpack/msgpack";
import {
  BaseAgentRuntime,
  type AgentStatus,
  type AgentInfo as _BaseAgentInfo,
  type LogEntry,
  type IntentEntry,
} from "@vaultysclaw/agent-runtime";
import {
  initDb,
  storeCertificate,
  storeDelegation,
  clearAllDelegations,
  getAllDelegations,
  type DelegationRow,
  getLlmConfig,
  setLlmConfig,
  setEncryptedLlmConfigBlob,
  getEncryptedLlmConfigBlob,
  getPeerjsServer,
  getDb,
  getRecentTasks,
  upsertChatSession,
  appendChatMessages,
  listChatSessions,
  getChatMessages,
  deleteChatSession,
  storePeerGrants,
  getAllPeerGrants,
  type PeerGrantRow,
  recordTokenUsage,
  getDailyTokenUsage,
  getMonthlyTokenUsage,
  listKnowledgeSources,
} from "./db";
import {
  type WSMessage,
  type WSAuthCompletePayload,
  type WSDelegationUpdatePayload,
  type WSLlmConfigPayload,
  type WSChatResponsePayload,
  type WSToolApprovalRequestPayload,
  type WSToolApprovalResponsePayload,
  type WSToolExecutionPayload,
  type WSGetChatSessionsPayload,
  type WSChatSessionsResponsePayload,
  type WSGetChatHistoryPayload,
  type WSChatHistoryResponsePayload,
  type AgentCapability,
  type LlmConfig,
  type AgentPeerGrant,
  type WSSkillsConfigPayload,
  type SkillConfig,
  type ChatMessageEntry,
} from "@vaultysclaw/shared";
import { Challenger } from "@vaultys/id";
import { type AgentControllerConfig } from "./config";
import {
  runIntent,
  LlmNotConfiguredError,
  LlmProviderError,
  streamChat,
  type StepFinishEvent,
} from "./llm";
import {
  createToolRegistry,
  buildToolSet,
  type ToolRegistry,
  type ApprovalRequest,
} from "./tools";
import { buildRemoteAgentTools } from "./tools/remote-agent-tools";
import { SkillLoader, type SkillRegistry } from "./skills";
import { TaskQueue } from "./task-queue";
import { Scheduler } from "./scheduler";
import { MemoryStore, MemoryRetriever, ConversationSummarizer } from "./memory";
import type { MastraTool } from "./tools/types";
import { ingestSource, buildKnowledgeTool } from "./knowledge";
import type { KnowledgeSourceConfig } from "./knowledge";
import { parseTextToolCall, executeToolCall } from "./tool-call-resolver";

const Buffer = crypto.Buffer;

// ---- LLM error classification ----

function classifyLlmError(err: unknown): "llm_unavailable" | "llm_error" {
  if (!(err instanceof Error)) return "llm_error";
  // AI SDK APICallError with ECONNREFUSED / network cause
  const cause = (err as any).cause;
  if (cause?.code === "ECONNREFUSED") return "llm_unavailable";
  if (cause?.constructor?.name === "AggregateError") return "llm_unavailable";
  // Mastra re-throws as a retryable APICallError
  if (
    (err as any)[Symbol.for("vercel.ai.error.AI_APICallError")] === true &&
    (err as any).isRetryable
  ) {
    if (
      err.message.includes("Cannot connect") ||
      err.message.includes("ECONNREFUSED")
    )
      return "llm_unavailable";
  }
  // Wrapped in LlmProviderError
  if (err.name === "LlmProviderError")
    return classifyLlmError((err as any).providerCause);
  // Fallback string check
  if (
    err.message.includes("ECONNREFUSED") ||
    err.message.includes("Cannot connect to API")
  )
    return "llm_unavailable";
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
    case "ZodString":
      return { ...base, type: "string" };
    case "ZodNumber":
      return { ...base, type: "number" };
    case "ZodBoolean":
      return { ...base, type: "boolean" };
    case "ZodArray":
      return { ...base, type: "array", items: serializeZodField(def.type) };
    case "ZodObject":
      return { ...base, type: "object", properties: serializeZodSchema(field) };
    case "ZodEnum":
      return { ...base, type: "enum", enum: def.values };
    case "ZodLiteral":
      return { ...base, type: "literal", value: def.value };
    case "ZodUnion":
      return {
        ...base,
        type: "union",
        options: (def.options as any[]).map(serializeZodField),
      };
    default:
      return { ...base, type: typeName.replace("Zod", "").toLowerCase() };
  }
}

function serializeZodSchema(schema: any): Record<string, unknown> | undefined {
  if (!schema?._def) return undefined;
  try {
    if (schema._def.typeName === "ZodObject") {
      const shape =
        typeof schema._def.shape === "function"
          ? schema._def.shape()
          : schema._def.shape;
      if (!shape) return undefined;
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) {
        result[key] = serializeZodField(value);
      }
      return result;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

// Re-export types for backward compat
export type { AgentStatus, LogEntry, IntentEntry };
// Extended AgentInfo with LLM fields for agent-controller
export interface AgentInfo extends _BaseAgentInfo {
  activeLlmProvider?: string;
  activeLlmModel?: string;
}

// ---- Think-content splitter ----

/**
 * Splits a raw text chunk (with optional buffered prefix) into segments
 * of normal vs. reasoning content, handling <think>/</think> tags that
 * may span chunk boundaries.
 */
function splitThinkContent(
  text: string,
  inThinking: boolean
): {
  segments: Array<{ text: string; thinking: boolean }>;
  remaining: string;
  inThinking: boolean;
} {
  const segments: Array<{ text: string; thinking: boolean }> = [];
  let pos = 0;
  let thinking = inThinking;
  while (pos < text.length) {
    const tag = thinking ? "<\/think>" : "<think>";
    const tagIdx = text.indexOf(tag, pos);
    if (tagIdx === -1) {
      const tail = text.slice(pos);
      let trailingPartial = "";
      for (let len = Math.min(tag.length - 1, tail.length); len >= 1; len--) {
        if (tag.startsWith(tail.slice(-len))) {
          trailingPartial = tail.slice(-len);
          break;
        }
      }
      const emitText = trailingPartial
        ? tail.slice(0, tail.length - trailingPartial.length)
        : tail;
      if (emitText) segments.push({ text: emitText, thinking });
      return { segments, remaining: trailingPartial, inThinking: thinking };
    }
    if (tagIdx > pos)
      segments.push({ text: text.slice(pos, tagIdx), thinking });
    pos = tagIdx + tag.length;
    thinking = !thinking;
  }
  return { segments, remaining: "", inThinking: thinking };
}

// ---- Agent class ----

export class Agent extends BaseAgentRuntime {
  // LLM
  private activeLlmConfig: LlmConfig | null = null;

  // Tool system
  private toolRegistry: ToolRegistry;
  private skillLoader: SkillLoader | null = null;
  /** Skill filter pushed by the control plane. null = no filter (use all local skills). */
  private realmSkillFilter: SkillConfig[] | null = null;
  private pendingApprovals = new Map<
    string,
    {
      resolve: (approved: boolean) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private _pendingApprovalsMeta: Array<{
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    conversationId?: string;
    requestedAt: string;
  }> = [];
  private static readonly DEFAULT_APPROVAL_TIMEOUT_MS = 600_000; // 10 minutes

  // Task queue & scheduler
  private taskQueue: TaskQueue | null = null;
  private scheduler: Scheduler | null = null;

  // Memory system
  private memoryStore = new MemoryStore();
  private memoryRetriever = new MemoryRetriever(this.memoryStore);
  private memorySummarizer: ConversationSummarizer | null = null;

  /**
   * Optional override for chat handling. When set, called instead of the built-in
   * LLM path. The returned string is sent back as a single chat_response chunk.
   */
  chatHandler?: (
    messages: ChatMessageEntry[],
    conversationId: string
  ) => Promise<string>;

  /**
   * Optional override for intent/peer-invoke handling. When set, called from
   * executeIntent instead of the LLM path. Covers all transport sources:
   * WebSocket intents from the control plane AND WebRTC peer invocations.
   */
  intentHandler?: (
    action: string,
    params: Record<string, unknown>,
    callerDid?: string,
    intentId?: string
  ) => Promise<unknown>;

  constructor(config: AgentControllerConfig) {
    super(config);
    // Initial tool registry (no skill tools yet — will be updated after skills load)
    this.toolRegistry = createToolRegistry({
      workspaceRoot: config.workspaceRoot ?? process.cwd(),
    });
  }

  // ---- Override start to add DB init, skills, task queue ----

  override async start(): Promise<void> {
    this.log("info", `Initializing agent "${this.config.name}"`);

    this.vaultysId = await this.initVaultysId(this.config.vaultysIdPath);
    this.log("info", `VaultysId identity ready`, { did: this.vaultysId.did });

    // Database is stored in the parent directory of .vaultys/
    const dbDir = path.dirname(path.dirname(this.config.vaultysIdPath));
    initDb(dbDir, "agent.db");
    this.log("info", "Local database initialized");

    await this.refreshActiveLlmConfig();

    await this.loadSkills();

    this.initTaskQueue();

    // Initialize peer manager for agent-to-agent communication
    const { PeerManager } = await import("@vaultysclaw/agent-runtime");
    this.peerManager = new PeerManager(this.vaultysId);
    this.peerManager.onInvoke(async (remoteDid, action, params) => {
      return this.executeIntent(action, params, remoteDid);
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

  // ---- Override stop to add task queue / scheduler cleanup ----

  override stop(): void {
    this.taskQueue?.stop();
    this.scheduler?.stop();
    this.skillLoader?.stopWatch();
    super.stop();
  }

  // ---- Implement abstract methods ----

  async executeIntent(
    action: string,
    params: Record<string, unknown>,
    callerDid?: string,
    intentId?: string
  ): Promise<unknown> {
    // ── Direct skill-tool invocation (no LLM needed) ──────────────────────────
    if (action === "call_skill_tool") {
      const {
        skillName,
        toolName,
        params: toolParams,
      } = params as {
        skillName?: string;
        toolName?: string;
        params?: Record<string, unknown>;
      };
      if (!toolName) return { error: "call_skill_tool requires 'toolName'" };
      const def = this.toolRegistry.get(toolName);
      if (!def) return { error: `Tool '${toolName}' not found in registry` };
      if (!def.tool.execute)
        return { error: `Tool '${toolName}' has no execute function` };
      try {
        this.log(
          "info",
          `Executing skill tool directly: ${skillName ?? ""}/${toolName}`
        );
        const result = await def.tool.execute(
          (toolParams ?? {}) as any,
          {} as any
        );
        return { success: true, result, toolName, skillName };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log("error", `Skill tool '${toolName}' failed: ${msg}`);
        return { error: msg, toolName, skillName };
      }
    }

    if (this.intentHandler) {
      return this.intentHandler(action, params, callerDid, intentId);
    }

    if (!this.activeLlmConfig) throw new LlmNotConfiguredError();
    const tools = this.buildAgentToolSet();
    const queryText = `${action} ${JSON.stringify(params)}`;
    const memoryContext = this.memoryRetriever.retrieve(queryText) || undefined;
    const skillExtensions = this.realmSkillFilter
      ?.filter((s) => s.enabled && s.content)
      .map((s) => s.content as string);
    const agentId = this.id;
    const agentSend = this.send.bind(this);
    const onStepFinish: (event: StepFinishEvent) => void = (event) => {
      if (!event.toolCalls?.length) return;
      for (const tc of event.toolCalls) {
        const toolResult = event.toolResults?.find(
          (r: any) => r.toolCallId === tc.toolCallId
        );
        agentSend({
          messageId: `tool-exec-${Date.now()}`,
          type: "tool_execution",
          agentId,
          payload: {
            intentId,
            toolName: tc.toolName,
            args: tc.args,
            result: toolResult?.result,
            durationMs: 0,
          } satisfies WSToolExecutionPayload,
          timestamp: new Date().toISOString(),
        });
      }
    };

    const { text, usage } = await runIntent(
      this.activeLlmConfig,
      action,
      params,
      tools,
      memoryContext,
      skillExtensions,
      onStepFinish
    );

    // Record token usage to local DB and update counters
    if (usage) {
      this.emit("log", {
        level: "info",
        message: "Recording token usage from intent",
        data: {
          usage,
          provider: this.activeLlmConfig.provider,
          model: this.activeLlmConfig.model,
        },
      });
      recordTokenUsage(
        usage.promptTokens,
        usage.completionTokens,
        this.activeLlmConfig.provider,
        this.activeLlmConfig.model
      );
      this._tokenUsageSinceLastSync.promptTokens += usage.promptTokens;
      this._tokenUsageSinceLastSync.completionTokens += usage.completionTokens;
      this._tokenUsageTotal.promptTokens += usage.promptTokens;
      this._tokenUsageTotal.completionTokens += usage.completionTokens;
    }

    return { text, usage };
  }

  async executeChat(
    messages: ChatMessageEntry[],
    conversationId: string,
    sendChunk: (
      chunk: string,
      done?: boolean,
      isError?: boolean,
      errorCode?: "llm_unavailable" | "llm_error" | "agent_offline"
    ) => void
  ): Promise<void> {
    // Persist session + only new incoming messages (avoid duplicating history on each turn)
    const title =
      messages.find((m) => m.role === "user")?.content.slice(0, 80) ?? null;
    try {
      upsertChatSession(conversationId, title, "control_plane");
      const existingCount = getChatMessages(conversationId).length;
      const newMessages = messages.slice(existingCount);
      if (newMessages.length > 0) {
        appendChatMessages(
          conversationId,
          newMessages.map((m) => ({ role: m.role, content: m.content }))
        );
      }
    } catch {
      /* non-fatal */
    }

    if (this.chatHandler) {
      try {
        const text = await this.chatHandler(messages, conversationId);
        try {
          appendChatMessages(conversationId, [
            { role: "assistant", content: text },
          ]);
        } catch {
          /* non-fatal */
        }
        sendChunk(text, true);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        sendChunk(errMsg, true, true);
      }
      return;
    }

    if (!this.activeLlmConfig) {
      sendChunk("LLM not configured", true, true);
      return;
    }

    try {
      // Retrieve relevant memories for context
      const lastUserMsg =
        [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const memoryContext = lastUserMsg
        ? this.memoryRetriever.retrieve(lastUserMsg)
        : undefined;

      const tools = this.buildAgentToolSet(conversationId);

      // Detect @mentions in the last user message and inject routing hints
      const peerHints: string[] = [];
      if (this.peerCatalog.length > 0) {
        const mentionMatches = [...lastUserMsg.matchAll(/@([\w\-]+)/g)];
        for (const [, mention] of mentionMatches) {
          const normalised = mention.toLowerCase().replace(/[^a-z0-9]/g, "");
          const grant = this.peerCatalog.find(
            (g) =>
              g.targetName.toLowerCase().replace(/[^a-z0-9]/g, "") ===
              normalised
          );
          if (grant) {
            const toolName = `ask_agent_${grant.targetName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "")
              .slice(0, 40)}`;
            peerHints.push(
              `The user mentioned @${mention} in their message. ` +
                `You MUST use the \`${toolName}\` tool to forward the user's request to that agent and relay its response. ` +
                `Do NOT answer on behalf of @${mention} yourself — delegate via the tool.`
            );
            this.log(
              "info",
              `@mention detected: @${mention} → tool ${toolName}`
            );
          }
        }
      }

      const skillExtensions =
        this.realmSkillFilter
          ?.filter((s) => s.enabled && s.content)
          .map((s) => s.content as string) ?? [];

      const result = streamChat(
        this.activeLlmConfig,
        messages,
        tools,
        (event) => {
          // Report tool executions to control plane for real-time UI
          if (event.toolCalls && event.toolCalls.length > 0) {
            for (const tc of event.toolCalls) {
              const toolResult = event.toolResults?.find(
                (r: any) => r.toolCallId === tc.toolCallId
              );
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
        },
        memoryContext,
        [...skillExtensions, ...peerHints]
      );

      const chunks: string[] = [];

      const provider = this.activeLlmConfig?.provider ?? "unknown";
      const model = this.activeLlmConfig?.model ?? "unknown";
      const toolNames = new Set(Object.keys(tools));
      const useBufferedPath =
        provider === "ollama" || provider === "openai-compatible";

      this.log(
        "info",
        `[chat:stream] provider=${provider} model=${model} tools=[${[...toolNames].join(",")}] buffered=${useBufferedPath}`
      );

      if (useBufferedPath) {
        // Buffer the full response before sending so we can post-process it.
        const rawParts: string[] = [];
        for await (const rawChunk of result.textStream) {
          rawParts.push(rawChunk);
        }
        const fullText = rawParts.join("");

        this.log(
          "info",
          `[chat:stream:buffered] raw_response=${JSON.stringify(fullText.slice(0, 500))}${fullText.length > 500 ? "…" : ""}`
        );

        const parsedCall = parseTextToolCall(fullText, toolNames);

        this.log(
          "info",
          `[chat:stream:buffered] parseTextToolCall result=${parsedCall ? JSON.stringify({ toolName: parsedCall.toolName, args: parsedCall.args }) : "null"} knownTools=[${[...toolNames].join(",")}]`
        );

        let textToSend = fullText;

        if (parsedCall) {
          this.log(
            "info",
            `[chat:stream:buffered] executing intercepted tool call: ${parsedCall.toolName}`
          );
          const toolResult = await executeToolCall(
            parsedCall.toolName,
            parsedCall.args,
            tools as any
          );
          this.log(
            "info",
            `[chat:stream:buffered] tool result: ${JSON.stringify(toolResult.result).slice(0, 300)}`
          );
          this.send({
            messageId: `tool-exec-${Date.now()}`,
            type: "tool_execution",
            agentId: this.id,
            payload: {
              conversationId,
              toolName: parsedCall.toolName,
              args: parsedCall.args,
              result: toolResult.result,
              durationMs: 0,
            } satisfies WSToolExecutionPayload,
            timestamp: new Date().toISOString(),
          });
          textToSend =
            typeof toolResult.result === "string"
              ? toolResult.result
              : JSON.stringify(toolResult.result, null, 2);
        } else {
          const trimmed = fullText.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            this.log(
              "warn",
              `[chat:stream:buffered] response looks like JSON but no known tool matched — sending as-is. raw=${JSON.stringify(fullText.slice(0, 300))}`
            );
          }
        }

        const { segments, remaining } = splitThinkContent(textToSend, false);
        const allSegs = remaining
          ? [...segments, { text: remaining, thinking: false }]
          : segments;
        for (const seg of allSegs) {
          this.send({
            messageId: `chat-resp-${Date.now()}`,
            type: "chat_response",
            agentId: this.id,
            payload: {
              conversationId,
              chunk: seg.text,
              ...(seg.thinking ? { thinking: true } : {}),
            } satisfies WSChatResponsePayload,
            timestamp: new Date().toISOString(),
          });
          if (!seg.thinking) chunks.push(seg.text);
        }
      } else {
        // Cloud-provider path: stream chunks as they arrive.
        let thinkBuf = "";
        let inThinking = false;
        for await (const rawChunk of result.textStream) {
          const {
            segments,
            remaining,
            inThinking: newInThinking,
          } = splitThinkContent(thinkBuf + rawChunk, inThinking);
          thinkBuf = remaining;
          inThinking = newInThinking;
          for (const seg of segments) {
            this.send({
              messageId: `chat-resp-${Date.now()}`,
              type: "chat_response",
              agentId: this.id,
              payload: {
                conversationId,
                chunk: seg.text,
                ...(seg.thinking ? { thinking: true } : {}),
              } satisfies WSChatResponsePayload,
              timestamp: new Date().toISOString(),
            });
            if (!seg.thinking) chunks.push(seg.text);
          }
        }
        // Flush any remaining buffered tag-prefix as a final chunk
        if (thinkBuf) {
          this.send({
            messageId: `chat-resp-${Date.now()}`,
            type: "chat_response",
            agentId: this.id,
            payload: {
              conversationId,
              chunk: thinkBuf,
              ...(inThinking ? { thinking: true } : {}),
            } satisfies WSChatResponsePayload,
            timestamp: new Date().toISOString(),
          });
          if (!inThinking) chunks.push(thinkBuf);
        }
      }

      // Send "done" signal
      sendChunk("", true);

      // Record token usage from streaming
      try {
        const usage = await result.usage;
        if (usage && this.activeLlmConfig) {
          this.emit("log", {
            level: "info",
            message: "Recording token usage from chat stream",
            data: {
              usage,
              provider: this.activeLlmConfig.provider,
              model: this.activeLlmConfig.model,
            },
          });
          recordTokenUsage(
            usage.promptTokens,
            usage.completionTokens,
            this.activeLlmConfig.provider,
            this.activeLlmConfig.model
          );
          this._tokenUsageSinceLastSync.promptTokens += usage.promptTokens;
          this._tokenUsageSinceLastSync.completionTokens +=
            usage.completionTokens;
          this._tokenUsageTotal.promptTokens += usage.promptTokens;
          this._tokenUsageTotal.completionTokens += usage.completionTokens;
        } else {
          this.emit("log", {
            level: "warn",
            message: "No usage data from chat stream",
            data: { usage, hasConfig: !!this.activeLlmConfig },
          });
        }
      } catch (e) {
        this.emit("log", {
          level: "warn",
          message: "Failed to record token usage from stream",
          data: { error: String(e) },
        });
      }

      // Persist assistant response
      try {
        appendChatMessages(conversationId, [
          { role: "assistant", content: chunks.join("") },
        ]);
      } catch {
        /* non-fatal */
      }

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
            this.memorySummarizer = new ConversationSummarizer(
              this.memoryStore
            );
          }
          this.memorySummarizer
            .summarize(fullHistory, config, [`conversation:${conversationId}`])
            .catch((err) =>
              this.log("warn", "Memory summarization failed", err)
            );
        });
      }
    } catch (err) {
      const errorCode = classifyLlmError(err);
      const errMsg =
        errorCode === "llm_unavailable"
          ? `LLM provider not reachable (${this.activeLlmConfig?.baseUrl ?? this.activeLlmConfig?.provider ?? "unknown"}). Check the agent's LLM configuration.`
          : err instanceof Error
            ? err.message
            : String(err);
      this.log(
        "error",
        `Chat ${conversationId} failed [${errorCode}]: ${errMsg}`
      );
      sendChunk(errMsg, true, true, errorCode);
    }
  }

  // ---- Override hooks ----

  protected override getDailyTokenUsageForBudget(): {
    promptTokens: number;
    completionTokens: number;
  } {
    return getDailyTokenUsage() ?? { promptTokens: 0, completionTokens: 0 };
  }

  protected override async onAuthComplete(
    payload: WSAuthCompletePayload
  ): Promise<void> {
    // Store the certificate
    if (this.vaultysId) {
      try {
        // Extract server public key from the certificate stored by base class auth logic
        const latestCert = getDb()
          .query(
            "SELECT certificate_data FROM certificates ORDER BY id DESC LIMIT 1"
          )
          .get() as { certificate_data: string } | undefined;
        if (latestCert?.certificate_data) {
          const certBuf = Buffer.from(latestCert.certificate_data, "base64");
          const deserialized = Challenger.deserializeCertificate(certBuf);
          if (deserialized?.pk1) {
            const pk = Buffer.from(
              deserialized.pk1 as Uint8Array
            ) as unknown as Buffer;
            this.serverPublicKey = pk;
            this.peerManager?.setServerPublicKey(
              deserialized.pk1 as Uint8Array
            );
          }
        }
      } catch (err) {
        this.log(
          "warn",
          "Could not extract server public key from certificate",
          err
        );
      }
    }

    // Push current knowledge source statuses so the control-plane can reconcile
    try {
      const sources = listKnowledgeSources();
      if (sources.length > 0) {
        this.send({
          messageId: `ks-status-${Date.now()}`,
          type: "knowledge_status_sync",
          agentId: this.id,
          payload: {
            sources: sources.map((s) => ({
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
      this.log("warn", "Could not push knowledge status on connect", err);
    }
  }

  protected override async onDelegationUpdate(
    payload: WSDelegationUpdatePayload
  ): Promise<void> {
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
    this.log(
      "info",
      `Delegation update: ${delegations.length} cert(s) stored`
    );
  }

  protected override async onPeerCatalogUpdated(
    peers: AgentPeerGrant[]
  ): Promise<void> {
    // Persist to local DB (replaces previous catalog for this agent)
    const ownDid = this.vaultysId?.did ?? this.id;
    storePeerGrants(
      ownDid,
      peers.map((p) => ({
        id: p.id,
        source_did: p.sourceDid,
        target_did: p.targetDid,
        target_name: p.targetName,
        skill_description: p.skillDescription,
        capabilities: JSON.stringify(p.capabilities),
        certificate: p.certificate,
        expires_at: p.expiresAt ?? null,
        created_at: new Date().toISOString(),
      }))
    );
  }

  protected override async onLlmConfig(
    payload: WSLlmConfigPayload
  ): Promise<void> {
    // Encrypt apiKey and persist; then refresh runtime config asynchronously
    this.persistEncryptedLlmConfig(payload.config)
      .then(() => this.refreshActiveLlmConfig())
      .catch((err) => {
        this.log("error", "Failed to persist remote LLM config", err);
      });
    if (payload.config === null) {
      this.log(
        "info",
        "Remote LLM config cleared — falling back to env config"
      );
    } else {
      this.log(
        "info",
        `Remote LLM config received: ${payload.config.provider}/${payload.config.model}`
      );
    }
  }

  protected override async onSkillsConfig(
    payload: WSSkillsConfigPayload
  ): Promise<void> {
    this.realmSkillFilter = payload.skills.length > 0 ? payload.skills : null;

    // Rebuild tool registry with updated filter
    if (this.skillLoader) {
      this.rebuildToolRegistry(this.skillLoader.lastRegistry);
    }

    const enabled = (this.realmSkillFilter ?? [])
      .filter((s) => s.enabled)
      .map((s) => s.name);
    const disabled = (this.realmSkillFilter ?? [])
      .filter((s) => !s.enabled)
      .map((s) => s.name);
    this.log(
      "info",
      `Realm skills config received: ${enabled.length} enabled, ${disabled.length} disabled`
    );
  }

  protected override async handleGetChatSessions(
    message: WSMessage
  ): Promise<void> {
    const payload = (message.payload ?? {}) as WSGetChatSessionsPayload;
    const limit = payload.limit ?? 50;
    try {
      const rows = listChatSessions(limit);
      const sessions: WSChatSessionsResponsePayload["sessions"] = rows.map(
        (r) => ({
          id: r.id,
          title: r.title,
          source: r.source,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          messageCount: (r.message_count as number | undefined) ?? 0,
        })
      );
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

  protected override async handleGetChatHistory(
    message: WSMessage
  ): Promise<void> {
    const payload = message.payload as WSGetChatHistoryPayload;
    const { sessionId } = payload;
    try {
      const rows = getChatMessages(sessionId);
      const messages: WSChatHistoryResponsePayload["messages"] = rows.map(
        (r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
          createdAt: r.created_at,
        })
      );
      this.send({
        messageId: `chat-history-${Date.now()}`,
        type: "chat_history_response",
        agentId: this.id,
        payload: {
          sessionId,
          messages,
        } satisfies WSChatHistoryResponsePayload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.log("warn", "Failed to get chat history", err);
    }
  }

  protected override async handleToolApprovalResponse(
    message: WSMessage
  ): Promise<void> {
    const payload = message.payload as WSToolApprovalResponsePayload;
    const pending = this.pendingApprovals.get(payload.requestId);
    if (!pending) {
      this.log(
        "warn",
        `Received approval response for unknown request: ${payload.requestId}`
      );
      return;
    }

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(payload.requestId);
    this._pendingApprovalsMeta = this._pendingApprovalsMeta.filter(
      (m) => m.requestId !== payload.requestId
    );

    this.log(
      "info",
      `Tool approval ${payload.approved ? "granted" : "rejected"}: ${payload.requestId}${payload.reason ? ` (${payload.reason})` : ""}`
    );
    pending.resolve(payload.approved);
  }

  protected override async handleTaskEnqueue(
    message: WSMessage
  ): Promise<void> {
    if (!this.taskQueue) return;

    const p =
      message.payload as import("@vaultysclaw/shared").WSTaskEnqueuePayload;
    const taskId = this.taskQueue.enqueue(p.action, p.params ?? {}, {
      priority: p.priority,
      scheduledAt: p.scheduledAt,
      maxRetries: p.maxRetries,
      createdBy: p.createdBy,
    });

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

  protected override async handleScheduleUpdate(
    message: WSMessage
  ): Promise<void> {
    if (!this.scheduler) return;

    const p =
      message.payload as import("@vaultysclaw/shared").WSScheduleUpdatePayload;
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

  protected override async handleScheduleDelete(
    message: WSMessage
  ): Promise<void> {
    if (!this.scheduler) return;

    const p =
      message.payload as import("@vaultysclaw/shared").WSScheduleDeletePayload;
    this.scheduler.removeSchedule(p.id);
    this.log("info", `Schedule deleted: ${p.id}`);
  }

  protected override async handleKnowledgeSync(
    message: WSMessage
  ): Promise<void> {
    const { messageId, payload } = message;
    const {
      sourceId,
      sourceName,
      sourceType,
      config,
      docling,
      fileAttachments,
    } = payload as {
      sourceId: string;
      sourceName: string;
      sourceType: string;
      config: KnowledgeSourceConfig;
      docling?: {
        url: string;
        sourceEndpoint?: string;
        fileEndpoint?: string;
      };
      fileAttachments?: Array<{
        id: string;
        name: string;
        mimeType: string;
        size: number;
        content: string;
      }>;
    };

    this.log(
      "info",
      `Knowledge sync requested for source "${sourceName}" (${sourceId})`
    );

    if (!this.activeLlmConfig) {
      this.send({
        type: "result",
        messageId,
        payload: { status: "failed", error: "LLM not configured" },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Immediate ACK so the control plane knows the sync started
    this.send({
      messageId: `intent-ack-${Date.now()}`,
      type: "intent_ack",
      agentId: this.id,
      payload: { status: "started", sourceId },
      timestamp: new Date().toISOString(),
    });

    // Run ingestion (non-blocking — reports status back to control-plane when done)
    ingestSource(
      sourceId,
      sourceName,
      sourceType,
      config,
      this.activeLlmConfig,
      docling,
      fileAttachments
    )
      .then((result) => {
        this.log(
          "info",
          `Knowledge sync complete: ${result.docsProcessed} docs, ${result.chunksCreated} chunks`
        );
        const status =
          result.docsProcessed === 0 && result.errors.length > 0
            ? "error"
            : "ready";
        this.send({
          messageId: `ks-result-${Date.now()}`,
          type: "knowledge_sync_result",
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
        this.log("error", `Knowledge sync failed: ${errMsg}`);
        this.send({
          messageId: `ks-result-${Date.now()}`,
          type: "knowledge_sync_result",
          agentId: this.id,
          payload: {
            sourceId,
            status: "error",
            docsProcessed: 0,
            chunksCreated: 0,
            errors: [errMsg],
          },
          timestamp: new Date().toISOString(),
        });
      });
  }

  // ---- Override verifyUserDelegation to use local DB ----

  protected override async verifyUserDelegation(
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

        const { VaultysId: VId } = await import("@vaultys/id");
        const serverVid = VId.fromId(this.serverPublicKey);
        const valid = serverVid.verifyChallenge(
          Buffer.from(body),
          Buffer.from(signature),
          false
        );
        if (!valid) continue;

        const p = msgpackDecode(body) as {
          type: string;
          userDid: string;
          agentDid: string;
          capabilities: string[];
          expiresAt?: number;
        };
        if (p.type !== "delegation") continue;
        if (p.expiresAt && p.expiresAt < Date.now()) continue;
        if (p.agentDid !== this.id && p.agentDid !== "*") continue;
        if (!p.capabilities.includes(capability)) continue;
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  // ---- Public API (additional methods beyond base class) ----

  override getInfo(): AgentInfo & {
    activeLlmProvider?: string;
    activeLlmModel?: string;
  } {
    return {
      ...super.getInfo(),
      activeLlmProvider: this.activeLlmConfig?.provider,
      activeLlmModel: this.activeLlmConfig?.model,
    };
  }

  /** Exposes the agent's VaultysId instance for P2P auth sessions. */
  getVaultysId(): VaultysId | null {
    return this.vaultysId?.toVersion(1) ?? null;
  }

  /** Returns the configured PeerJS relay server URL, or null for the public default.
   *  DB value (set by control plane) takes priority over the env/config value. */
  override getPeerjsServerUrl(): string | null {
    return getPeerjsServer() ?? this.config.peerjsServer ?? null;
  }

  /**
   * Returns the active LLM config with the apiKey masked for safe display.
   */
  getLlmConfigSafe():
    | (Omit<LlmConfig, "apiKey"> & { apiKey?: string; hasApiKey: boolean })
    | null {
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
    try {
      return getRecentTasks(limit);
    } catch {
      return [];
    }
  }

  /** Active (and disabled) schedules. */
  getSchedules(): import("./db").ScheduleRow[] {
    try {
      return getDb()
        .query("SELECT * FROM schedules ORDER BY created_at DESC")
        .all() as import("./db").ScheduleRow[];
    } catch {
      return [];
    }
  }

  /** Loaded skill definitions with tool schemas for the web dashboard. */
  getSkills(): Array<{
    name: string;
    description: string;
    version: string;
    toolCount: number;
    systemPromptExtension?: string;
    enabled: boolean;
    isRequired: boolean;
    realmManaged: boolean;
    tools: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }>;
  }> {
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
    } catch {
      return [];
    }
  }

  /** All registered tools (built-in + skill) with descriptions and input schemas. */
  getToolList(): Array<{
    name: string;
    capability: string;
    requiresApproval: boolean;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }> {
    return this.toolRegistry.tools.map((t) => ({
      name: t.name,
      capability: t.capability,
      requiresApproval: t.requiresApproval,
      description: (t.tool as any).description as string | undefined,
      inputSchema: serializeZodSchema((t.tool as any).inputSchema),
    }));
  }

  /** Recent tool usage log entries. */
  getToolLog(limit = 100): Array<{
    tool_name: string;
    args: string;
    success: number;
    duration_ms: number;
    created_at: string;
  }> {
    try {
      return getDb()
        .query(
          "SELECT tool_name, args, success, duration_ms, created_at FROM tool_usage_log ORDER BY created_at DESC LIMIT $limit"
        )
        .all({ $limit: limit }) as any[];
    } catch {
      return [];
    }
  }

  /** Search or list memories. */
  getMemories(query?: string, limit = 20): import("./db").MemoryRow[] {
    if (query && query.trim()) {
      try {
        return this.memoryStore.search(query, limit);
      } catch {
        return [];
      }
    }
    try {
      return this.memoryStore.recent(undefined, limit);
    } catch {
      return [];
    }
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
  enqueueTask(
    action: string,
    params: Record<string, unknown> = {},
    opts: import("./task-queue").EnqueueOptions = {}
  ): string | null {
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
    const skill = this.skillLoader.lastRegistry.skills.find(
      (s) => s.name === skillName
    );
    if (!skill) throw new Error(`Unknown skill: ${skillName}`);

    if (this.realmSkillFilter) {
      const entry = this.realmSkillFilter.find((s) => s.name === skillName);
      if (entry?.isRequired)
        throw new Error(
          `Skill "${skillName}" is required by the realm and cannot be disabled`
        );
    }

    if (!this.realmSkillFilter) this.realmSkillFilter = [];
    const existing = this.realmSkillFilter.find((s) => s.name === skillName);
    if (existing) {
      existing.enabled = enabled;
    } else {
      this.realmSkillFilter.push({
        name: skillName,
        enabled,
        isRequired: false,
        config: {},
      });
    }

    this.rebuildToolRegistry(this.skillLoader.lastRegistry);
    this.log(
      "info",
      `Skill "${skillName}" ${enabled ? "enabled" : "disabled"} by dashboard user`
    );
  }

  /** List currently pending tool-approval requests. */
  getPendingApprovals(): Array<{
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    conversationId?: string;
    requestedAt: string;
  }> {
    return this._pendingApprovalsMeta;
  }

  /** Resolve a pending tool-approval request from the web dashboard. */
  resolveApproval(requestId: string, approved: boolean): void {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) throw new Error(`No pending approval with id: ${requestId}`);
    clearTimeout(pending.timer);
    this.pendingApprovals.delete(requestId);
    this._pendingApprovalsMeta = this._pendingApprovalsMeta.filter(
      (m) => m.requestId !== requestId
    );
    this.log(
      "info",
      `Tool approval ${approved ? "granted" : "rejected"} by dashboard user: ${requestId}`
    );
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
    const caps =
      this.capabilities.length > 0
        ? this.capabilities
        : this.toolRegistry.tools.map((t) => t.capability);
    return buildToolSet(this.toolRegistry, caps, async (request) => {
      this.log("info", `Web dashboard tool auto-approved: ${request.toolName}`);
      return true;
    });
  }

  /**
   * Invoke a single tool by name with the given args.
   */
  async invokeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const def = this.toolRegistry.get(toolName);
    if (!def) throw new Error(`Unknown tool: ${toolName}`);
    if (!def.tool.execute)
      throw new Error(`Tool ${toolName} has no execute function`);
    const start = Date.now();
    try {
      const result = await def.tool.execute(args as any, {} as any);
      this.log(
        "info",
        `Tool invoked from dashboard: ${toolName} (${Date.now() - start}ms)`
      );
      return result;
    } catch (err) {
      throw new Error(
        `Tool ${toolName} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Update the LLM config from the dashboard (local edit).
   */
  async updateLlmConfig(config: LlmConfig | null): Promise<void> {
    await this.persistEncryptedLlmConfig(config);
    const loaded = config ? await this.loadDecryptedLlmConfig() : null;
    this.activeLlmConfig = loaded ?? (this.config as AgentControllerConfig).llmConfig;
    if (this.activeLlmConfig) {
      this.emit("config_updated", {
        source: "local",
        provider: this.activeLlmConfig.provider,
        model: this.activeLlmConfig.model,
      });
    }
    this.log(
      "info",
      config
        ? `LLM config updated locally: ${config.provider}/${config.model}`
        : "LLM config cleared — falling back to env config"
    );
  }

  /** Effective skill filter: skill name → enabled. null means no realm filter. */
  getRealmSkillFilter(): SkillConfig[] | null {
    return this.realmSkillFilter;
  }

  // ---- Private helpers ----

  private async refreshActiveLlmConfig(): Promise<void> {
    const remote = (await this.loadDecryptedLlmConfig()) ?? getLlmConfig();
    this.activeLlmConfig = remote ?? (this.config as AgentControllerConfig).llmConfig;
    if (this.activeLlmConfig) {
      const source = remote ? "remote" : "env";
      this.log(
        "info",
        `Active LLM config: ${this.activeLlmConfig.provider}/${this.activeLlmConfig.model} (${source})`
      );
      this.emit("config_updated", {
        source,
        provider: this.activeLlmConfig.provider,
        model: this.activeLlmConfig.model,
      });
    } else {
      this.log("warn", "No LLM config — intents requiring LLM will fail");
    }
  }

  private async persistEncryptedLlmConfig(
    config: LlmConfig | null
  ): Promise<void> {
    if (config === null) {
      setLlmConfig(null);
      return;
    }
    const { apiKey, ...rest } = config;
    if (apiKey && this.vaultysId) {
      const encryptedApiKey = await VaultysId.encrypt(apiKey, [
        this.vaultysId.id,
      ]);
      const blob = JSON.stringify({
        ...rest,
        encryptedApiKey,
        apiKeyEncrypted: true,
      });
      setEncryptedLlmConfigBlob(blob);
    } else {
      setEncryptedLlmConfigBlob(JSON.stringify({ ...rest }));
    }
    setLlmConfig({ ...rest, apiKey: undefined });
  }

  private async loadDecryptedLlmConfig(): Promise<LlmConfig | null> {
    const raw = getEncryptedLlmConfigBlob();
    if (!raw) return null;
    try {
      type Blob = LlmConfig & {
        encryptedApiKey?: string;
        apiKeyEncrypted?: boolean;
      };
      const stored = JSON.parse(raw) as Blob;
      const { encryptedApiKey, apiKeyEncrypted, ...rest } = stored;
      if (encryptedApiKey && apiKeyEncrypted && this.vaultysId) {
        const decrypted = (await this.vaultysId.decrypt(
          encryptedApiKey
        )) as string;
        return { ...rest, apiKey: decrypted } as LlmConfig;
      }
      return rest as LlmConfig;
    } catch {
      return null;
    }
  }

  private async loadSkills(): Promise<void> {
    const defaultSkillsDir = path.join(
      process.env.HOME ?? process.cwd(),
      ".vaultysclaw",
      "skills"
    );
    const skillsDir =
      (this.config as AgentControllerConfig).skillsDir ?? defaultSkillsDir;

    this.skillLoader = new SkillLoader({ skillsDir });
    const skillRegistry = await this.skillLoader.load();

    this.rebuildToolRegistry(skillRegistry);
    this.log(
      "info",
      `Skills loaded: ${skillRegistry.skills.map((s) => s.name).join(", ") || "(none)"}`
    );

    if ((this.config as AgentControllerConfig).watchSkills) {
      this.skillLoader.startWatch((newRegistry) => {
        this.rebuildToolRegistry(newRegistry);
        this.log(
          "info",
          `Skills hot-reloaded: ${newRegistry.skills.map((s) => s.name).join(", ") || "(none)"}`
        );
      });
    }
  }

  private rebuildToolRegistry(skillRegistry: SkillRegistry): void {
    let extraTools = skillRegistry.getAllTools();

    if (this.realmSkillFilter !== null) {
      const filterMap = new Map(
        this.realmSkillFilter.map((s) => [s.name, s.enabled])
      );
      extraTools = skillRegistry.skills
        .filter((skill) => {
          const enabled = filterMap.get(skill.name);
          return enabled !== false;
        })
        .flatMap((skill) => skill.tools);
    }

    const knowledgeTool = buildKnowledgeTool(() => this.activeLlmConfig);
    const knowledgeToolDef: import("./tools/types").AgentToolDefinition = {
      capability:
        "knowledge_search" as import("@vaultysclaw/shared").AgentCapability,
      name: "knowledge_search",
      requiresApproval: false,
      tool: knowledgeTool,
    };

    this.toolRegistry = createToolRegistry({
      workspaceRoot: this.config.workspaceRoot ?? process.cwd(),
      extraTools: [...extraTools, knowledgeToolDef],
    });
  }

  private initTaskQueue(): void {
    this.taskQueue = new TaskQueue(
      async (action, params) => {
        if (action === "channel_mention") {
          return this.handleChannelMentionTask(params as any);
        }
        return this.executeIntent(action, params);
      },
      {
        onTaskUpdate: (task) => {
          this.emit("task_update", task);
          this.log(
            "info",
            `Task ${task.id} → ${task.status}${task.error ? `: ${task.error}` : ""}`
          );
        },
      }
    );

    this.scheduler = new Scheduler();
    this.taskQueue.start();
    this.scheduler.start(this.taskQueue);
    this.log("info", "Task queue and scheduler started");
  }

  private async handleChannelMentionTask(params: {
    channelId: string;
    threadId: string;
    userDid: string;
    userMessage: string;
    agentName: string;
  }): Promise<{
    text: string;
    usage?: { promptTokens: number; completionTokens: number };
  }> {
    const { channelId, threadId, userDid, userMessage, agentName } = params;

    try {
      if (!this.activeLlmConfig) {
        throw new Error("LLM not configured");
      }

      this.log(
        "info",
        `Channel mention received: @${agentName} in ${channelId} thread ${threadId}`
      );

      const response = await this.executeIntent(
        `Respond to channel mention: ${userMessage}`,
        { channelId, userDid, userMessage }
      );

      const responseText =
        typeof response === "string"
          ? response
          : ((response as any).text ?? JSON.stringify(response));

      this.send({
        messageId: `channel-msg-${Date.now()}`,
        type: "channel_message_send",
        agentId: this.id,
        payload: {
          channelId,
          threadId,
          content: responseText,
          metadata: {
            agentAction: "respond_to_mention",
            respondingTo: userDid,
          },
        } satisfies import("@vaultysclaw/shared").WSChannelMessageSendPayload,
        timestamp: new Date().toISOString(),
      });

      this.log(
        "info",
        `Channel mention response posted to ${channelId} (thread: ${threadId})`
      );

      return {
        text: `Response posted to #${channelId}`,
        ...(typeof response === "object" && (response as any).usage
          ? { usage: (response as any).usage }
          : {}),
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log("error", `Channel mention task failed: ${errMsg}`);
      throw new Error(`Failed to handle channel mention: ${errMsg}`);
    }
  }

  private buildAgentToolSet(
    conversationId?: string
  ): Record<string, MastraTool> {
    const caps =
      this.capabilities.length > 0
        ? this.capabilities
        : this.toolRegistry.tools.map((t) => t.capability);

    const ts = buildToolSet(
      this.toolRegistry,
      caps as AgentCapability[],
      (request) => {
        return this.requestToolApproval(request, conversationId);
      }
    );

    if (this.peerCatalog.length > 0 && this.peerManager) {
      const remoteTools = buildRemoteAgentTools(
        this.peerCatalog,
        this.peerManager
      );
      for (const def of remoteTools) {
        ts[def.name] = def.tool as MastraTool;
      }
    }

    this.log(
      "debug",
      `buildAgentToolSet: caps=${JSON.stringify([...new Set(caps)])}, tools=${Object.keys(ts).join(",")}`
    );
    return ts;
  }

  private requestToolApproval(
    request: ApprovalRequest,
    conversationId?: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timeoutMs =
        (this.config as AgentControllerConfig).approvalTimeoutMs ??
        Agent.DEFAULT_APPROVAL_TIMEOUT_MS;
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(request.requestId);
        this._pendingApprovalsMeta = this._pendingApprovalsMeta.filter(
          (m) => m.requestId !== request.requestId
        );
        this.log(
          "warn",
          `Tool approval timed out: ${request.toolName} (${request.requestId})`
        );
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

      this.log(
        "info",
        `Tool approval requested: ${request.toolName} (${request.requestId})`
      );
    });
  }
}
