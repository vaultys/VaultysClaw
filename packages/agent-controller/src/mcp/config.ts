/**
 * MCP servers config — same shape as Claude Desktop / Claude Code's
 * `mcpServers` map, so users can drop in configs from either without
 * translation.
 *
 * Example (~/.vaultysclaw/mcp-servers.json):
 * {
 *   "mcpServers": {
 *     "fetch":  { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-fetch"] },
 *     "remote": { "url": "https://example.com/mcp" }
 *   }
 * }
 *
 * Stdio servers (`command`) are "downloaded" the same way `npx` always
 * resolves packages: on first connect, npx fetches the package from the
 * registry (or the local cache) before running it — there's no separate
 * install step.
 */

import fs from "fs";
import path from "path";
import os from "os";

export interface StdioMcpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface RemoteMcpServerConfig {
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = StdioMcpServerConfig | RemoteMcpServerConfig;

export function isStdioMcpServerConfig(
  config: McpServerConfig
): config is StdioMcpServerConfig {
  return "command" in config && typeof config.command === "string";
}

export function defaultMcpServersPath(): string {
  return path.join(os.homedir(), ".vaultysclaw", "mcp-servers.json");
}

/**
 * Load and validate the mcpServers map from disk. Returns an empty map if
 * the file doesn't exist — MCP servers are opt-in.
 */
export function loadMcpServersConfig(
  configPath?: string
): Record<string, McpServerConfig> {
  const resolvedPath = configPath ?? defaultMcpServersPath();
  if (!fs.existsSync(resolvedPath)) return {};

  const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
  const servers = raw?.mcpServers;
  if (!servers || typeof servers !== "object") return {};

  const result: Record<string, McpServerConfig> = {};
  for (const [name, def] of Object.entries(servers as Record<string, any>)) {
    if (!def || typeof def !== "object") continue;
    if (typeof def.command === "string") {
      result[name] = {
        command: def.command,
        args: Array.isArray(def.args) ? def.args.map(String) : undefined,
        env:
          def.env && typeof def.env === "object"
            ? Object.fromEntries(
                Object.entries(def.env).map(([k, v]) => [k, String(v)])
              )
            : undefined,
      };
    } else if (typeof def.url === "string") {
      result[name] = {
        url: def.url,
        headers:
          def.headers && typeof def.headers === "object"
            ? Object.fromEntries(
                Object.entries(def.headers).map(([k, v]) => [k, String(v)])
              )
            : undefined,
      };
    }
  }
  return result;
}
