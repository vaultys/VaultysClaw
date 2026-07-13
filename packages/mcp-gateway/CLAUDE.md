# packages/mcp-gateway

MCP server that exposes VaultysClaw agents as tools for Claude Code and other MCP clients.

Runs over stdio. Reads `VC_CONTROL_PLANE_URL` and `VC_API_KEY` from the environment.

Optional local `llmConfig` (used before the control plane pushes its own config over WS): `VC_LLM_PROVIDER` + `VC_LLM_MODEL` (both required to enable it), plus `VC_LLM_API_KEY`, `VC_LLM_BASE_URL`, `VC_LLM_SYSTEM_PROMPT`, `VC_LLM_MAX_TOKENS`.

```bash
pnpm mcp:dev    # Run in dev mode
pnpm mcp:build  # Build to dist/
```
