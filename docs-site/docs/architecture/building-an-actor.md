---
sidebar_position: 4
title: Building an Actor
description: Extend BaseAgentRuntime to connect your own agent to the VaultysClaw trust plane.
---

# Building an Actor

Any process that can hold a private key can become an Actor. The supported path is
extending `BaseAgentRuntime` from `@vaultysclaw/agent-runtime`, which handles
identity, transport, the handshake, and certificate delivery — leaving you the two
methods that are actually specific to your agent.

If your agent cannot embed a runtime at all — an off-the-shelf tool, an n8n
instance, a third-party MCP server — you do not build an Actor for it. You put an
[interception point](/docs/concepts/blast-radius#3-network--the-interception-point)
in front of it instead.

## What the runtime handles

- Loading or generating a local VaultysId identity from a file path
- Choosing WebSocket or PeerJS transport
- The full `register` → pending approval → `auth_complete` lifecycle
- Receiving and holding the issued certificate, capabilities, and resource limits
- Heartbeats, reconnection, and the `cert_status` protocol
- Composing the policy enforcer that gates each intent

## What you implement

```ts
import { BaseAgentRuntime, type AgentRuntimeConfig } from "@vaultysclaw/agent-runtime";

class MyAgent extends BaseAgentRuntime {
  async executeIntent(
    action: string,
    params: unknown,
    callerDid?: string,
    intentId?: string,
  ): Promise<unknown> {
    // Your work. The runtime has already verified the caller's identity and
    // checked the action against your granted capabilities.
  }

  async executeChat(
    messages: ChatMessage[],
    conversationId: string,
    sendChunk: (chunk: string) => void,
  ): Promise<void> {
    // Streaming conversational path. Reject it if your kind has no chat surface.
  }
}
```

Optional hooks let you react to lifecycle events: `onAuthComplete`,
`onDelegationUpdate`, `onPeerCatalogUpdated`, `onLlmConfig`, `onSkillsConfig`,
`onKnowledgeSources`, and a token-usage reporter for budget enforcement.

## Configuration

```ts
const config: AgentRuntimeConfig = {
  name: "my-agent",
  controlPlaneUrl: "https://controlplane.example.com",
  controlPlaneWsUrl: "wss://controlplane.example.com:8081",
  vaultysIdPath: "~/.vaultysclaw/my-agent.id",
  requestedCapabilities: ["file_access", "internet_access"],
  workspaceRoot: "/srv/my-agent",
};
```

`requestedCapabilities` is a **request**, not a declaration. An admin may approve a
reduced set, and your agent must function correctly holding less than it asked
for — or fail loudly, but never assume.

:::caution Check what you were actually granted
The single most common integration bug is assuming the requested set was granted.
Read the capabilities the runtime holds after `auth_complete` and gate your own
behaviour on them, the way the Go sensor gates its entire poll cycle on
`process_read`. An agent that requests ten capabilities, receives two, and
proceeds as if it had ten will fail in ways that look like control-plane bugs.
:::

## Registration, from your side

1. Start the process. It generates an identity at `vaultysIdPath` on first run.
2. It connects and registers. An unknown DID lands in the pending queue and the
   runtime reports `pending_approval` rather than exiting.
3. An admin approves it in the console, choosing capabilities.
4. The control plane sends `auth_complete`, then proactively runs the certificate
   exchange. Your process needs to do nothing — the runtime completes it.
5. `cert_issued` arrives with the certificate and granted capabilities.

If your process was offline at approval time, delivery happens on its next
successful authentication instead. Nothing is lost.

## Requesting more later

An already-connected Actor can send a `capability_request` at any time. This
updates its pending-registration record and surfaces to an admin exactly like an
initial request. The message carries no signature of its own — the connection
already proved identity, and the message only needs to arrive over that
authenticated channel.

## Polyfills

The runtime does **not** bundle a WebRTC polyfill. If you use the PeerJS
transport, your entry point must polyfill the RTC globals before importing the
runtime.

## Other languages

There is no official SDK outside TypeScript. The Go sensor demonstrates that a
native implementation is entirely viable — it runs the `Challenger` handshake, the
certificate exchange, offline certificate verification, and a full port of
`resolvePermission`.

If you write one, run the committed conformance vectors in `/conformance` against
it. That is the same test set the TypeScript and Go implementations both run, and
it is the intended contract for a third implementation.

See the [WebSocket protocol reference](/docs/reference/websocket-protocol).
