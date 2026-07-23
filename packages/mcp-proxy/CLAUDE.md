# packages/mcp-proxy

Standalone MCP front-end for [`packages/proxy`](../proxy/CLAUDE.md)'s
governance-gated reverse-proxy pipeline (issue #46: "Eventually proxy with
MCP stdio/http interface as well"). Split into its own package rather than a
mode of the HTTP proxy because the stdio/streamable-HTTP transport model
warrants its own identity/onboarding/lifecycle — closer to how
`mcp-gateway` is its own package alongside `agent-controller`.

Onboards exactly like an Agent — own VaultysId, WS/PeerJS transport,
register → `pending_approval` → admin-approve → `connected`, all via
`@vaultysclaw/sdk`. Depends on `@vaultysclaw/proxy` as a library
(`evaluateRequest`/`forwardRequest`/`LocalDb`/rule-matching/identity
helpers) to run the exact same allow/deny decision as the HTTP listener —
no separate governance logic to keep in sync.

## Key Files

- **`src/mcp-proxy-runtime.ts`** — `McpProxyRuntime extends BaseAgentRuntime`
  (`kind: "proxy"`), structurally identical to `@vaultysclaw/proxy`'s
  `ProxyRuntime`. Exists purely for identity/connection/handshake;
  `executeIntent`/`executeChat` are rejections. `onProxyConfig` caches the
  pushed config into its own `LocalDb`. `reportActivityLog` sends batched
  logs.
- **`src/mcp-server.ts`** — exposes one tool, `vc_proxy_request({ method,
  path, headers?, body? })`, that runs `evaluateRequest` + `forwardRequest`
  (imported from `@vaultysclaw/proxy`'s public surface, `src/public.ts`
  there) against this package's own `LocalDb`. Two transports: stdio
  (default, for local MCP clients) or streamable HTTP
  (`MCP_PROXY_MODE=http`, for remote callers that can't spawn a subprocess).
- **`src/index.ts`** — CLI entry / env config, mirrors `mcp-gateway`'s
  `buildAgentConfig()` pattern.

## Governance model

Same Principal model as `@vaultysclaw/proxy` — `callerId`/`agentId` are one
concept, distinguished only by an optional descriptive `tag`. This package
has **its own** VaultysId identity and, correspondingly, its own
config/rules pushed down by the control plane for that identity — it is a
distinct connected entity from any HTTP proxy also configured for the same
upstream, not a shared process.

## Environment

| Variable | Purpose |
|---|---|
| `VC_CONTROL_PLANE_URL` / `VC_CONTROL_PLANE_WS_URL` | Control plane base URL / WS URL |
| `VC_VAULTYS_ID_PATH` | Path to this agent's own identity file (default `~/.vaultysclaw/mcp-proxy.id`) |
| `VC_PROXY_NAME` | Display name in the dashboard (default `mcp-proxy`) |
| `VC_PEERJS_CONTROL_PLANE_ID` / `VC_PEERJS_SERVER_URL` | WebRTC transport instead of WebSocket |
| `MCP_PROXY_MODE` | `stdio` \| `http` (default `stdio`) |
| `MCP_PROXY_HTTP_PORT` | Port for the streamable-HTTP transport when `MCP_PROXY_MODE=http` (default `8091`) |

## Admin

Configured from the same **Proxies** section of the admin dashboard
(`/admin/proxies`) as `@vaultysclaw/proxy` — this agent's own row there
holds its upstreams, rules, and principals.

## Known limitations (v1)

- Request bodies are fully buffered, single string `body` argument — same
  constraint as `@vaultysclaw/proxy`.
- No Host header over MCP, so multi-upstream configs resolve to the single
  configured upstream only (same fallback as the HTTP listener's
  single-upstream case).
