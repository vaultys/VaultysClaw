/**
 * Tool registry — collects built-in tools and provides lookup/filtering.
 *
 * Usage:
 *   const registry = createToolRegistry({ workspaceRoot: "/home/agent/workspace" });
 *   const tools = registry.forCapabilities(["system_command", "file_access"]);
 */

import type { AgentCapability } from "@vaultysclaw/shared";
import type { AgentToolDefinition, ToolRegistry, ApprovalCallback } from "./types";
import type { MastraTool } from "@mastra/core/tools";
import { shellTool } from "./shell";
import { httpRequestTool } from "./http-request";
import { createFileTools } from "./file-ops";
import { codeRunnerTool } from "./code-runner";
import { logToolUsage } from "../db";

export { type AgentToolDefinition, type ToolRegistry, type ApprovalCallback, type ApprovalRequest, type ToolExecutionEvent } from "./types";

// ---------------------------------------------------------------------------
// Registry implementation
// ---------------------------------------------------------------------------

class ToolRegistryImpl implements ToolRegistry {
  private readonly _tools: AgentToolDefinition[];
  private readonly byName: Map<string, AgentToolDefinition>;

  constructor(tools: AgentToolDefinition[]) {
    this._tools = tools;
    this.byName = new Map(tools.map((t) => [t.name, t]));
  }

  get tools(): ReadonlyArray<AgentToolDefinition> {
    return this._tools;
  }

  get(name: string): AgentToolDefinition | undefined {
    return this.byName.get(name);
  }

  forCapabilities(capabilities: AgentCapability[]): AgentToolDefinition[] {
    const capSet = new Set(capabilities);
    return this._tools.filter((t) => capSet.has(t.capability));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface RegistryOptions {
  /** Root directory for file operations. Defaults to cwd. */
  workspaceRoot?: string;
  /** Additional tool definitions (from plugins/skills). */
  extraTools?: AgentToolDefinition[];
}

/**
 * Create a tool registry with all built-in tools + any extras.
 */
export function createToolRegistry(options: RegistryOptions = {}): ToolRegistry {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();

  const builtIn: AgentToolDefinition[] = [
    shellTool,
    httpRequestTool,
    // Also expose http_request under "internet_access" so either capability grants HTTP access
    { ...httpRequestTool, capability: "internet_access" },
    ...createFileTools(workspaceRoot),
    codeRunnerTool,
  ];

  const all = [...builtIn, ...(options.extraTools ?? [])];
  return new ToolRegistryImpl(all);
}

// ---------------------------------------------------------------------------
// Convert to Mastra-compatible tool map (with optional approval gate)
// ---------------------------------------------------------------------------

/**
 * Build a Mastra-compatible tool map from the registry, filtered by granted capabilities.
 * When an approval callback is provided, tools that require approval will
 * pause execution and wait for the callback to resolve.
 */
export function buildToolSet(
  registry: ToolRegistry,
  capabilities: AgentCapability[],
  approvalCallback?: ApprovalCallback,
): Record<string, MastraTool> {
  const defs = registry.forCapabilities(capabilities);
  const toolSet: Record<string, MastraTool> = {};

  for (const def of defs) {
    const originalTool = def.tool;
    if (def.requiresApproval && approvalCallback) {
      // Wrap execute with approval gate
      toolSet[def.name] = {
        ...originalTool,
        execute: async (args: any, options: any) => {
          const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const approved = await approvalCallback({
            requestId,
            toolName: def.name,
            args: args as Record<string, unknown>,
          });

          if (!approved) {
            try { logToolUsage(def.name, args as Record<string, unknown>, false, 0); } catch { /* DB may not be initialized */ }
            return { error: "Tool execution rejected by administrator", approved: false };
          }

          const start = Date.now();
          try {
            const result = await originalTool.execute!(args, options);
            try { logToolUsage(def.name, args as Record<string, unknown>, true, Date.now() - start); } catch { /* DB may not be initialized */ }
            return result;
          } catch (err) {
            try { logToolUsage(def.name, args as Record<string, unknown>, false, Date.now() - start); } catch { /* DB may not be initialized */ }
            throw err;
          }
        },
      } as any;
    } else {
      // Wrap non-approval tools for usage logging
      toolSet[def.name] = {
        ...originalTool,
        execute: async (args: any, options: any) => {
          const start = Date.now();
          try {
            const result = await originalTool.execute!(args, options);
            try { logToolUsage(def.name, args as Record<string, unknown>, true, Date.now() - start); } catch { /* DB may not be initialized */ }
            return result;
          } catch (err) {
            try { logToolUsage(def.name, args as Record<string, unknown>, false, Date.now() - start); } catch { /* DB may not be initialized */ }
            throw err;
          }
        },
      } as any;
    }
  }

  return toolSet;
}
