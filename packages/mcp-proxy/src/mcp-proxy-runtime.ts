/**
 * This package's control-plane connection. A thin BaseAgentRuntime subclass,
 * structurally identical to @vaultysclaw/proxy's ProxyRuntime — it's a
 * standalone agent with its own VaultysId and onboarding, distinct from any
 * HTTP proxy that may also be connected to the same control plane. Never
 * executes intents or chat; its job is receiving config pushes and
 * reporting activity for the requests it forwards over MCP.
 */
import { BaseAgentRuntime, type AgentRuntimeConfig } from "@vaultysclaw/sdk";
import type {
  ChatMessageEntry,
  WSProxyConfigPayload,
  ProxyActivityLogEntryPayload,
} from "@vaultysclaw/shared";
import type { LocalDb } from "@vaultysclaw/proxy";

export class McpProxyRuntime extends BaseAgentRuntime {
  constructor(
    config: AgentRuntimeConfig,
    private readonly localDb: LocalDb
  ) {
    super({ ...config, kind: "proxy" });
  }

  async executeIntent(): Promise<unknown> {
    throw new Error("MCP proxies do not execute intents");
  }

  async executeChat(
    _messages: ChatMessageEntry[],
    _conversationId: string,
    sendChunk: (
      chunk: string,
      done?: boolean,
      isError?: boolean,
      errorCode?: "llm_unavailable" | "llm_error" | "agent_offline"
    ) => void
  ): Promise<void> {
    sendChunk("MCP proxies do not support chat", true, true, "llm_error");
  }

  protected async onProxyConfig(payload: WSProxyConfigPayload): Promise<void> {
    this.localDb.saveConfig(payload);
    this.log(
      "info",
      `Proxy config updated: ${payload.upstreams.length} upstream(s), ` +
        `${payload.rules.length} rule(s), ${payload.principals.length} principal(s)`
    );
  }

  /** Fire-and-forget batch report of recent activity-log entries. */
  reportActivityLog(entries: ProxyActivityLogEntryPayload[]): void {
    if (entries.length === 0) return;
    this.send({
      messageId: `mcp-proxy-log-${Date.now()}`,
      type: "proxy_activity_log",
      payload: { entries },
      timestamp: new Date().toISOString(),
    });
  }

  /** Public wrapper over the protected `log()` for use outside the class. */
  reportError(message: string, err?: unknown): void {
    this.log("error", message, err);
  }
}
