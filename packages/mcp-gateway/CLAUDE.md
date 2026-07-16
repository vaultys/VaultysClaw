# packages/mcp-gateway

MCP server that exposes VaultysClaw agents as tools for Claude Code and other MCP clients.

Runs over stdio. Connects to the control plane as a VaultysId agent — reads
`VC_CONTROL_PLANE_URL` and `VC_VAULTYS_ID_PATH` (see README for the full list
of env vars). No API key; auth is via VaultysId + admin approval.

```bash
pnpm mcp:dev    # Run in dev mode
pnpm mcp:build  # Build to dist/
```
