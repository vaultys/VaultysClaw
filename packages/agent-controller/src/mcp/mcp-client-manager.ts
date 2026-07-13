/**
 * MCP client manager — connects to externally-declared MCP servers (see
 * ./config.ts) and exposes their tools to the agent's tool registry as
 * regular AgentToolDefinition entries.
 *
 * Stdio servers are spawned as child processes (e.g. `npx -y <package>`,
 * which downloads the package on first run — no separate install step).
 * Remote servers connect over Streamable HTTP.
 *
 * MCP tools can perform arbitrary side effects on behalf of a third-party
 * server, so they're gated behind "system_command" (same capability/approval
 * bar as the shell tool) rather than a narrower one.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AgentToolDefinition, MastraTool } from "../tools/types";
import {
  isStdioMcpServerConfig,
  type McpServerConfig,
} from "./config";

/** Sanitize a server/tool name pair into a valid tool identifier. */
function toolName(serverName: string, remoteToolName: string): string {
  return `mcp_${serverName}_${remoteToolName}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

export interface McpConnection {
  serverName: string;
  client: Client;
}

export class McpClientManager {
  private connections: McpConnection[] = [];

  /**
   * Connect to every configured MCP server and return one AgentToolDefinition
   * per tool the servers advertise. A server that fails to connect is logged
   * and skipped — one broken server config must never block agent startup.
   */
  async connectAll(
    servers: Record<string, McpServerConfig>,
    log: (level: "info" | "warn" | "error", msg: string) => void = () => {}
  ): Promise<AgentToolDefinition[]> {
    const allTools: AgentToolDefinition[] = [];

    for (const [serverName, config] of Object.entries(servers)) {
      try {
        const client = new Client({ name: `vaultysclaw-agent`, version: "0.0.1" });
        const transport = isStdioMcpServerConfig(config)
          ? new StdioClientTransport({
              command: config.command,
              args: config.args ?? [],
              env: config.env,
            })
          : new StreamableHTTPClientTransport(new URL(config.url), {
              requestInit: config.headers ? { headers: config.headers } : undefined,
            });

        await client.connect(transport);
        this.connections.push({ serverName, client });

        const { tools } = await client.listTools();
        for (const remoteTool of tools) {
          allTools.push(this.wrapRemoteTool(serverName, client, remoteTool));
        }
        log(
          "info",
          `MCP server "${serverName}" connected — ${tools.length} tool(s)`
        );
      } catch (err) {
        log(
          "warn",
          `MCP server "${serverName}" failed to connect: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return allTools;
  }

  private wrapRemoteTool(
    serverName: string,
    client: Client,
    remoteTool: { name: string; description?: string; inputSchema?: unknown }
  ): AgentToolDefinition {
    const tool: MastraTool = {
      id: toolName(serverName, remoteTool.name),
      description:
        remoteTool.description ?? `Tool "${remoteTool.name}" from MCP server "${serverName}"`,
      inputSchema: remoteTool.inputSchema,
      execute: async (input: Record<string, unknown>) => {
        const result = await client.callTool({
          name: remoteTool.name,
          arguments: input,
        });
        return result;
      },
    };

    return {
      name: toolName(serverName, remoteTool.name),
      capability: "system_command",
      requiresApproval: true,
      tool,
    };
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(
      this.connections.map((c) => c.client.close().catch(() => {}))
    );
    this.connections = [];
  }
}
