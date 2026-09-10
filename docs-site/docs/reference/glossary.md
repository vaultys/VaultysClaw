---
sidebar_position: 4
title: Glossary
description: The vocabulary, in one place.
---

# Glossary

**Access Portal** — The small, read-mostly surface gated on `portal_access`,
showing a human their own certificates and connect grants. Not the removed channel
system. → [Control plane](/docs/architecture/control-plane#access-portal)

**Actor** — Anything holding a VaultysId DID: agents, sensors, proxies, devices,
and humans alike. One entity, one registration flow, one ledger. →
[Actors](/docs/concepts/actors)

**Apprise** — The self-hosted container that owns every actual notification
integration. VaultysClaw renders a title and body and hands it over. →
[Notification channels](/docs/guides/notification-channels)

**Bootstrap grant** — The one-per-deployment `admin_console_access` certificate
issued automatically when no admin exists. No expiry, system-issued, and
deliberately loud in the console. → [Bootstrap](/docs/guides/bootstrap)

**Capability** — The verb in a grant: `file_read`, `admin_console_access`,
`process_read`. One enum covers agent permissions and interface access alike. →
[Capabilities](/docs/concepts/capabilities)

**CapabilityCertificate** — A row in the ledger: signed, time-boxed, revocable,
independently verifiable. The only thing that grants anything. →
[Certificates](/docs/concepts/certificates)

**CertScope** — The optional narrowing on a certificate: resource, pattern, use
count, purpose. What makes a capability attribute-scoped rather than blanket.

**`cert_status`** — The status-check protocol. A signed, timestamped answer to
"is this certificate still good", cacheable and forwardable. →
[Trust verification](/docs/concepts/trust-verification)

**`challenger` format** — A certificate produced by a live exchange with an online
Actor. Natively dual-signed; proves both parties were present at issuance.

**Challenger** — The SRP-style handshake underneath VaultysId. Multipurpose: the
`service` string discriminates authentication from certificate issuance.

**DID** — Decentralised identifier. An Actor's permanent name, derived from its
key.

**Fail mode** — What a verifier does when it cannot reach the control plane:
`closed` refuses, `open` proceeds on last-known-good. Default `closed`.

**Interception point** — An Actor deployed in front of agents that cannot embed
the runtime, refusing traffic their certificates do not authorise. Registers as
kind `proxy`. → [Blast radius](/docs/concepts/blast-radius)

**Kind** — What sort of Actor something is: `openclaw`, `mcp`, `sensor`, `proxy`,
`harness`, `device`, `human`. An open-ended string, a deploy-time concept. →
[Agent kinds](/docs/architecture/agent-kinds)

**`kindConfig`** — Kind-specific configuration in one JSON column, rather than
per-kind columns that are null for everything else.

**Ledger** — The `CapabilityCertificate` table. Append-only in the sense that rows
are never deleted and never mutated after issue except to flip status.

**Managed / observed / shadow** — A sensor-detected workload's status, from
whether its identity evidence resolves to a real Actor. Shadow means unmanaged AI.
→ [Sensors](/docs/guides/sensors)

**`non_delegatable`** — A live capability. A certificate carrying it can never be
a delegation chain's parent — the whole certificate, not per-capability.

**`packcert` format** — A certificate produced with no live counterpart:
bootstrap, admin-issued, or approval for an offline Actor. Two nested tokens
signed by the control plane.

**`recordEvent()`** — The single call every domain event passes through, writing
the audit row and driving the alert pipeline from the same payload. →
[Audit log](/docs/concepts/audit-log)

**`resolvePermission`** — The decision function. Resolves an action over the
**set** of an Actor's active certificates and returns which certificate granted
it. Exists in TypeScript and Go, both running the same conformance vectors.

**`requireAdmin()`** — The check every mutating admin Server Action must begin
with, because a layout gate does not protect action invocation.

**Staple** — A signed status response cached or presented by the Actor itself,
valid for a configured TTL. What lets an offline verifier decide.

**Staple TTL** — How long a stapled status may back a decision. **`0` is the
strictest value**, not the loosest. → [Trust verification](/docs/concepts/trust-verification#trust-policy-fail-mode-and-staple-ttl)

**Vault** — The signcrypt-to-self primitive protecting every stored secret, keyed
by the control plane's own VaultysId.

**VaultysId** — The identity system. Every party holds a key pair; `dilithium_ed25519`
is a real, selectable post-quantum option.

**Workspace** — The tenancy boundary. Membership is expressed as certificates
scoped to `workspace:<id>`, not as a membership table.
