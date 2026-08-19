# VaultysClaw Go SDK

`github.com/vaultys/VaultysClaw/sdk-go`

Everything needed to build a Go **Actor** that connects to the rebuilt
VaultysClaw control plane: the VaultysId-authenticated connection lifecycle,
offline certificate verification, and the permission-resolution engine.

```bash
go get github.com/vaultys/VaultysClaw/sdk-go
```

## Packages

| Package | What it gives you |
|---|---|
| `vconn` | The connection: register → handshake → approval → certificate, with reconnect and capability persistence |
| `identity` | Load or create a VaultysId from a secret file |
| `authz` | `Resolve(action, certs, now)` — the permission decision, mirroring `@vaultysclaw/trust` |
| `grant` | Offline verification of packcert capability grants against a pinned anchor |
| `rules` | Signed rule sets, for interception-point integrations |

## Minimal Actor

```go
id, err := identity.LoadOrCreate("~/.vaultysclaw/my-actor.id")
if err != nil { log.Fatal(err) }

conn := vconn.NewClientConn(vconn.ClientConfig{
    CollectorURL:          "http://localhost:3001",
    Identity:              id,
    Name:                  "my-integration",
    Kind:                  "openclaw",
    RequestedCapabilities: []string{"internet_access"},
    CapabilityStatePath:   "~/.vaultysclaw/my-actor.caps.json",
    Logger:                slog.Default(),
})

go conn.Run(ctx)   // reconnects on its own; never panics on a dropped link

if conn.HasCapability("internet_access") {
    // …
}
```

`Run` blocks until the context is cancelled, reconnecting with capped
exponential backoff. A connection failure is never fatal.

## What the control plane grants is not what you asked for

`RequestedCapabilities` is a **request**. An admin may approve a smaller set, and
your Actor has to work correctly holding less than it asked for. Gate on
`HasCapability`, the way the sensor gates its entire poll cycle on
`process_read` and reads nothing at all until the certificate arrives.

There is deliberately **no default** for `RequestedCapabilities`: an SDK that
silently asked for something you never named would be requesting authority on
your behalf. Empty means "ask for nothing", which is a valid state.

## Protocol traps

Reproduced here because each has already caused a real bug:

1. **The server sends nothing on connect.** The client sends `register`
   unprompted. Waiting for a greeting hangs forever.
2. **`register` carries `{name, version, kind}` — no DID, no public key.**
   Identity is derived from the completed handshake, never self-asserted.
3. **`registration_pending` is not terminal.** `auth_complete` arrives later,
   out of band, when an admin approves. Hold the connection open.
4. **Granted capabilities come from the plain `cert_issued.capabilities` field**,
   never from certificate metadata — the Go Challenger reconstructs signed
   metadata as empty during verification, so a cert carrying it fails to verify.
5. **`maxStatusAgeSeconds: 0` is the strictest setting, not the loosest.** For a
   decider that is offline by design it means "deny everything". Unbounded must
   be written as a negative.

## Cross-language conformance

`authz` is a port of `@vaultysclaw/trust`'s `resolvePermission`, and `grant` and
`rules` verify artefacts produced by the TypeScript signer. All three run the
committed vectors in `/conformance` against fixtures generated from the
TypeScript implementation. **A divergence between the two languages is a release
blocker**, not a known difference — the suites fail loudly rather than skipping
when a fixture is missing.

## Relationship to the sensor

This module was extracted from `vaultysclaw-sensor/internal/*`, where Go's
`internal/` rule made it importable only by the sensor. The sensor now consumes
this module rather than owning it, so the reference implementation and the SDK
cannot drift.

`vconn` here is the **client** half. The sensor keeps its reference collector
server at `internal/vconn/server.go`, which imports this package's envelope and
handshake types.

## Known limitations

- **The outbound queue is typed to `telemetry.Event`.** `Enqueue` takes a sensor
  telemetry event, so today that is the only message type an Actor can send
  unprompted. Connecting, obtaining a certificate, and making permission
  decisions are fully general; *sending* is not yet. A generic `Send` is the
  obvious next step.
- **Not published to a module proxy yet.** Consume it via a `replace` directive
  from a checkout, as `vaultysclaw-sensor/go.mod` does.

> **Name collision warning.** On the `origin/sdk` and `origin/go-agent-controller`
> branches, `@vaultysclaw/sdk` names the *old* TypeScript runtime that targets
> the previous control plane. This module and `packages/sdk` target the rebuild.
