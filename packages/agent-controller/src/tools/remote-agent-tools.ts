/**
 * Remote agent tool builder.
 *
 * Converts an array of AgentPeerGrants (pushed by the control plane) into
 * Mastra-compatible AgentToolDefinitions that the LLM can call transparently.
 * Each tool is named `ask_agent_<sanitized_name>` and its description is
 * exactly what the control-plane admin wrote as the `skillDescription`.
 *
 * When the LLM invokes the tool, the PeerManager lazily opens an authenticated
 * WebRTC channel to the remote agent, runs the SRP exchange, and returns
 * the result.
 */

import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { AgentPeerGrant } from "@vaultysclaw/shared";
import type { AgentToolDefinition } from "./types";
import type { PeerManager } from "../peer-manager";

/**
 * Convert a human-readable agent name into a safe tool-name suffix.
 * e.g. "Research Bot" → "research_bot"
 */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * Build one AgentToolDefinition for each peer grant.
 *
 * @param peerCatalog  Peer grants received from the control plane.
 * @param peerManager  The PeerManager instance used to invoke remote agents.
 */
export function buildRemoteAgentTools(
  peerCatalog: AgentPeerGrant[],
  peerManager: PeerManager,
): AgentToolDefinition[] {
  return peerCatalog.map((grant) => {
    const toolName = `ask_agent_${sanitizeName(grant.targetName)}`;

    return {
      name: toolName,
      capability: "agent_communication" as const,
      requiresApproval: false,
      tool: createTool({
        id: toolName,
        description: grant.skillDescription,
        inputSchema: z.object({
          action: z.string().describe(
            "The specific action or question to send to the remote agent.",
          ),
          params: z.record(z.string(), z.any()).optional().describe(
            "Optional structured parameters to pass alongside the action.",
          ),
        }),
        execute: async ({ action, params = {} }: { action: string; params?: Record<string, any> }) => {
          try {
            const result = await peerManager.invoke(grant.targetDid, action, params);
            return { success: true, result };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      }),
    } satisfies AgentToolDefinition;
  });
}
