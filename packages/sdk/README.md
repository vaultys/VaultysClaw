# @vaultysclaw/sdk

The VaultysClaw SDK: VaultysId identity management, control-plane connection, and
policy engine execution, bundled into one framework-agnostic base class so any
process can connect to a VaultysClaw control plane as a first-class registrant —
the full agent controller, the MCP gateway, a proxy, or a custom integration.

## Responsibilities

- **Identity** — load/generate a local VaultysId, persist it to disk.
- **Connection** — WebSocket / WebRTC (PeerJS) transport to the control plane.
- **Authentication** — VaultysId challenge/response handshake, register →
  `pending_approval` → admin-approve → `connected` lifecycle.
- **Policy engine execution** — composes `@vaultysclaw/policy`'s `PolicyEnforcer`
  to gate actions by capability/governance rule, policy expiry, daily token
  budget, and hourly request rate.
- **Intent routing** — receive `intent` messages, dispatch to a handler, send
  `result` messages back.
- **Protocol framing** — msgpack encoding of the shared channel envelope.

## Usage

Consumed as a workspace library (ESM):

```typescript
import { /* sdk APIs */ } from "@vaultysclaw/sdk";
```

See `packages/mcp-gateway` for a minimal embedding example and
`packages/agent-controller` for the full-featured host. See
`docs-site/docs/guides/custom-agent-runtime.md` for a build-your-own walkthrough.

## Scripts

```bash
pnpm build        # compile to dist/ with tsc
pnpm type-check
```

## Related

- [`@vaultysclaw/shared`](../shared) — message types this runtime speaks
- [`@vaultysclaw/policy`](../policy) — the policy engine this composes
- [`@vaultysclaw/agent-controller`](../agent-controller) — full agent host built on top
- [`@vaultysclaw/mcp-gateway`](../mcp-gateway) — MCP server built on top
