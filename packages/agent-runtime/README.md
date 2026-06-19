# @vaultysclaw/agent-runtime

Generic agent protocol runtime: the transport, authentication, and intent-routing
layer that lets a process connect to a VaultysClaw control plane as an agent. It is
deliberately framework-agnostic so it can be embedded in different hosts (the
full agent controller, the MCP gateway, custom integrations).

## Responsibilities

- **Connection** — WebSocket / WebRTC (PeerJS) transport to the control plane.
- **Authentication** — VaultysId challenge/response handshake.
- **Intent routing** — receive `intent` messages, dispatch to a handler, send
  `result` messages back.
- **Protocol framing** — msgpack encoding of the shared channel envelope.

## Usage

Consumed as a workspace library (ESM):

```typescript
import { /* runtime APIs */ } from "@vaultysclaw/agent-runtime";
```

See `packages/mcp-gateway` for a minimal embedding example and
`packages/agent-controller` for the full-featured host.

## Scripts

```bash
pnpm build        # compile to dist/ with tsc
pnpm type-check
```

## Related

- [`@vaultysclaw/shared`](../shared) — message types this runtime speaks
- [`@vaultysclaw/agent-controller`](../agent-controller) — full agent host built on top
- [`@vaultysclaw/mcp-gateway`](../mcp-gateway) — MCP server built on top
