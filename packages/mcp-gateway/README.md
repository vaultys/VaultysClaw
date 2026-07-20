# @vaultysclaw/mcp-gateway

An [MCP](https://modelcontextprotocol.io) server that exposes VaultysClaw peer
agents as tools for Claude Code and other MCP clients. It connects to a control
plane as an agent (via `@vaultysclaw/agent-runtime`) and bridges peer agents into
the MCP tool namespace.

## Usage

The gateway runs over **stdio** and reads its configuration from the environment:

| Variable                     | Purpose                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `VC_CONTROL_PLANE_URL`        | HTTP URL of the control plane (default: `http://localhost:3000`)                  |
| `VC_CONTROL_PLANE_WS_URL`     | WebSocket URL (default: derived from `VC_CONTROL_PLANE_URL`, port 8080)           |
| `VC_VAULTYS_ID_PATH`          | Path to this gateway's VaultysId identity file (default: `~/.vaultysclaw/mcp-gateway.id`) |
| `VC_AGENT_NAME`               | Display name in the dashboard (default: `mcp-gateway`)                           |
| `VC_PEERJS_CONTROL_PLANE_ID`  | PeerJS peer ID of the control plane — when set, connects via WebRTC instead of WebSocket |
| `VC_PEERJS_SERVER_URL`        | Custom PeerJS signaling server URL (optional)                                    |

Authentication is via **VaultysId** (a cryptographic identity generated on
first run and stored at `VC_VAULTYS_ID_PATH`), not an API key — the gateway
registers with the control plane like any other agent and must be approved
in the dashboard before it can reach peer agents.

```bash
# Development (stdio)
pnpm dev

# Build and run
pnpm build        # tsc -> dist/
pnpm start        # node dist/index.js
```

From the repo root: `pnpm mcp:dev` and `pnpm mcp:build`.

The published binary is `vaultysclaw-mcp` (see `bin` in `package.json`), so MCP
clients can launch it directly.

## Configuring in an MCP client

Point your MCP client at the `vaultysclaw-mcp` command with `VC_CONTROL_PLANE_URL`
set in the environment. On first run the gateway generates a VaultysId identity
at `VC_VAULTYS_ID_PATH` and registers with the control plane — an admin must
approve it in the dashboard before peer agents appear as callable tools.

## Tools

| Tool | Purpose |
| --- | --- |
| `vc_list_agents` | List peer agents this gateway has grants for |
| `vc_run_intent` | Send an action + params to a peer agent (policy-governed) |
| `vc_chat` | Send a natural-language message to a peer agent |
| `vc_agent_status` | Report this gateway's own connection status, DID, peer count |
| `vc_gateway_metrics` | Per-tool call counts, error counts, p50/p95 latency since process start |

`agent_did` on `vc_run_intent`/`vc_chat` is validated locally against the peer
catalog before dispatch — unknown DIDs are rejected with a pointer to
`vc_list_agents` instead of falling through to a network call.

## Resources

The peer catalog is also exposed as MCP resources under `vc://agents/{did}`,
one per peer grant, for clients that prefer structured reads over the
`vc_list_agents` text tool.

## Related

- [`@vaultysclaw/agent-runtime`](../agent-runtime) — connection/auth layer this is built on
- [`@vaultysclaw/shared`](../shared) — protocol types
