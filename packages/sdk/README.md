# @vaultysclaw/sdk

Build a **VaultysClaw Actor** in TypeScript: connect to the control plane, prove
your identity, obtain a capability certificate, and decide permissions locally.

There is a matching Go SDK at [`sdk-go/`](../../sdk-go) speaking the identical
protocol.

## Minimal Actor

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

actor.on("pending",     ({ registrationId }) => console.log("awaiting approval", registrationId));
actor.on("connected",   ({ did }) => console.log("identity proven", did));
actor.onCapabilityChange(({ current, added, removed, reason }) => {
  console.log("capabilities", { current, added, removed, reason });
});

await actor.start();

if (await actor.can("internet_access")) { /* ... */ }
```

Run the worked example against a live control plane:

```bash
pnpm --filter @vaultysclaw/sdk example
```

## It is instantiated, not subclassed

The previous runtime (`@vaultysclaw/agent-runtime`) is an abstract class because
the old control plane pushed work in — you implemented `executeIntent` and
`executeChat`. **The rebuilt control plane dispatches no work.** An Actor is
autonomous: prove identity, hold a certificate, gate your own behaviour, report
what you did. There is nothing left to make abstract.

## What you asked for is not what you got

`requestedCapabilities` is a **request**. An admin may approve a smaller set, and
your Actor must work correctly holding less than it asked for:

```ts
requestedCapabilities: ["internet_access", "file_access"]
// admin approves file_access only
await actor.can("internet_access");  // false
await actor.can("file_access");      // true
```

There is deliberately **no default** for `requestedCapabilities` — an SDK that
silently asked for something you never named would be requesting authority on
your behalf.

For scoped grants, pass a resource:

```ts
const allowed = await actor.can("file_access", "file:///reports/q3.pdf");
```

This delegates to `@vaultysclaw/trust` — the same function the control plane and
the Go SDK use, held together by the shared conformance vectors in
`/conformance`.

Two limits it does **not** cover: `resourceLimits` (so `allowedDomains` and token
budgets stay your job), and `maxUses` (which cannot bite unless you track
`usedCount` yourself).

## Lifecycle

```
start()
  └─ register {name, kind}          ← sent unprompted; the server says nothing first
     └─ auth_challenge rounds       ← identity proven here, not asserted
        ├─ registration_pending     ← NOT terminal; an admin is deciding
        │    └─ capability_request
        └─ auth_complete            ← "connected"
             └─ cert_challenge rounds
                └─ cert_issued      ← "certificate"; capabilities granted
```

`capability_request` asks only for capabilities that are still missing. If the
control plane creates a custom capability while the Actor is connected, the SDK
is nudged over the socket and re-requests any newly grantable missing capability.

## Persistence

Two files, both mode 0600:

| Path | Contents | Losing it means |
|---|---|---|
| `identityPath` | The bare base64 VaultysId secret | You register as a brand new Actor and need approval again |
| `capabilityStatePath` | Granted certificates and their capabilities | You hold nothing until an admin re-triggers delivery |

The identity file format is shared with `@vaultysclaw/agent-runtime` and the Go
SDK, so the same file works across all three.

## Protocol traps

Each has already caused a real bug:

1. **The server sends nothing on connect.** Send `register` unprompted. Waiting
   for a greeting hangs forever.
2. **`register` carries `{name, version, kind}` — no DID, no public key.**
   Identity is derived from the completed handshake, never self-asserted.
3. **`registration_pending` is not terminal.** `auth_complete` arrives later,
   out of band, when an admin approves. Hold the connection open.
4. **On reconnect, `auth_complete` arrives *before* the final `auth_challenge`.**
   Do not tear down the challenger on `auth_complete`, and ignore a trailing
   round once complete — feeding it to `update()` throws.
5. **Granted capabilities come from the plain `cert_issued.capabilities` field**,
   never from certificate metadata: the Go Challenger reconstructs signed
   metadata as empty during verification, so a cert carrying it fails Go-side.

## Runtime API

Use `await actor.can(capability, resource?)` before doing work. Use
`actor.allows(capability, resource?)` only for cached UI hints or logs.
`actor.capabilities()` returns the current usable capability names.

`actor.onCapabilityChange(listener)` fires when a connected control plane
delivers a new certificate, revokes one, or changes the custom capability
registry in a way that affects the local grant set.

## Known limitations

- **Not published to npm** — workspace-only for now.

> **Name collision warning.** On the `origin/sdk` and `origin/go-agent-controller`
> branches, `@vaultysclaw/sdk` names the *old* runtime targeting the previous
> control plane. This package targets the rebuild; the name means the opposite
> thing there.
