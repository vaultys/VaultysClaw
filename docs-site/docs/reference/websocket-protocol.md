---
sidebar_position: 1
title: WebSocket protocol
description: Every message type an Actor exchanges with the control plane.
---

# WebSocket protocol

A small, closed message union. Unknown types are rejected rather than routed.

This is deliberately **not** a reuse of the older platform's message type union,
which still carries chat, workflow, and channel types this control plane does not
implement.

## Envelope

```ts
interface ProtocolMessage {
  type: ProtocolMessageType;
  // type-specific payload fields
}
```

## Message types

| Type | Direction | Purpose |
|---|---|---|
| `register` | Actor → CP | Announce DID, kind, public key |
| `auth_challenge` | CP ↔ Actor | `Challenger` round, `service: "auth"` |
| `auth_complete` | CP → Actor | Identity proven, connection established |
| `auth_failed` | CP → Actor | Handshake rejected |
| `registration_pending` | CP → Actor | Unknown DID, awaiting admin approval |
| `heartbeat` / `pong` | Actor ↔ CP | Liveness |
| `capability_request` | Actor → CP | Request capabilities, initially or later |
| `cert_challenge` | CP ↔ Actor | `Challenger` round, `service: "certificate"` |
| `cert_issued` | CP → Actor | Certificate delivered |
| `cert_failed` | CP → Actor | Certificate exchange failed |
| `cert_status_request` | Any → CP | Ask whether a certificate is still good |
| `cert_status_response` | CP → Any | Signed status answer |
| `actor_config` | CP → Actor | Kind-specific configuration push |
| `sensor_telemetry` | Actor → CP | Sensor workload observations |
| `error` | CP → Actor | Protocol error |

## Registration

```ts
interface RegisterPayload {
  did: string;
  kind: string;      // open-ended: "openclaw" | "mcp" | "sensor" | "proxy" | "device" | …
  publicKey: string; // base64 raw key
}
```

`kind` is open-ended by design — a new kind requires no protocol change. `human`
is not valid here; humans onboard through login.

## Authentication

The `Challenger` handshake, `service: "auth"`. The server opens with an empty
challenge; both sides exchange rounds until identity is proven.

```ts
interface AuthChallengePayload {
  // Base64 Challenger certificate bytes, or "" for the server's opening message.
  certificate: string;
}
```

Handshake state is held **in memory per connection**, not round-tripped through a
database session row. This is a long-lived process, not a stateless function.

Outcomes:

- **Known Actor** → `auth_complete`, plus delivery of any approved-but-undelivered
  grant.
- **Unknown Actor** → `registration_pending`. The pending record is **reused**
  across reconnects, not duplicated.

## Certificate issuance

`capability_request` carries the requested set. It needs no signature of its own —
the connection already proved identity, and the message only needs to arrive over
that authenticated channel.

After an admin approves, the control plane proactively opens a second
`Challenger` exchange with `service: "certificate"`, mirroring `auth_challenge`'s
mechanics exactly. Completing it produces a natively dual-signed certificate.

```ts
interface CertIssuedPayload {
  certificate: string;
  capabilities: string[];  // plain, unsigned — see below
}
```

:::warning Why `capabilities` rides alongside rather than inside
The certificate for this exchange carries **no signed metadata**.

The Go `Challenger` implementation has a verification bug: its `Step2` and
`Finalize` reconstruct the signed payload with metadata hardcoded to empty rather
than what was actually received, so any non-empty signed metadata fails Go-side
re-verification — even though the TypeScript side signs and verifies it correctly.

Rather than depend on a fix landing in a pinned external dependency, `cert_issued`
carries the granted capabilities as a plain, unsigned field alongside the
certificate bytes. The certificate itself remains the authoritative, verifiable
artefact; this field is a convenience for the client, not a grant.
:::

**A zero-capability approval skips the exchange entirely** and is simply marked
delivered — there is nothing to certify. `auth_complete` is always sent *before*
that decision, so a client whose grant comes back empty is still told it is
connected.

## Status checks

```ts
interface CertStatusRequestPayload {
  certId: string;
  requesterDid: string;
  nonce: string;
  signature: string;
}

interface CertStatusResponsePayload {
  certId: string;
  agentDid: string;
  status: "active" | "revoked" | "superseded" | "expired";
  capabilities: string[];
  resourceLimits: ResourceLimits | null;
  checkedAt: number;
  expiresAt: number;
  signature: string;  // signed by the control plane
}
```

The requester must be an authenticated Actor — never anonymous. Every request is
recorded as a status-check row and surfaces on the certificate's detail page.

The response is signed by the control plane, so it can be cached, forwarded, or
presented to a third party without that party reaching the control plane.

See [Trust verification](/docs/concepts/trust-verification).

## Configuration push

```ts
interface ActorConfigPayload {
  kindConfig: unknown;    // kind-specific
  grantToken: string;     // the Actor's certificate
  ruleSetToken: string;   // signed rule set, for proxy kinds
  trust: { failClosed: boolean };
}
```

One kind-agnostic message. The signature that makes a rule set enforceable is
produced **at push time** — the stored copy is left unsigned on purpose, because a
stored signature would need regenerating on every edit and a stale one is
indistinguishable from a tampered one.

`trust.failClosed` is translated from the org trust policy. Note it does **not**
carry the staple TTL — see
[why](/docs/concepts/trust-verification#trust-policy-fail-mode-and-staple-ttl).

## Sensor telemetry

Classified workload observations from a `sensor` Actor. The device DID is always
**the connection's own authenticated identity**, never a client-claimed field on
the envelope.

Observations upsert by device and workload fingerprint — current state, not an
append-only log. Host metadata from the batch merges into the Actor's
`kindConfig`; kind-specific fields do not get their own columns.

## Transport

WebSocket is the default. PeerJS/WebRTC is supported for the human login flow and
shaped for but not yet implemented for Actors.

Transport is not part of an Actor's identity, and must not be part of its
authorisation either. Any transport, once identity is proven, still passes the same
ledger check.
