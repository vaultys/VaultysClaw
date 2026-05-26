/**
 * Remote agent tool builder.
 *
 * Converts an array of AgentPeerGrants (pushed by the control plane) into
 * Mastra-compatible AgentToolDefinitions that the LLM can call transparently.
 * Each tool is named `ask_agent_<sanitized_name>` and its description is
 * exactly what the control-plane admin wrote as the `skillDescription`.
 *
 * Two invocation strategies are supported:
 *
 * 1. **Channel-based** (Phase 7): If `grant.channelId` is set and a
 *    `sendWsMessage` function is provided, the calling agent posts an
 *    @mention to the shared channel and polls for the reply via HTTP.
 *
 * 2. **WebRTC** (legacy): Falls back to `peerManager.invoke()` when no
 *    channelId is set or the channel strategy is unavailable.
 */

import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { AgentPeerGrant, WSMessage } from "@vaultysclaw/shared";
import type { AgentToolDefinition } from "./types";
import type { PeerManager } from "../peer-manager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Sleep for `ms` milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Channel-based invocation
// ---------------------------------------------------------------------------

interface ChannelMessage {
  id: string;
  threadId: string | null;
  authorDid: string;
  authorType: string;
  content: string;
  createdAt: string;
}

/**
 * Poll `GET /api/channels/{channelId}/messages?threadId={threadId}` until a
 * non-invoker reply appears or the timeout is reached.
 * Returns the content of the first reply, or null on timeout.
 */
async function pollForReply(
  controlPlaneBaseUrl: string,
  channelId: string,
  threadId: string,
  invokerDid: string,
  timeoutMs = 60_000,
  pollIntervalMs = 2_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    try {
      const res = await fetch(
        `${controlPlaneBaseUrl}/api/channels/${channelId}/messages?threadId=${encodeURIComponent(threadId)}&limit=20`,
      );

      if (!res.ok) continue;

      const data = (await res.json()) as { messages?: ChannelMessage[] };
      const messages = data.messages ?? [];

      const reply = messages.find(
        (m) => m.authorDid !== invokerDid && m.threadId === threadId,
      );

      if (reply) return reply.content;
    } catch {
      // Network hiccup — keep polling
    }
  }

  return null;
}

/**
 * Post a message to a VaultysClaw channel via HTTP.
 * Returns the created message ID, or null on failure.
 */
async function postChannelMessage(
  controlPlaneBaseUrl: string,
  channelId: string,
  content: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${controlPlaneBaseUrl}/api/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { message?: { id?: string } };
    return data.message?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build one AgentToolDefinition for each peer grant.
 * Uses channel-based invocation when `grant.channelId` is present and
 * `options.controlPlaneBaseUrl` is configured; otherwise falls back to WebRTC.
 *
 * @param peerCatalog     Peer grants received from the control plane.
 * @param peerManager     Legacy WebRTC PeerManager (used as fallback).
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

/**
 * Build channel-based agent tools (Phase 7).
 *
 * When a grant has `channelId` set, the tool posts an @mention to that shared
 * channel and polls the thread for the remote agent's reply.  Falls back to
 * the WebRTC peerManager for grants without a channelId.
 *
 * @param peerCatalog          Peer grants received from the control plane.
 * @param sendWsMessage        Function to send a WS message (for channel posting fallback).
 * @param controlPlaneBaseUrl  HTTP base URL of the control plane (e.g. "http://localhost:3000").
 * @param agentDid             DID of the calling agent (to filter out self-replies when polling).
 * @param peerManagerFallback  Optional WebRTC PeerManager for grants without channelId.
 */
export function buildChannelAgentTools(
  peerCatalog: AgentPeerGrant[],
  sendWsMessage: (msg: WSMessage) => void,
  controlPlaneBaseUrl: string,
  agentDid: string,
  peerManagerFallback?: PeerManager,
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
          // Channel-based invocation
          if (grant.channelId) {
            const content = `@${grant.targetName} ${action}${
              Object.keys(params).length > 0 ? "\n" + JSON.stringify(params, null, 2) : ""
            }`;

            try {
              // Post the message to the shared channel via HTTP
              const messageId = await postChannelMessage(
                controlPlaneBaseUrl,
                grant.channelId,
                content,
              );

              if (!messageId) {
                return {
                  success: false,
                  error: "Failed to post message to shared channel",
                };
              }

              // Also send via WS so the control plane dispatcher can pick it up immediately
              sendWsMessage({
                messageId: crypto.randomUUID(),
                type: "channel_message_send",
                payload: {
                  channelId: grant.channelId,
                  content,
                  threadId: null,
                },
                timestamp: new Date().toISOString(),
              });

              // Poll the thread for the remote agent's reply
              const reply = await pollForReply(
                controlPlaneBaseUrl,
                grant.channelId,
                messageId,
                agentDid,
              );

              if (reply === null) {
                return {
                  success: false,
                  error: "Remote agent did not respond within timeout",
                  channelId: grant.channelId,
                  messageId,
                };
              }

              return { success: true, result: reply, channelId: grant.channelId, messageId };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }

          // WebRTC fallback
          if (peerManagerFallback) {
            try {
              const result = await peerManagerFallback.invoke(grant.targetDid, action, params);
              return { success: true, result };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }

          return {
            success: false,
            error: "No invocation strategy available: grant has no channelId and no PeerManager",
          };
        },
      }),
    } satisfies AgentToolDefinition;
  });
}
