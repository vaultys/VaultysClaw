# packages/proxy

A governance-gated reverse proxy that lets customer API traffic reach
VaultysClaw agents (or any fronted service) without requiring the caller to
install a full agent-controller. It onboards exactly like an Agent — own
VaultysId, WS/PeerJS transport, register → `pending_approval` → admin-approve
→ `connected`, all via `@vaultysclaw/sdk` — then runs an HTTP listener that
makes every allow/deny decision locally, from config the control plane pushes
down. Many independent proxy instances can connect to one control plane.

## Key Files

- **`src/proxy-runtime.ts`** — `ProxyRuntime extends BaseAgentRuntime`
  (`kind: "proxy"`). Thin, like `mcp-gateway`'s `McpGatewayAgent` — exists
  purely for identity/connection/handshake. `executeIntent`/`executeChat` are
  rejections (proxies don't execute agent intents). `onProxyConfig` caches the
  pushed config into `local-db.ts`. `reportActivityLog` sends batched logs.
- **`src/local-db.ts`** — SQLite (`better-sqlite3`), two concerns: the latest
  `WSProxyConfigPayload` (so the HTTP listener has rules immediately on
  startup, before the first reconnect completes) and durable keypairs for
  **proxy-provisioned** principals — never regenerated, since losing one would
  silently strip an already-approved principal of its governance rules.
- **`src/identity.ts`** — the two ways a request's Principal is resolved:
  - *Self-signed*: caller already holds a VaultysId and sends `X-VAULTYSID:
    <base64url id>.<packCert token>` — verified fully offline by reusing
    `@vaultysclaw/policy`'s existing `signCert`/`openCert` envelope, binding
    the signature to this exact method+url+timestamp+body-hash.
  - *Proxy-provisioned*: no header at all (the common case — most fronted
    services were never written to be VaultysId-aware). The proxy mints and
    durably owns a VaultysId on the extracted principal id's behalf.
- **`src/rules.ts`** — `matchRule` (method + full destination URL, first
  match wins) and `extractPrincipalId` (header / URL query param / JSON body
  key, per the matched rule's `principalIdSource`).
- **`src/http-server.ts`** — the actual listener: resolve upstream by Host
  header → match rule → (`no_check`: forward; `governed`: resolve identity,
  check the governance rule is granted; no match: apply the proxy's own
  `defaultMode`) → forward or 403. Batches activity-log entries and reports
  them async.
- **`src/index.ts`** — CLI entry / env config, mirrors `mcp-gateway`'s
  `buildAgentConfig()` pattern.

## Governance model

Every proxied identity is a **Principal** — `callerId` and `agentId` are the
same concept, distinguished only by an optional descriptive `tag` (e.g.
`ai_agent`, `service`), not a structural split. A `governed` rule always
denies (403, with the DID + a message pointing at the control plane) until an
admin reviews a newly-seen Principal and grants it rules — whether that
Principal arrived self-signed or was provisioned by this proxy.

## Environment

| Variable | Purpose |
|---|---|
| `VC_CONTROL_PLANE_URL` / `VC_CONTROL_PLANE_WS_URL` | Control plane base URL / WS URL |
| `VC_VAULTYS_ID_PATH` | Path to this proxy's own identity file (default `~/.vaultysclaw/proxy.id`) |
| `VC_PROXY_NAME` | Display name in the dashboard |
| `VC_PEERJS_CONTROL_PLANE_ID` / `VC_PEERJS_SERVER_URL` | WebRTC transport instead of WebSocket |
| `PROXY_HTTP_PORT` | Port the reverse-proxy listener binds to (default `8090`) |

## Admin

Configured from the **Proxies** section of the admin dashboard
(`/admin/proxies`) — upstreams, rules, and principals (governance rules,
tag, status) all live there; the control plane pushes every change down over
the same WS/PeerJS channel (`pushProxyConfig` in
`packages/control-plane/lib/ws-server.ts`).

## Known limitations (v1)

- Request bodies are fully buffered (needed for signature-body-hash and JSON
  extraction), not streamed through — fine for typical API payloads, a real
  constraint for large uploads.
- Upstream selection is by `Host` header among the proxy's configured
  upstreams (falls back to the single configured upstream if there's only
  one) — a proxy fronting multiple upstreams on divergent hostnames needs the
  caller to address it with the real target's Host header.
