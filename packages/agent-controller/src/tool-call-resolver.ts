/**
 * Tool-call resolution for small model compatibility.
 *
 * Small local models (e.g. llama3.2, qwen3) often fail to use the structured
 * tool-calling API reliably:
 *   - They may output tool calls as plain JSON text instead of API calls
 *   - They may send tool calls with undefined/missing args (AI SDK skips execution)
 *   - They may finish with finishReason "tool-calls" without generating a text summary
 *
 * This module provides three pure, independently testable functions that handle
 * these cases in a single pipeline (`resolveToolResults`).
 */

import pino from "pino";
import type { ToolSet } from "ai";

const logger = pino({ name: "tool-resolver" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  result: unknown;
}

/** Minimal shape of an AI SDK generateText step (using `any` to avoid version coupling). */
export interface GenerateStep {
  toolCalls?: Array<{ toolName: string; args?: unknown }>;
  toolResults?: Array<{ toolName: string; result?: unknown; output?: unknown }>;
}

export interface GenerateOutput {
  text: string;
  steps?: GenerateStep[];
  finishReason?: string;
}

// ---------------------------------------------------------------------------
// parseTextToolCall — pure, no side effects
// ---------------------------------------------------------------------------

/**
 * Try to extract a tool call from a plain-text model response.
 *
 * Handles common formats:
 *   { "name": "tool_name", "parameters": {...} }
 *   { "tool": "tool_name", "arguments": {...} }
 *   { "function": "tool_name", "args": {...} }
 *   Optionally wrapped in ```json ... ``` markdown blocks.
 *
 * Returns a parsed tool call if a known tool name is found, or null.
 *
 * @param text       Raw text from the LLM response.
 * @param toolNames  Set of valid tool names to match against.
 */
export function parseTextToolCall(
  text: string,
  toolNames: Set<string>
): ParsedToolCall | null {
  if (!text?.trim()) return null;

  // Extract JSON — try in order:
  // 1. Code-fenced block (```json ... ```)
  // 2. Full trimmed text (model output may be bare JSON)
  // 3. First `{...}` occurrence with greedy matching
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  const bare = text.match(/(\{[\s\S]*\})/);
  const jsonStr = fenced ? fenced[1] : bare ? bare[1] : text.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  const toolName = (parsed.name ?? parsed.tool ?? parsed.function) as
    | string
    | undefined;
  if (!toolName || typeof toolName !== "string" || !toolNames.has(toolName))
    return null;

  const args = (parsed.parameters ??
    parsed.arguments ??
    parsed.args ??
    parsed.input ??
    {}) as Record<string, unknown>;

  return { toolName, args };
}

// ---------------------------------------------------------------------------
// executeToolCall — single tool execution
// ---------------------------------------------------------------------------

/**
 * Execute a single named tool from a ToolSet.
 *
 * Returns a ToolResult on success or `{ error: string }` on failure.
 * Never throws.
 */
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  tools: ToolSet
): Promise<ToolResult> {
  const tool = tools[toolName];
  if (!tool || typeof tool.execute !== "function") {
    logger.warn(
      { toolName, available: Object.keys(tools) },
      "executeToolCall: unknown tool"
    );
    return { tool: toolName, result: { error: `Unknown tool: ${toolName}` } };
  }

  try {
    const result = tool.execute
      ? await (tool.execute as any)(args, {})
      : undefined;
    return { tool: toolName, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ toolName, error: msg }, "executeToolCall: execution failed");
    return { tool: toolName, result: { error: msg } };
  }
}

// ---------------------------------------------------------------------------
// resolveToolResults — main entry point
// ---------------------------------------------------------------------------

/**
 * Resolve the final result text from a `generateText` output.
 *
 * Call this when `result.text` is empty. Handles three fallback cases in order:
 *
 * 1. **Tool results present** — the AI SDK ran tools and has results. Collect them.
 * 2. **Tool calls but no results** — the AI SDK skipped execution (invalid args from
 *    small models). Execute the tools manually with the available args (schema defaults
 *    like `path: "."` will kick in).
 * 3. **Text looks like a tool call** — the model output JSON instead of using the API.
 *    Parse and execute it.
 *
 * Returns a JSON string of tool results, or an empty string if nothing could be resolved.
 */
export async function resolveToolResults(
  output: GenerateOutput,
  tools: ToolSet
): Promise<string> {
  const steps = output.steps ?? [];
  const allToolCalls = steps.flatMap((s) => s.toolCalls ?? []);
  const allToolResults = steps.flatMap((s) => s.toolResults ?? []);
  const toolNames = new Set(Object.keys(tools));

  // Case 1: AI SDK executed tools and returned results
  if (allToolResults.length > 0) {
    logger.info(
      { toolResultCount: allToolResults.length },
      "resolveToolResults: using AI SDK tool results"
    );
    return JSON.stringify(
      allToolResults.map((tr) => ({
        tool: tr.toolName,
        result: tr.result ?? tr.output,
      }))
    );
  }

  // Case 2: Tool calls present but no results (AI SDK skipped due to invalid/missing args)
  if (allToolCalls.length > 0) {
    logger.info(
      {
        toolCallCount: allToolCalls.length,
        toolCalls: allToolCalls.map((tc) => tc.toolName),
      },
      "resolveToolResults: tool calls have no results — executing with available args"
    );
    const results: ToolResult[] = [];
    for (const tc of allToolCalls) {
      const args =
        tc.args && typeof tc.args === "object"
          ? (tc.args as Record<string, unknown>)
          : {};
      results.push(await executeToolCall(tc.toolName, args, tools));
    }
    return JSON.stringify(results);
  }

  // Case 3: No tool calls at all — check if the text itself is a tool call JSON
  if (output.text) {
    const parsed = parseTextToolCall(output.text, toolNames);
    if (parsed) {
      logger.info(
        { toolName: parsed.toolName, args: parsed.args },
        "resolveToolResults: executing tool call from text output"
      );
      const result = await executeToolCall(parsed.toolName, parsed.args, tools);
      return JSON.stringify([result]);
    }
  }

  return "";
}
