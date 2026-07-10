/**
 * LLM integration module — powered by Mastra (@mastra/core).
 */

import { Agent } from "@mastra/core/agent";
import { createOllama } from "ollama-ai-provider-v2";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { ClaudeSDKAgent } from "@mastra/claude";
import { CursorSDKAgent } from "@mastra/cursor";
import { OpenAISDKAgent } from "@mastra/openai";
import { setDefaultOpenAIKey } from "@openai/agents";
import { query as claudeQuery } from "@anthropic-ai/claude-agent-sdk";
import {
  isSdkAgentProvider,
  type LlmConfig,
  type ClaudeModelOption,
} from "@vaultysclaw/shared";
import type { MastraTool } from "./tools/types";
import pino from "pino";
import { trace, context, propagation, SpanStatusCode } from "@opentelemetry/api";

const logger = pino({ name: "llm" });

export { isSdkAgentProvider };

export class LlmNotConfiguredError extends Error {
  constructor() {
    super(
      "LLM is not configured. Set LLM_PROVIDER + LLM_MODEL env vars, " +
        "or push a config from the control plane."
    );
    this.name = "LlmNotConfiguredError";
  }
}

export class LlmProviderError extends Error {
  readonly providerCause: unknown;
  constructor(provider: string, cause: unknown) {
    super(`LLM provider "${provider}" error: ${String(cause)}`);
    this.name = "LlmProviderError";
    this.providerCause = cause;
  }
}

/**
 * Some OpenAI-compatible servers (LM Studio, DeepSeek, vLLM with a reasoning
 * parser) return the model's reasoning in a separate `reasoning_content`
 * field on stream deltas instead of inline <think> tags. The AI SDK's OpenAI
 * provider doesn't know that field and silently drops it. Rewrite the SSE
 * stream to re-inline it as <think>…</think> inside `content`, so the
 * downstream think-tag splitter tags it as reasoning like any other local
 * model. Non-SSE (JSON) responses are passed through untouched — intents and
 * summarization read `message.content`, which already excludes reasoning.
 */
export function inlineReasoningContent(res: Response): Response {
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !res.body || !contentType.includes("text/event-stream")) {
    return res;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let inReasoning = false;
  // Kept from the last data chunk so a synthetic closing chunk can be emitted
  // if the stream ends while still inside a reasoning block.
  let chunkSkeleton: Record<string, unknown> | null = null;

  const processLine = (line: string): string[] => {
    if (!line.startsWith("data: ")) return [line];
    const data = line.slice(6).trim();
    if (data === "[DONE]") {
      if (inReasoning && chunkSkeleton) {
        inReasoning = false;
        const closing = {
          ...chunkSkeleton,
          choices: [
            { index: 0, delta: { content: "</think>" }, finish_reason: null },
          ],
        };
        return [`data: ${JSON.stringify(closing)}`, "", line];
      }
      return [line];
    }
    try {
      const parsed = JSON.parse(data);
      const choice = parsed?.choices?.[0];
      if (!choice?.delta) return [line];
      const { choices: _c, ...skeleton } = parsed;
      chunkSkeleton = skeleton;
      const delta = choice.delta as Record<string, unknown>;
      const reasoning =
        typeof delta.reasoning_content === "string" && delta.reasoning_content
          ? delta.reasoning_content
          : undefined;
      const content =
        typeof delta.content === "string" && delta.content
          ? delta.content
          : undefined;
      if (reasoning !== undefined) {
        delta.content = (inReasoning ? "" : "<think>") + reasoning;
        delete delta.reasoning_content;
        inReasoning = true;
        return [`data: ${JSON.stringify(parsed)}`];
      }
      if (inReasoning && (content !== undefined || choice.finish_reason)) {
        delta.content = "</think>" + (content ?? "");
        inReasoning = false;
        return [`data: ${JSON.stringify(parsed)}`];
      }
      return [line];
    } catch {
      return [line];
    }
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        for (const out of processLine(line)) {
          controller.enqueue(encoder.encode(out + "\n"));
        }
      }
    },
    flush(controller) {
      if (buffer) {
        for (const out of processLine(buffer)) {
          controller.enqueue(encoder.encode(out + "\n"));
        }
      }
    },
  });

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(res.body.pipeThrough(transform), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Build a Mastra-compatible model specifier from an LlmConfig.
 * Returns a string "provider/model" for cloud providers, or an AI SDK model
 * instance for Ollama and OpenAI-compatible endpoints.
 * Exported for backward compat (e.g. memory/summarizer.ts).
 */
export function buildModel(config: LlmConfig): any {
  switch (config.provider) {
    case "openai":
      return config.apiKey
        ? createOpenAI({ apiKey: config.apiKey }).chat(config.model)
        : `openai/${config.model}`;

    case "anthropic":
      return config.apiKey
        ? createAnthropic({
            apiKey: config.apiKey,
            ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
          }).chat(config.model)
        : `anthropic/${config.model}`;

    case "google":
      return `google/${config.model}`;

    case "ollama": {
      let ollamaBase = config.baseUrl ?? "http://localhost:11434/api";
      if (!ollamaBase.endsWith("/api")) {
        ollamaBase = ollamaBase.replace(/\/+$/, "") + "/api";
      }
      return createOllama({ baseURL: ollamaBase })(config.model);
    }

    case "openai-compatible": {
      // Normalize: append /v1 when the URL has no path (e.g. bare Ollama/vLLM host:port).
      // The AI SDK appends /chat/completions to baseURL, so without /v1 it would 404.
      let baseURL = config.baseUrl;
      if (baseURL) {
        try {
          const u = new URL(baseURL);
          if (u.pathname === "/" || u.pathname === "") {
            baseURL = baseURL.replace(/\/+$/, "") + "/v1";
          }
        } catch {
          /* invalid URL — pass as-is */
        }
      }
      const client = createOpenAI({
        apiKey: config.apiKey ?? "not-required",
        baseURL,
        // Some servers (e.g. Ollama) reject messages with null content.
        // Patch outgoing requests to replace null content with "".
        fetch: async (url, init) => {
          let request = init as RequestInit;
          if (init?.body && typeof init.body === "string") {
            try {
              const body = JSON.parse(init.body);
              let changed = false;
              if (Array.isArray(body.messages)) {
                body.messages = body.messages.map(
                  (msg: Record<string, unknown>) =>
                    msg.content == null ? { ...msg, content: "" } : msg
                );
                changed = true;
              }
              // Some LiteLLM model registrations don't carry the metadata
              // needed to auto-translate `reasoning_effort` into the
              // backend's native thinking param (and drop_params silently
              // strips it if unrecognized). Send the Anthropic-shaped
              // `thinking` field directly as a documented passthrough — it
              // is a no-op for non-Anthropic backends.
              if (body.reasoning_effort && !body.thinking) {
                body.thinking = { type: "enabled", budget_tokens: 2048 };
                changed = true;
              }
              // Qwen3 hybrid models reason by default. When reasoning was
              // NOT requested, turn it off with the model's documented soft
              // switch (a "/no_think" directive in the latest user message).
              // Skip -instruct/-thinking variants, which are not hybrid.
              if (
                !body.reasoning_effort &&
                /qwen3(?!.*(instruct|thinking))/i.test(String(body.model)) &&
                Array.isArray(body.messages)
              ) {
                for (let i = body.messages.length - 1; i >= 0; i--) {
                  const msg = body.messages[i] as Record<string, unknown>;
                  if (msg.role === "user" && typeof msg.content === "string") {
                    body.messages[i] = {
                      ...msg,
                      content: `${msg.content} /no_think`,
                    };
                    changed = true;
                    break;
                  }
                }
              }
              if (changed) {
                request = { ...init, body: JSON.stringify(body) };
              }
            } catch {
              /* fall through */
            }
          }
          return inlineReasoningContent(await fetch(url, request));
        },
      });
      return client.chat(config.model);
    }

    case "claude-agent-sdk":
    case "cursor-agent-sdk":
    case "openai-agent-sdk":
      throw new Error(
        `buildModel() does not support SDK-agent provider "${config.provider}" — ` +
          "it wraps a full agent harness, not a chat model. Use runIntent()/streamChat() directly."
      );

    default: {
      throw new Error(`Unknown LLM provider: ${(config as any).provider}`);
    }
  }
}

/**
 * Build a Mastra SDK-Agent wrapper (Claude/Cursor/OpenAI Agents SDK) — these
 * run a vendor's own agent harness (own tool loop, permissions, sessions)
 * behind Mastra's standard Agent interface, so `runIntent`/`streamChat`
 * construct and invoke them the exact same way as a regular `Agent`.
 *
 * The internal tool registry (`tools`) is intentionally not forwarded: each
 * harness manages its own tools (MCP servers, allowed-tools lists, etc.)
 * rather than accepting Mastra `MastraTool`s directly. Multi-turn history is
 * forwarded as-is via `messages` (Mastra's MessageListInput accepts the same
 * array shape used for regular providers); true session continuity across
 * turns would use `resumeGenerate()`/`resumeStream()` with a stored session
 * id, which is out of scope for this experimental integration.
 */
function buildSdkAgent(
  config: LlmConfig,
  id: string,
  name: string,
  instructions: string
): Agent {
  switch (config.provider) {
    case "claude-agent-sdk":
      return new ClaudeSDKAgent({
        id,
        name,
        description: instructions,
        sdkOptions: {
          model: config.model,
          cwd: config.cwd,
          allowedTools: config.allowedTools,
          // This is a headless server: there is no human to answer an
          // interactive tool-approval control-request, so the default
          // 'default' permissionMode (which prompts on tool use) would
          // stall the query() generator forever waiting on an answer that
          // never comes. Bypass permission prompting entirely here;
          // `allowedTools` above remains a separate, complementary
          // allow-list of which tools the agent may use.
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          // The Claude Agent SDK spawns a subprocess whose env REPLACES
          // process.env entirely when set, so inherit it explicitly.
          env: config.apiKey
            ? { ...process.env, ANTHROPIC_API_KEY: config.apiKey }
            : undefined,
        },
      });

    case "cursor-agent-sdk":
      return new CursorSDKAgent({
        id,
        name,
        description: instructions,
        sdkOptions: {
          model: config.model ? { id: config.model } : undefined,
          // Defaults to process.env.CURSOR_API_KEY when omitted.
          apiKey: config.apiKey,
        },
      });

    case "openai-agent-sdk":
      // The OpenAI Agents SDK reads its key from a process-wide default
      // rather than per-agent config.
      if (config.apiKey) setDefaultOpenAIKey(config.apiKey);
      return new OpenAISDKAgent({
        id,
        name,
        description: instructions,
        sdkOptions: {
          name,
          instructions,
          model: config.model,
        },
      });

    default:
      throw new Error(`Not an SDK-agent provider: ${config.provider}`);
  }
}

/**
 * Fetch the list of Claude models available to the given (or process-env)
 * API key, via the Claude Agent SDK's `supportedModels()` control-protocol
 * request. This spins up a short-lived, no-op query session purely to reach
 * into the control channel — no prompt is ever sent to the model — and
 * closes it immediately afterwards.
 */
export async function fetchClaudeSupportedModels(
  apiKey?: string
): Promise<ClaudeModelOption[]> {
  const q = claudeQuery({
    // Empty async generator: never yields a user message, so no request is
    // ever sent to the model — we only need the control channel.
    prompt: (async function* () {})(),
    options: {
      env: apiKey ? { ...process.env, ANTHROPIC_API_KEY: apiKey } : undefined,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  });
  try {
    const models = await q.supportedModels();
    return models.map((m) => ({
      value: m.value,
      resolvedModel: m.resolvedModel,
    }));
  } finally {
    q.close();
  }
}

/**
 * Build provider-specific reasoning/thinking options for a model that supports
 * it. The AI SDK forwards `providerOptions[provider]` as extra request fields,
 * so models without reasoning support simply ignore these.
 */
function buildReasoningProviderOptions(
  config: LlmConfig
): Record<string, Record<string, unknown>> | undefined {
  switch (config.provider) {
    case "anthropic":
      return {
        anthropic: { thinking: { type: "adaptive" } },
      };
    case "google":
      return {
        google: { thinkingConfig: { includeThoughts: true } },
      };
    case "openai":
      return { openai: { reasoningEffort: "medium" } };
    case "openai-compatible":
      // LiteLLM-style passthrough: many gateways accept `reasoning_effort`.
      return { openai: { reasoningEffort: "medium" } };
    default:
      return undefined;
  }
}

const DEFAULT_SYSTEM_PROMPT = `You are VaultysClaw Agent, a secure AI agent controller.
You receive structured tasks (action + parameters) from the VaultysClaw control plane.
Execute the requested action faithfully using the tools available to you.
You MUST use the provided tools to accomplish tasks. Do NOT describe what you would do — actually call the tools.
If a task requires reading files, use the file_read or file_list tool. If it requires running commands, use the shell tool.
Return a concise, structured result after executing tools. Never reveal sensitive data.
Never deviate from the requested action scope.`;

const DEFAULT_CHAT_PROMPT = `You are VaultysClaw Agent, a helpful and secure AI assistant.
Respond to the user's messages thoughtfully and concisely in plain natural language.
For questions, greetings, or simple conversational messages, always reply in plain text — never output raw JSON.
Only use the available tools when the user explicitly requests a concrete action such as reading a file, running code, or fetching data.
Never reveal API keys, secrets, or other sensitive configuration data.`;

/**
 * Execute an agent intent using the configured LLM via Mastra Agent.generate().
 */
export async function runIntent(
  config: LlmConfig,
  action: string,
  params: Record<string, unknown>,
  tools?: Record<string, MastraTool>,
  memoryContext?: string,
  skillExtensions?: string[],
  onStepFinish?: (event: StepFinishEvent) => void | Promise<void>
): Promise<{
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}> {
  const isSdkAgent = isSdkAgentProvider(config.provider);
  const model = isSdkAgent ? undefined : buildModel(config);
  const base = config.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const withMemory = memoryContext ? `${base}\n\n${memoryContext}` : base;
  const instructions = skillExtensions?.length
    ? `${withMemory}\n\n---\n\n${skillExtensions.join("\n\n---\n\n")}`
    : withMemory;

  const hasParams = params && Object.keys(params).length > 0;
  const userMessage = hasParams
    ? `${action}\n\nAdditional context:\n${JSON.stringify(params, null, 2)}`
    : action;

  const hasTools = tools && Object.keys(tools).length > 0;
  if (hasTools && isSdkAgent) {
    logger.warn(
      { provider: config.provider },
      "Ignoring internal tool registry for SDK-agent provider; the vendor harness manages its own tools"
    );
  }

  logger.info(
    {
      provider: config.provider,
      model: config.model,
      action,
      toolCount: hasTools ? Object.keys(tools!).length : 0,
    },
    "Running intent"
  );

  // Extract W3C traceparent injected by the control plane so this span is a child
  const traceContext = (params as any)?._traceContext as Record<string, string> | undefined;
  const parentCtx = traceContext
    ? propagation.extract(context.active(), traceContext)
    : context.active();

  const tracer = trace.getTracer("vaultysclaw-agent");
  const startMs = Date.now();

  return tracer.startActiveSpan(
    "vc.llm.call",
    { attributes: { "llm.model": config.model, "llm.provider": config.provider, "intent.action": action } },
    parentCtx,
    async (span) => {
      try {
        const agent = isSdkAgent
          ? buildSdkAgent(config, "vaultysclaw-intent", "vaultysclaw-intent", instructions)
          : new Agent({
              id: "vaultysclaw-intent",
              name: "vaultysclaw-intent",
              instructions,
              model,
              ...(hasTools ? { tools: tools as Record<string, MastraTool> } : {}),
            });

        const result = await agent.generate(userMessage, {
          maxSteps: 10,
          modelSettings: config.maxTokens
            ? { maxOutputTokens: config.maxTokens }
            : undefined,
          ...(onStepFinish
            ? {
                onStepFinish: async (step: any) => {
                  const event: StepFinishEvent = {
                    text: step.text,
                    finishReason: step.finishReason,
                    // Mastra wraps tool calls as ToolCallChunk: { type, payload: { toolName, toolCallId, args } }
                    // Fall back to flat fields for forward-compat.
                    toolCalls: step.toolCalls?.map((tc: any) => ({
                      toolCallId: tc.payload?.toolCallId ?? tc.toolCallId,
                      toolName: tc.payload?.toolName ?? tc.toolName,
                      args: tc.payload?.args ?? tc.args ?? {},
                    })),
                    toolResults: step.toolResults?.map((tr: any) => ({
                      toolCallId: tr.payload?.toolCallId ?? tr.toolCallId,
                      result: tr.payload?.result ?? tr.result,
                    })),
                  };
                  await onStepFinish(event);
                },
              }
            : {}),
        });

        logger.info(
          {
            action,
            steps: result.steps?.length ?? 0,
            finishReason: result.finishReason,
            textLength: result.text?.length ?? 0,
          },
          "Intent LLM response received"
        );

        // Log the actual usage object structure for debugging
        logger.info(
          {
            usageRaw: result.usage,
            keys: result.usage ? Object.keys(result.usage) : [],
          },
          "Debug: Usage object from runIntent"
        );

        const usage = result.usage as any;
        const promptTokens = usage?.promptTokens ?? usage?.inputTokens ?? 0;
        const completionTokens = usage?.completionTokens ?? usage?.outputTokens ?? 0;

        span.setAttributes({
          "llm.prompt_tokens": promptTokens,
          "llm.completion_tokens": completionTokens,
          "llm.latency_ms": Date.now() - startMs,
        });
        span.end();

        return {
          text: result.text ?? "",
          usage: { promptTokens, completionTokens },
        };
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.end();
        throw new LlmProviderError(config.provider, err);
      }
    }
  );
}

/**
 * Stream a conversational chat response using the configured LLM via Mastra Agent.stream().
 * Returns an object with a textStream AsyncIterable<string>.
 */
export interface StepFinishEvent {
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{ toolCallId: string; result: unknown }>;
  text?: string;
  finishReason?: string;
}

export function streamChat(
  config: LlmConfig,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  tools?: Record<string, MastraTool>,
  onStepFinish?: (event: StepFinishEvent) => void | Promise<void>,
  memoryContext?: string,
  skillExtensions?: string[],
  opts?: { thinking?: boolean }
): {
  textStream: AsyncIterable<string>;
  chunkStream: AsyncIterable<{ text: string; thinking: boolean }>;
  usage: Promise<{ promptTokens: number; completionTokens: number }>;
} {
  const isSdkAgent = isSdkAgentProvider(config.provider);
  const model = isSdkAgent ? undefined : buildModel(config);
  const base = config.systemPrompt?.trim() || DEFAULT_CHAT_PROMPT;
  const withMemory = memoryContext ? `${base}\n\n${memoryContext}` : base;
  const instructions = skillExtensions?.length
    ? `${withMemory}\n\n---\n\n${skillExtensions.join("\n\n---\n\n")}`
    : withMemory;
  const hasTools = tools && Object.keys(tools).length > 0;
  if (hasTools && isSdkAgent) {
    logger.warn(
      { provider: config.provider },
      "Ignoring internal tool registry for SDK-agent provider; the vendor harness manages its own tools"
    );
  }

  logger.info(
    {
      provider: config.provider,
      model: config.model,
      messageCount: messages.length,
      toolCount: hasTools ? Object.keys(tools!).length : 0,
    },
    "Starting chat stream"
  );

  const agent = isSdkAgent
    ? buildSdkAgent(config, "vaultysclaw-chat", "vaultysclaw-chat", instructions)
    : new Agent({
        id: "vaultysclaw-chat",
        name: "vaultysclaw-chat",
        instructions,
        model,
        ...(hasTools ? { tools: tools as Record<string, MastraTool> } : {}),
      });

  // When reasoning is requested, forward a provider-appropriate "thinking"
  // setting. Only models that support reasoning will act on it; others ignore it.
  const reasoningProviderOptions = opts?.thinking
    ? buildReasoningProviderOptions(config)
    : undefined;
  if (opts?.thinking) {
    logger.info(
      { provider: config.provider, model: config.model },
      "Reasoning requested for chat stream"
    );
  }

  // Track token usage across all steps.
  // Prompt tokens are NOT additive: each step re-sends the full context, so
  // we take the max (= largest context window used). Completion tokens ARE
  // additive since each step generates new output.
  let maxPromptTokens = 0;
  let totalCompletionTokens = 0;

  // Track when stream is fully consumed so we know tokens are accumulated
  let streamConsumed = false;
  let resolveStreamDone: () => void;
  const streamDonePromise = new Promise<void>((resolve) => {
    resolveStreamDone = resolve;
  });

  const streamPromise = agent.stream(messages as any, {
    maxSteps: 10,
    modelSettings:
      config.maxTokens || reasoningProviderOptions
        ? {
            ...(config.maxTokens ? { maxOutputTokens: config.maxTokens } : {}),
            ...(reasoningProviderOptions
              ? { providerOptions: reasoningProviderOptions }
              : {}),
          }
        : undefined,
    ...(onStepFinish
      ? {
          onStepFinish: async (step: any) => {
            // Accumulate tokens from this step - try multiple field name conventions
            const promptTokens =
              step.usage?.inputTokens ?? step.usage?.promptTokens ?? 0;
            const completionTokens =
              step.usage?.outputTokens ?? step.usage?.completionTokens ?? 0;
            if (promptTokens > 0 || completionTokens > 0) {
              logger.info(
                { promptTokens, completionTokens, stepIndex: step.stepIndex },
                "Step tokens captured"
              );
            }
            if (promptTokens > maxPromptTokens) maxPromptTokens = promptTokens;
            totalCompletionTokens += completionTokens;

            const event: StepFinishEvent = {
              text: step.text,
              finishReason: step.finishReason,
              // Mastra wraps tool calls as ToolCallChunk: { type, payload: { toolName, toolCallId, args } }
              // Fall back to flat fields for forward-compat.
              toolCalls: step.toolCalls?.map((tc: any) => ({
                toolCallId: tc.payload?.toolCallId ?? tc.toolCallId,
                toolName: tc.payload?.toolName ?? tc.toolName,
                args: tc.payload?.args ?? tc.args ?? {},
              })),
              toolResults: step.toolResults?.map((tr: any) => ({
                toolCallId: tr.payload?.toolCallId ?? tr.toolCallId,
                result: tr.payload?.result ?? tr.result,
              })),
            };
            await onStepFinish(event);
          },
        }
      : {}),
  });

  // Lazy AsyncIterable that resolves the stream on first iteration
  return {
    textStream: {
      [Symbol.asyncIterator]() {
        let innerIter: AsyncIterator<string> | null = null;
        return {
          async next() {
            if (!innerIter) {
              const streamResult = await streamPromise;
              innerIter = streamResult.textStream[Symbol.asyncIterator]();
            }
            const result = await innerIter!.next();
            // Mark stream as consumed when we reach the end
            if (result.done && !streamConsumed) {
              streamConsumed = true;
              resolveStreamDone();
            }
            return result;
          },
          async return() {
            if (!streamConsumed) {
              streamConsumed = true;
              resolveStreamDone();
            }
            return { done: true as const, value: undefined };
          },
        };
      },
    },
    // Yields both text and reasoning content, tagged, sourced from Mastra's
    // fullStream ('text-delta' / 'reasoning-delta' chunks) — this is how
    // Anthropic's structured `thinking` blocks actually surface, as opposed
    // to inline <think> tags (which some local models emit in plain text).
    chunkStream: {
      [Symbol.asyncIterator]() {
        let innerIter: AsyncIterator<any> | null = null;
        return {
          async next(): Promise<
            IteratorResult<{ text: string; thinking: boolean }>
          > {
            for (;;) {
              if (!innerIter) {
                const streamResult = await streamPromise;
                innerIter = (
                  streamResult.fullStream as AsyncIterable<any>
                )[Symbol.asyncIterator]();
              }
              const result = await innerIter!.next();
              if (result.done) {
                if (!streamConsumed) {
                  streamConsumed = true;
                  resolveStreamDone();
                }
                return { done: true as const, value: undefined };
              }
              const chunk = result.value;
              if (chunk?.type === "text-delta" && chunk.payload?.text) {
                return {
                  done: false,
                  value: { text: chunk.payload.text, thinking: false },
                };
              }
              if (chunk?.type === "reasoning-delta" && chunk.payload?.text) {
                return {
                  done: false,
                  value: { text: chunk.payload.text, thinking: true },
                };
              }
              // Skip other chunk types (tool calls, metadata, etc.) and keep pulling.
            }
          },
          async return() {
            if (!streamConsumed) {
              streamConsumed = true;
              resolveStreamDone();
            }
            return { done: true as const, value: undefined };
          },
        };
      },
    },
    usage: streamDonePromise.then(() => {
      logger.info(
        { maxPromptTokens, totalCompletionTokens },
        "Final token usage from stream"
      );
      return {
        promptTokens: maxPromptTokens,
        completionTokens: totalCompletionTokens,
      };
    }),
  };
}
