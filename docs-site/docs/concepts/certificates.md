---
sidebar_position: 2
title: Certificates
description: The CapabilityCertificate ledger — signed, append-only, independently verifiable grants that replace roles and policy rows.
---

# The certificate ledger

Every permission anyone holds in VaultysClaw is a row in one table:
`CapabilityCertificate`. Signed, time-boxed, individually revocable, and
verifiable by anyone, offline, without calling the control plane.

This replaces two things the previous design had: mutable unsigned policy rows,
and a role enum. Neither survives.

## Why a ledger and not a policy table

A policy row is a statement of intent. A certificate is a *record of what was
actually issued, to whom, by whom, and when* — an artefact that outlives the
database it lives in and can be checked by a party that has no access to that
database.

That property is what makes the rest of the Zero Trust story possible. A third
party can be handed a certificate and a signed status response and decide for
itself whether to extend trust. With a policy table, it can only ask the control
plane and believe the answer.

## The shape

```prisma
model CapabilityCertificate {
  id                 String    @id
  agentDid           String              // the subject — any Actor, human or not
  workspaceId        String?
  capabilities       Json      @default("[]")
  resourceLimits     Json?
  certFormat         String    @default("packcert")  // "packcert" | "challenger"
  certificate        String              // the artefact itself, base64
  requestCertificate String?             // packcert only — the embedded request
  status             String    @default("active")    // active | revoked | superseded | expired
  issuedAt           DateTime  @default(now())
  expiresAt          DateTime?           // null = until revoked (rare, deliberate)
  revokedAt          DateTime?
  revokedBy          String?
  revokedReason      String?
  supersededByCertId String?
}
```

Rows are **never deleted, and never mutated after issue** except to flip `status`
and fill the revocation or supersession fields. That is what makes this an audit
trail rather than a cache.

## An Actor holds a set, not a certificate

Nothing here is unique per Actor. Certificates are keyed by subject DID, and an
Actor routinely holds several active at once:

- a long-lived **standing** grant — `agent_communication`, expiring in days;
- layered on top, one or more **short-lived, narrowly scoped** grants — read this
  one file, valid for the next ten seconds.

Permission is therefore resolved *per action over a set*, never per Actor over a
singleton:

```ts
resolvePermission(
  action: { capability: AgentCapability; resource?: string },
  activeCerts: CapabilityCertificate[],
  now: number
): { allowed: boolean; grantingCertId?: string }
```

The returned `grantingCertId` is the point. An action is not authorised by "some
capability the Actor happened to hold" — it is authorised by a specific,
citable certificate, and the audit log records which one.

This function lives in `packages/trust`, has no database and no network access,
and is deliberately isolated so a security audit can point at one self-contained
artefact. It exists a second time in Go, inside the interception point, and both
implementations run the same committed conformance vectors.

See [Capabilities & scope](/docs/concepts/capabilities).

## Two certificate formats

Two issuance situations exist, because sometimes there is a live counterpart to
negotiate with and sometimes there is not. Anything decoding a certificate
branches on `certFormat` first.

### `challenger` — interactive issuance

Used whenever the Actor asking for capabilities is **online**. The same SRP-style
`Challenger` protocol that authenticates a connection is run a second time with
`service: "certificate"` instead of `"auth"`, carrying the approved capabilities
as metadata.

The result is the library's own native dual-signature certificate — both parties'
keys and signatures as first-class fields (`pk1`/`pk2`/`sign1`/`sign2`/
`metadata`) — verifiable later by anyone, offline.

This is the **stronger** path: it requires both the Actor and the control plane to
be mutually, cryptographically present at the moment of issuance. `requestCertificate`
is null for these rows because the co-signature is native to the artefact.

### `packcert` — system or admin issued

Used when there is no live counterpart: the bootstrap admin grant, an admin
issuing a grant directly, an approval for an Actor that is currently offline.

Two nested tokens — a `capability_request` embedded inside a `capability_grant`,
both signed by the control plane. The honest audit signal for this path is
precisely that both halves verify against the *same* key: nobody outside asked for
this, the system or an admin decided it directly. The console shows which key
verified each half, so that signal is inspectable rather than implied.

:::tip Which format you get is not a setting
It follows from the situation. An online Actor negotiating its own grant gets
`challenger`; an offline or system-originated grant gets `packcert`. Both are
independently verifiable; they differ in what they prove about liveness.
:::

## Expiry

**Time-boxed is the default. `expiresAt: null` is a deliberate, narrow
exception**, meaning "valid until explicitly revoked" — no renewal cadence, no
automatic lapse.

A null expiry does not weaken the revocation model: an indefinite certificate is
neutralised exactly like any other, by flipping its status. It only removes the
*time* dimension.

The canonical use is the bootstrap admin grant. Issuing another indefinite
certificate should be a conscious, reviewable choice, so the console:

- renders "Never" in **warning amber**, never as neutral text;
- requires an explicit confirmation checkbox on the issuance form;
- flags a system-issued no-expiry grant in the ledger so the first real admin sees
  it immediately and can reissue it with an expiry if they want a stricter
  posture.

Loud, not silent. That is the rule for this whole class of exception.

## Revocation is a ledger write

Revocation is **not** a network action.

An admin revokes → the row's status flips to `revoked` with a required reason. The
control plane still attempts a cooperative push to the Actor, which the Actor may
honour. But the authoritative effect is that every status check from that moment
returns `revoked`, to every party that asks — including the control plane's own
dispatcher.

This is the reframing that makes revocation meaningful against code you do not
control. A modified binary can ignore a push. It cannot make a signed status
response say `active`.

See [Trust verification](/docs/concepts/trust-verification).

## Renewal

Two modes, for standing grants only:

- **Reactive** — the Actor notices its certificate is near expiry and requests
  again, running the same issuance flow.
- **Proactive** — a scheduled scan finds certificates expiring soon and pushes a
  fresh grant over the already-open connection, so there is no window where the
  Actor runs uncertified.

**Scoped and short-TTL certificates are excluded from proactive renewal.** A
certificate issued for one file read in the next ten seconds should expire and
disappear, not be silently refreshed. Renewal is a property of standing grants.

## Inspecting a certificate

The console's certificate detail view shows, for any row:

- the full **raw and decoded** payload — for `packcert`, both the grant and the
  embedded request;
- **which key actually verifies** each signature;
- an **independent live re-verification** against the stored bytes, not a stored
  validity flag;
- the **status-check history** — every party that asked about this certificate,
  and when.

Older rows recorded before public keys were captured show "could not verify"
gracefully rather than claiming a verification that did not happen.

## Bootstrap: the first certificate

Gating admin access behind a certificate creates an obvious chicken-and-egg
problem — issuance normally requires an existing admin to approve.

The exception fires **at most once per deployment**: on the first human login
where no Actor anywhere holds an active `admin_console_access` certificate, the
control plane issues one to that DID with no approval step, attributed to
`system:bootstrap`, with no expiry.

The existence check and the insert are atomic — a fixed certificate id doubles as
the lock — so two humans registering in the same race window cannot both walk
through the gap. The moment any such certificate exists, every later registration
falls through to normal approval.

See [Bootstrapping the first admin](/docs/guides/bootstrap).
