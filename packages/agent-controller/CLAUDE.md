# packages/agent-controller

Agent runtime: WebSocket client, LLM execution, tools, skills, memory. Connects to the control plane on port 8080.

## Key Files

- **`src/agent.ts`** — `AgentController` (EventEmitter): WebSocket client, auth challenge/response, task queue, scheduler, peer manager, memory store
- **`src/cli.ts`** — CLI entry point; modes: `headless` | `tui` (Ink terminal) | `web` (Vite SPA on port 3002)
- **`src/llm.ts`** — LLM invocation via Mastra (@mastra/core) + @ai-sdk/openai + ollama-ai-provider-v2; supports OpenAI, Anthropic, Google, Ollama. `streamChat` accepts `{ thinking }`: when set it forwards a provider-appropriate reasoning request via `buildReasoningProviderOptions` (Anthropic `thinking`, Google `thinkingConfig`, OpenAI/openai-compatible `reasoningEffort`). Models without reasoning support ignore it.
- **`src/tools/`** — Built-in tools: file ops, shell, code runner, HTTP requests, remote-agent calls
- **`src/skills/`** — Plugin-based skill loading; skills auto-discovered by `src/skills/loader.ts`
- **`src/mcp/`** — MCP *client*: connects to externally-declared MCP servers and exposes their tools (see below)
- **`src/memory/`** — Semantic memory: SQLite persistence, vector-based retrieval, LLM summarization

**Agent SQLite** (`agent.db`): delegation certs, peer grants, LLM config, token usage, chat sessions, task history.

## Adding a Tool

1. Create `src/tools/<name>.ts`, export a tool definition with a Zod schema
2. Register it in `src/tools/index.ts`

## MCP Servers (client)

`src/mcp/` lets an agent connect to external MCP servers and use their tools, the same
way Claude Desktop/Code do — **not** to be confused with `packages/mcp-gateway`, which
exposes VaultysClaw agents *as* an MCP server for other clients.

Declare servers in `~/.vaultysclaw/mcp-servers.json` (override the path with
`MCP_SERVERS_PATH` or `AgentControllerConfig.mcpServersPath`), using the same
`mcpServers` map shape as Claude Desktop's config:

```json
{
  "mcpServers": {
    "fetch":  { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-fetch"] },
    "remote": { "url": "https://example.com/mcp" }
  }
}
```

Stdio servers (`command`) are spawned as child processes — `npx -y <package>` downloads
the package on first connect, no separate install step. Remote servers (`url`) connect
over Streamable HTTP.

`Agent.loadSkills()` calls `McpClientManager.connectAll()` once at startup, and every
tool each server advertises is added to the tool registry (see `rebuildToolRegistry()`),
named `mcp_<server>_<tool>`. A server that fails to connect is logged and skipped —
it never blocks agent startup. MCP tools run under the `system_command` capability
(same approval bar as the shell tool) since they can perform arbitrary side effects on
the agent's behalf.

## Adding a Skill

Create a package under `skills/<name>/`, export Zod schemas + handlers. Skills are auto-discovered by `src/skills/loader.ts` and can be enabled per-workspace in the control plane UI.

## Environment

Reads from `.env` in this directory or environment variables:

| Variable | Purpose |
|---|---|
| `AGENT_NAME` | Agent display name |
| `CONTROL_PLANE_URL` | Control plane base URL |
| `LLM_MODEL` / `LLM_API_KEY` | LLM provider config |
| `VAULTYS_ID_PATH` | Path to agent VaultysId identity file |
| `MCP_SERVERS_PATH` | Path to the MCP servers config (default `~/.vaultysclaw/mcp-servers.json`) |
