# packages/mcp-gateway

MCP server that exposes VaultysClaw agents as tools for Claude Code and other MCP clients.

Runs over stdio. Reads `VC_CONTROL_PLANE_URL` and `VC_API_KEY` from the environment.

```bash
pnpm mcp:dev    # Run in dev mode
pnpm mcp:build  # Build to dist/
```
