/**
 * Tool system types for the agent controller.
 *
 * Each AgentTool wraps an AI SDK Tool definition and maps it to a
 * required capability. Tools that modify the system (shell, file writes,
 * code execution) require approval by default.
 */

import type { MastraTool } from "@mastra/core/tools";
import type { AgentCapability } from "@vaultysclaw/shared";

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export interface AgentToolDefinition<INPUT = any, OUTPUT = any> {
  /** Unique tool name (used as key in the ToolSet passed to the AI SDK). */
  name: string;
  /** Which capability must be granted for this tool to be available. */
  capability: AgentCapability;
  /** If true, execution pauses until an admin approves via the control plane. */
  requiresApproval: boolean;
  /** The Mastra Tool object (id, description, inputSchema, outputSchema, execute). */
  tool: MastraTool;
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export interface ToolRegistry {
  /** All registered tool definitions. */
  readonly tools: ReadonlyArray<AgentToolDefinition>;
  /** Look up a tool by name. */
  get(name: string): AgentToolDefinition | undefined;
  /** Return only tools whose capability is in the granted set. */
  forCapabilities(capabilities: AgentCapability[]): AgentToolDefinition[];
}

// ---------------------------------------------------------------------------
// Approval gate callback
// ---------------------------------------------------------------------------

/**
 * Called when a tool with `requiresApproval` is invoked.
 * The agent pauses execution and waits for the returned promise to resolve.
 *   - Resolves `true`  → tool executes normally.
 *   - Resolves `false` → tool returns a "rejected by admin" message.
 */
export type ApprovalCallback = (request: ApprovalRequest) => Promise<boolean>;

export interface ApprovalRequest {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tool execution result (for logging / WS events)
// ---------------------------------------------------------------------------

export interface ToolExecutionEvent {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  approved?: boolean;
  durationMs: number;
}
