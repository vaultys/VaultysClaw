/**
 * LLM integration module — powered by Mastra (@mastra/core).
 */

import { Agent } from "@mastra/core/agent";
import { createOllama } from "ollama-ai-provider-v2";
import { createOpenAI } from "@ai-sdk/openai";
import type { LlmConfig } from "@vaultysclaw/shared";
import type { MastraTool } from "@mastra/core/tools";
import pino from "pino";

const logger = pino({ name: "llm" });

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
      return `anthropic/${config.model}`;

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
      const client = createOpenAI({
        apiKey: config.apiKey ?? "not-required",
        baseURL: config.baseUrl,
        compatibility: "compatible",
      });
      return client.chat(config.model);
    }

    default: {
      throw new Error(`Unknown LLM provider: ${(config as any).provider}`);
    }
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
Answer the user's questions thoughtfully and concisely.
When the user asks you to perform an action, use the available tools to accomplish it.
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
): Promise<{ text: string; usage: { promptTokens: number; completionTokens: number } }> {
  const model = buildModel(config);
  const base = config.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const instructions = memoryContext ? `${base}\n\n${memoryContext}` : base;

  const hasParams = params && Object.keys(params).length > 0;
  const userMessage = hasParams
    ? `${action}\n\nAdditional context:\n${JSON.stringify(params, null, 2)}`
    : action;

  const hasTools = tools && Object.keys(tools).length > 0;

  logger.info(
    { provider: config.provider, model: config.model, action, toolCount: hasTools ? Object.keys(tools!).length : 0 },
    "Running intent",
  );

  try {
    const agent = new Agent({
      name: "vaultysclaw-intent",
      instructions,
      model,
      ...(hasTools ? { tools: tools as Record<string, MastraTool> } : {}),
    });

    const result = await agent.generate(userMessage, {
      maxSteps: 10,
      modelSettings: config.maxTokens ? { maxOutputTokens: config.maxTokens } : undefined,
    });

    logger.info(
      { action, steps: result.steps?.length ?? 0, finishReason: result.finishReason, textLength: result.text?.length ?? 0 },
      "Intent LLM response received",
    );

    // Log the actual usage object structure for debugging
    logger.info(
      { usageRaw: result.usage, keys: result.usage ? Object.keys(result.usage) : [] },
      "Debug: Usage object from runIntent",
    );

    return {
      text: result.text ?? "",
      usage: {
        promptTokens: result.usage?.promptTokens ?? result.usage?.inputTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? result.usage?.outputTokens ?? 0,
      },
    };
  } catch (err) {
    throw new LlmProviderError(config.provider, err);
  }
}

/**
 * Stream a conversational chat response using the configured LLM via Mastra Agent.stream().
 * Returns an object with a textStream AsyncIterable<string>.
 */
export interface StepFinishEvent {
  toolCalls?: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }>;
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
): { textStream: AsyncIterable<string>; usage: Promise<{ promptTokens: number; completionTokens: number }> } {
  const model = buildModel(config);
  const base = config.systemPrompt?.trim() || DEFAULT_CHAT_PROMPT;
  const instructions = memoryContext ? `${base}\n\n${memoryContext}` : base;
  const hasTools = tools && Object.keys(tools).length > 0;

  logger.info(
    { provider: config.provider, model: config.model, messageCount: messages.length, toolCount: hasTools ? Object.keys(tools!).length : 0 },
    "Starting chat stream"
  );

  const agent = new Agent({
    name: "vaultysclaw-chat",
    instructions,
    model,
    ...(hasTools ? { tools: tools as Record<string, MastraTool> } : {}),
  });

  // Accumulate token usage from all steps
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  // Track when stream is fully consumed so we know tokens are accumulated
  let streamConsumed = false;
  let resolveStreamDone: () => void;
  const streamDonePromise = new Promise<void>((resolve) => {
    resolveStreamDone = resolve;
  });

  const streamPromise = agent.stream(messages as any, {
    maxSteps: 10,
    modelSettings: config.maxTokens ? { maxOutputTokens: config.maxTokens } : undefined,
    ...(onStepFinish ? {
      onStepFinish: async (step: any) => {
        // Accumulate tokens from this step - try multiple field name conventions
        const promptTokens = step.usage?.inputTokens ?? step.usage?.promptTokens ?? 0;
        const completionTokens = step.usage?.outputTokens ?? step.usage?.completionTokens ?? 0;
        if (promptTokens > 0 || completionTokens > 0) {
          logger.info(
            { promptTokens, completionTokens, stepIndex: step.stepIndex },
            "Step tokens captured",
          );
        }
        totalPromptTokens += promptTokens;
        totalCompletionTokens += completionTokens;

        const event: StepFinishEvent = {
          text: step.text,
          finishReason: step.finishReason,
          toolCalls: step.toolCalls?.map((tc: any) => ({
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.args ?? {},
          })),
          toolResults: step.toolResults?.map((tr: any) => ({
            toolCallId: tr.toolCallId,
            result: tr.result,
          })),
        };
        await onStepFinish(event);
      },
    } : {}),
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
    usage: streamDonePromise.then(() => {
      logger.info(
        { totalPromptTokens, totalCompletionTokens },
        "Final token usage from stream",
      );
      return {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
      };
    }),
  };
}
