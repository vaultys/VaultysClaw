---
sidebar_position: 16
title: API Proxy
description: Front any HTTP API or MCP client with VaultysClaw's governance-gated reverse proxy — no agent-controller install required on the fronted service.
---

# API Proxy

The **proxy** lets traffic reach a fronted HTTP service (or any upstream) through
VaultysClaw's zero-trust governance instead of bypassing it. It onboards exactly
like an agent — its own VaultysId, register → pending → admin-approve →
connected — then makes every allow/deny decision **locally**, from config the
control plane pushes down over the same WebSocket/PeerJS channel used for
agents. No agent-controller install is required on the fronted service itself.

Two packages share one governance decision:

| Package | Transport | Use when |
|---|---|---|
| `@vaultysclaw/proxy` | Raw HTTP listener (port `8090` by default) | Callers speak plain HTTP |
| `@vaultysclaw/mcp-proxy` | MCP (stdio or streamable HTTP) | Callers already speak MCP — Claude Code, Claude Desktop, or a workflow tool that can't embed an HTTP client |

Both connect independently to the control plane (each is its own connected
entity with its own identity), and both are configured from the same
**Proxies** section of the admin dashboard (`/admin/proxies`).

## How a request is decided

Every incoming request goes through the same three-step decision, regardless
of transport:

1. **Resolve the upstream** — by `Host` header (HTTP) or the proxy's single
   configured upstream (MCP, which has no Host header).
2. **Match a rule** — first rule whose `method` + full destination URL matches
   wins. `method` is matched **literally** (case-insensitive) against the
   rule's configured method — there is no `"*"` wildcard for "any method"; add
   one rule per method you want to allow. `urlPattern` supports `*` as a
   wildcard within the URL string.
3. **Apply the rule's mode**:
   - **`no_check`** — forwarded straight through, no identity check.
   - **`governed`** — resolves a Principal (self-signed VaultysId header, or a
     proxy-provisioned identity minted from a configured field in the
     header/URL/body) and checks it has been granted the rule's
     `governanceRule`. An unrecognized or unauthorized Principal gets a `403`
     with a clear reason (`"Unrecognized principal"`,
     `"Governance rule '...' not granted"`).
   - **No rule matches** — falls back to the proxy's own `defaultMode`:
     `passthrough` (allow) or `deny` (403, `"No rule matched this request"`).

This decision is a pure, shared function
(`evaluateRequest`/`forwardRequest` in `@vaultysclaw/proxy`'s public surface)
— `@vaultysclaw/mcp-proxy` imports it rather than re-implementing governance
for its transport, so both packages can never drift on what they allow.

## Setting up an HTTP proxy

```bash
VC_CONTROL_PLANE_URL=https://vaultysclaw.acme.internal \
VC_VAULTYS_ID_PATH=~/.vaultysclaw/proxy.id \
VC_PROXY_NAME=orders-api-proxy \
PROXY_HTTP_PORT=8090 \
pnpm proxy:dev
```

The proxy registers and waits for approval, same as an agent:

```
[vaultysclaw-proxy] Status -> pending_approval
[vaultysclaw-proxy] Approve the agent named "orders-api-proxy", then it will connect automatically.
```

Approve it in **Admin → Registrations** (or **Admin → Proxies** once
connected). Then, from its detail page:

- **Upstreams** — add the base URL(s) it fronts (`name` + `baseUrl`).
- **Rules** — add method + URL pattern + mode (`no_check` / `governed`), and
  for `governed` rules, the `governanceRule` string and where to read the
  Principal's id from (`header` / `url` / `body` key).
- **Default mode** — `passthrough` or `deny` for anything no rule matches.

Every change pushes the full config down to the connected proxy over
WebSocket immediately — no restart needed.

## Setting up the MCP proxy

Same onboarding, MCP transport instead of raw HTTP:

```bash
VC_CONTROL_PLANE_URL=https://vaultysclaw.acme.internal \
VC_VAULTYS_ID_PATH=~/.vaultysclaw/mcp-proxy.id \
VC_PROXY_NAME=orders-api-mcp-proxy \
MCP_PROXY_MODE=stdio \
pnpm mcp:proxy:dev   # or: node packages/mcp-proxy/dist/index.js
```

Point an MCP client (Claude Code, Claude Desktop) at the stdio process, or set
`MCP_PROXY_MODE=http` with `MCP_PROXY_HTTP_PORT` for a streamable-HTTP
endpoint remote callers can reach without spawning a subprocess. Either way it
exposes a single tool:

**`vc_proxy_request({ method, path, headers?, body? })`** — runs the exact
same rule/governance decision as the HTTP listener against the path on the
proxy's configured upstream, and returns `{ status, headers, body }` on
success or an `isError` result with the denial reason on a 403.

```json
// Request
{ "method": "GET", "path": "/free/items?x=1" }

// Success (no_check rule matched)
{ "status": 200, "headers": { "content-type": "application/json" }, "body": "{\"ok\":true,...}" }

// Denied (no rule matched, defaultMode=deny)
{ "isError": true, "content": [{ "type": "text", "text": "No rule matched this request" }] }
```

Because there is no `Host` header over MCP, a proxy fronting multiple
upstreams on divergent hostnames resolves to its single configured upstream
only when there's exactly one — same fallback the HTTP listener uses, but
with no way to pick a specific upstream per call yet.

## Known limitations (v1)

- Request bodies are fully buffered (needed for signature verification and
  JSON field extraction), not streamed — fine for typical API payloads, a
  real constraint for large uploads.
- No per-call upstream selection over MCP (see above).
- `method` matching on a rule is exact, not wildcarded — list one rule per
  HTTP method you want to allow through a given `urlPattern`.

## Requirements

- A running control plane the proxy can reach over WebSocket (or PeerJS/WebRTC
  via `VC_PEERJS_CONTROL_PLANE_ID`).
- The fronted upstream(s) must be reachable from wherever the proxy process
  runs.
