/**
 * McpGatewayAgent — the VaultysClaw agent side of the gateway.
 *
 * Registers with the control plane like any other agent, but delegates all
 * LLM inference to the MCP host via `sampling/createMessage` instead of
 * calling a provider directly (see `requestSampling`).
 */

import path from "path";
import os from "os";
import fs from "fs";
import type { ChatMessageEntry } from "@vaultysclaw/shared";
import { BaseAgentRuntime, type AgentStatus } from "@vaultysclaw/agent-runtime";

export type RequestSampling = (
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number
) => Promise<{ text: string; model?: string; stopReason?: string }>;

export function buildAgentConfig() {
  const controlPlaneUrl = process.env.VC_CONTROL_PLANE_URL ?? "http://localhost:3000";

  let controlPlaneWsUrl = process.env.VC_CONTROL_PLANE_WS_URL;
  if (!controlPlaneWsUrl) {
    const url = new URL(controlPlaneUrl);
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    controlPlaneWsUrl = `${proto}//${url.hostname}:8080`;
  }

  const vaultysIdPath =
    process.env.VC_VAULTYS_ID_PATH ?? path.join(os.homedir(), ".vaultysclaw", "mcp-gateway.id");

  const idDir = path.dirname(vaultysIdPath);
  if (!fs.existsSync(idDir)) fs.mkdirSync(idDir, { recursive: true });

  const peerjsControlPlaneId = process.env.VC_PEERJS_CONTROL_PLANE_ID || undefined;
  const peerjsServerUrl = process.env.VC_PEERJS_SERVER_URL || undefined;

  return {
    name: process.env.VC_AGENT_NAME ?? "mcp-gateway",
    controlPlaneUrl,
    controlPlaneWsUrl,
    peerjsControlPlaneId,
    peerjsServerUrl,
    llmConfig: null,
    vaultysIdPath,
    requestedCapabilities: ["agent_communication"] as any[],
    workspaceRoot: process.cwd(),
  };
}

export class McpGatewayAgent extends BaseAgentRuntime {
  constructor(
    config: ReturnType<typeof buildAgentConfig>,
    private readonly requestSampling: RequestSampling,
    private readonly logStderr: (...args: unknown[]) => void
  ) {
    super(config);
  }

  async executeIntent(
    action: string,
    params: Record<string, unknown>,
    _callerDid?: string,
    intentId?: string
  ): Promise<unknown> {
    const prompt =
      typeof params.prompt === "string" ? params.prompt :
      typeof params.message === "string" ? params.message :
      typeof params.text === "string" ? params.text :
      `${action} ${JSON.stringify(params)}`;
    return this.handleViaSampling(
      [{ role: "user", content: prompt }],
      intentId ?? `intent-${Date.now()}`
    );
  }

  async executeChat(
    messages: ChatMessageEntry[],
    conversationId: string,
    sendChunk: (chunk: string, done?: boolean) => void
  ): Promise<void> {
    const text = await this.handleViaSampling(messages, conversationId);
    sendChunk(text, true);
  }

  private async handleViaSampling(messages: ChatMessageEntry[], id: string): Promise<string> {
    this.logStderr(`[INFO] Sampling request for conversation ${id} (${messages.length} messages)`);

    const samplingMessages = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    if (samplingMessages.length === 0) return "(no messages)";

    const result = await this.requestSampling(samplingMessages, 8096);

    this.logStderr(`[INFO] Sampling response for ${id}: model=${result.model}, stopReason=${result.stopReason}`);

    return result.text;
  }
}

/**
 * Resolve once the agent reaches "connected", or once `timeoutMs` elapses.
 * Used so a tool call arriving during a transient reconnect (backoff already
 * handled by BaseAgentRuntime) waits instead of failing immediately.
 */
export function waitForConnected(
  agent: BaseAgentRuntime,
  timeoutMs: number
): Promise<{ connected: boolean; status: AgentStatus }> {
  if (agent.getStatus() === "connected") {
    return Promise.resolve({ connected: true, status: "connected" });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      agent.off("status_changed", onStatus);
      resolve({ connected: false, status: agent.getStatus() });
    }, timeoutMs);

    const onStatus = ({ status }: { status: AgentStatus }) => {
      if (status === "connected") {
        clearTimeout(timer);
        agent.off("status_changed", onStatus);
        resolve({ connected: true, status });
      }
    };
    agent.on("status_changed", onStatus);
  });
}
