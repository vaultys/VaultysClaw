---
sidebar_position: 4
title: Trust verification
description: The cert_status protocol — how any party checks whether a certificate is still good, online or offline.
---

# Trust verification

This is the protocol that makes revocation mean something. If certificates are
VaultysClaw's PKI, this is its OCSP.

## The problem it solves

**No party is forced offline; every party can be made untrustworthy.**

VaultysClaw does not control agent code running on remote infrastructure. It
cannot guarantee that a revoked agent stops acting — a modified or compromised
binary can ignore any revocation pushed to it. Pretending otherwise would be the
central dishonesty of an agent trust platform.

What VaultysClaw *can* guarantee is narrower and actually achievable:

> **Nobody legitimate acts on a revoked agent's behalf without knowing it is
> revoked.**

Every interaction — control plane ↔ agent, agent ↔ agent, third party ↔ agent —
is gated behind a live or stapled check against the ledger, performed by whoever
is about to extend trust. Not by the agent asserting its own good standing.

This reframes the kill switch from *transport-level disconnect* — which only ever
worked for full deregistration — to *ledger-level revocation*, which works for
narrowing or withdrawing capabilities without touching the connection at all.

## The exchange

```ts
interface CertStatusRequest {
  certId: string;        // or a DID, meaning "that Actor's current certificate"
  requesterDid: string;
  nonce: string;
  signature: string;     // requester signs {certId, nonce, timestamp}
}

interface CertStatusResponse {
  certId: string;
  agentDid: string;
  status: "active" | "revoked" | "superseded" | "expired";
  capabilities: AgentCapability[];
  resourceLimits: ResourceLimits | null;
  checkedAt: number;
  expiresAt: number;
  signature: string;     // signed by the control plane
}
```

Two properties do the work.

**The requester must be an authenticated Actor.** Never anonymous. An anonymous
caller should not be able to enumerate who the control plane is watching, so the
status protocol is itself authenticated — which is also why a read-only external
verifier registers as an Actor like anything else.

**The response is signed by the control plane, not merely returned over an
authenticated transport.** A verifier can therefore cache it, forward it, or
present it to a *third* party — "here is proof this Actor was active as of
14:03" — without that third party needing to reach the control plane at all.

That is what makes stapling possible without weakening the guarantee.

## It is a message shape, not a WebSocket message

Deliberately. The same request and response bodies travel over:

- **WebSocket** — a connected Actor checking a peer, or the control plane checking
  its own ledger;
- **Direct peer-to-peer data channels** — two agents connected to each other and
  possibly not to the control plane;
- **Files on disk** — an interception point reading a periodically-refreshed
  grant artefact, deciding entirely offline.

Any transport, once identity is proven, must still pass the same live-or-stapled
ledger check before a capability-gated action proceeds. Transport is not part of
an Actor's identity, and it must not be part of its authorisation either.

## Every check is recorded

A `CertStatusCheck` row is written for every request: which certificate, which
requester, what answer, when. It is write-only, and it surfaces on the
certificate detail page as that certificate's status-check history.

This is a genuine signal, not bookkeeping. A certificate nobody ever checks is a
certificate whose revocation would go unnoticed.

## The control plane verifies its own ledger

The gap that motivated this design was the control plane routing an Actor's
messages with no per-message revalidation — the ledger was authoritative for
everyone except the system that owned it.

So the control plane's own dispatcher is a verifier of its own ledger, running the
same check any other party would run. In-process against its own database, so
effectively free. This is the single change that makes revocation bite on the
control-plane-to-Actor link; everything else generalises it outward.

## Trust policy: fail mode and staple TTL

Two knobs, org-wide today.

### Fail mode

What a verifier does when it **cannot reach** the control plane.

| Mode | Behaviour | Fits |
|---|---|---|
| `closed` *(default)* | Refuse to act until a live check succeeds | Regulated, high-security deployments |
| `open` | Proceed on last-known-good status within the staple TTL; beyond it, proceed with a logged warning | Availability-sensitive deployments accepting the gap |

New deployments start maximally strict and loosen deliberately.

### Staple TTL

| Value | Behaviour |
|---|---|
| `0` | Force a live query every time — **the strictest setting** |
| `N > 0` | Accept a status response signed within the last N seconds, stapled by the Actor itself or cached from a prior live check |

:::danger Zero is strictest, and this trips people up
`stapleTtlSeconds: 0` means "no cached status is acceptable". For a verifier that
can query live, that is maximum rigour. For a verifier that is **offline by
design** — an interception point deciding without a network round trip — the same
number means "deny everything".

This is why the interception point does **not** inherit `trust.stapleTtlSeconds`.
It carries its own `maxStatusAgeSeconds`, where `0` keeps its strict meaning and
*unbounded must be written explicitly as a negative*. An earlier implementation
had these inverted, so an admin asking for maximum rigour silently received
maximum laxity. Inheriting the number would have handed the loosest behaviour to
the admin who asked for the strictest.
:::

## Current state

| Piece | Status |
|---|---|
| `cert_status_request` / `cert_status_response` over WebSocket | Built and verified — a real client's signed request produces a verified, signed response, persisted as a status-check row |
| Status-check audit history in the console | Built |
| `trust.failMode` | Persisted, with one consumer: the interception point's fail-closed posture |
| `trust.stapleTtlSeconds` | Persisted, deliberately unread — see the warning above |
| Per-workspace overrides | Not in the schema; org-wide is the only level today |
| Peer-to-peer status checks between agents | Designed, not built |

The peer-to-peer gap is worth stating plainly: direct agent-to-agent data channels
run a real identity handshake, but authorisation afterwards falls back to a locally
cached catalogue. A revoked peer grant has no effect on that cache until the next
push. Closing this — replacing the cached-catalogue fallback with the same
live-or-stapled check — is the remaining work for this protocol.
