---
sidebar_position: 4
title: Building an Actor
description: Connect your own integration to the trust plane, in TypeScript or Go.
---

# Building an Actor

Any process that can hold a private key can become an Actor. There are two
official SDKs, speaking the identical protocol:

| Language | Package | Import |
|---|---|---|
| TypeScript | `packages/sdk` | `@vaultysclaw/sdk` |
| Go | `sdk-go/` | `github.com/vaultys/VaultysClaw/sdk-go` |

If your agent cannot embed an SDK at all — an off-the-shelf tool, an n8n
instance, a third-party MCP server — do not build an Actor for it. Put an
[interception point](/docs/concepts/blast-radius#3-network--the-interception-point)
in front of it instead.

:::warning Not `@vaultysclaw/agent-runtime`
That package targets the **previous** control plane and cannot connect to this
one — only 6 of its 24 message types survive, and none of the certificate flow
does. It remains supported for the older control plane; it is not the path here.
:::

## What the SDK handles

- Loading or generating a VaultysId identity from a file
- The `register` → handshake → approval → certificate lifecycle
- Reconnection with capped exponential backoff, never fatal on a dropped link
- Holding the issued certificate and persisting it across restarts
- Local permission decisions via the shared resolution function

## What you write

There are **no abstract methods to implement.** The control plane dispatches no
work, so an Actor is a thing you instantiate and then drive yourself.

### TypeScript

```ts
import { ActorRuntime } from "@vaultysclaw/sdk";

const actor = new ActorRuntime({
  name: "my-integration",
  kind: "openclaw",
  controlPlaneWsUrl: "ws://localhost:8081",
  identityPath: "~/.vaultysclaw/my-actor.id",
  requestedCapabilities: ["internet_access"],
  capabilityStatePath: "~/.vaultysclaw/my-actor.caps.json",
});

actor.on("pending",     ({ registrationId }) => {});  // awaiting admin approval
actor.on("connected",   ({ did }) => {});             // identity proven
actor.on("certificate", ({ capabilities }) => {});    // authority granted
actor.on("config",      (cfg) => {});                 // actor_config pushed

await actor.start();

if (actor.hasCapability("internet_access")) { /* … */ }
```

### Go

```go
id, _ := identity.LoadOrCreate("~/.vaultysclaw/my-actor.id")

conn := vconn.NewClientConn(vconn.ClientConfig{
    CollectorURL:          "http://localhost:3001",
    Identity:              id,
    Name:                  "my-integration",
    Kind:                  "openclaw",
    RequestedCapabilities: []string{"internet_access"},
    CapabilityStatePath:   "~/.vaultysclaw/my-actor.caps.json",
})

go conn.Run(ctx)   // reconnects on its own

if conn.HasCapability("internet_access") { /* … */ }
```

Both packages ship a runnable example:

```bash
pnpm --filter @vaultysclaw/sdk example    # TypeScript
go run ./example/minimal                  # Go, from sdk-go/
```

## Check what you were actually granted

`requestedCapabilities` is a **request**, not a declaration. An admin may approve
a smaller set, and your Actor must work correctly holding less than it asked for.

This is the single most common integration bug. Gate your behaviour on what you
hold, the way the Go sensor gates its entire poll cycle on `process_read` and
reads nothing at all until the certificate arrives:

```
requested: ["internet_access", "file_read"]
approved:  ["file_read"]

hasCapability("internet_access")  → false
hasCapability("file_read")        → true
```

Neither SDK defaults `requestedCapabilities`. An SDK that silently asked for
something you never named would be requesting authority on your behalf.

For a grant that may be [scoped](/docs/concepts/capabilities#certscope) to a
particular resource, use the full decision rather than the coarse check:

```ts
const { allowed, grantingCertId } = actor.resolvePermission({
  capability: "file_read",
  resource: "file:///reports/q3.pdf",
});
```

Both SDKs delegate to the same resolution function the control plane uses — the
TypeScript one to `@vaultysclaw/trust`, the Go one to its port in `authz`. Both
run the committed vectors in `/conformance`, and a divergence between them is a
release blocker.

Two things that function does **not** cover: `resourceLimits`, so
`allowedDomains` and token budgets remain your job; and `maxUses`, which cannot
bite unless you track usage yourself.

## Registration, from your side

1. Start the process. It generates an identity on first run.
2. It connects and registers. An unknown DID lands in the pending queue and the
   SDK reports pending rather than exiting.
3. An admin approves it in the console, choosing capabilities.
4. The control plane sends `auth_complete`, then proactively runs the certificate
   exchange. Your process does nothing — the SDK completes it.
5. The certificate arrives with the granted capabilities.

If your process was offline at approval time, delivery happens on its next
successful authentication instead. Nothing is lost.

An already-connected Actor can request more capabilities at any time; this
surfaces to an admin exactly like an initial request.

## Persistence

Two files, both mode 0600, and the format is shared across both SDKs:

| File | Contents | Losing it means |
|---|---|---|
| Identity | The bare base64 VaultysId secret | You register as a brand new Actor and need approval again |
| Capability state | The granted certificate and its capabilities | You hold nothing until an admin re-triggers delivery |

## Protocol traps

Both SDKs handle these. A hand-rolled client must too — see the
[full table](/docs/reference/websocket-protocol#integration-traps).

The two that bite hardest: **the server sends nothing on connect** (send
`register` unprompted, or hang forever), and **`registration_pending` is not
terminal** (approval arrives later on the same open socket).

## Current limitations

- **Revocation is not observed live.** Both SDKs assert their held certificate is
  active; neither runs `cert_status` checks yet, so a revocation is noticed at
  reconnect rather than immediately. Anything depending on prompt revocation must
  check separately.
- **The Go SDK's outbound queue is typed to sensor telemetry.** Connecting,
  certification, and permission decisions are fully general; sending an arbitrary
  kind-specific message is not yet.
- **Neither SDK is published** to npm or a Go module proxy. Consume them from a
  checkout of this repository.

## Other languages

No official SDK, but the protocol is small and the two implementations
demonstrate it is portable — the Go one includes a full port of the permission
resolver.

If you write a third, run the committed vectors in `/conformance` against it.
That is the same suite both existing implementations run, and it is the intended
contract.

See the [WebSocket protocol reference](/docs/reference/websocket-protocol).
