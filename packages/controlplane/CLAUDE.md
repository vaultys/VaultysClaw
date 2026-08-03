# packages/controlplane

The rebuilt VaultysClaw control plane — administration-first, the `CapabilityCertificate` ledger
at the core. See [`docs/REBUILD_ARCHITECTURE.md`](../../docs/REBUILD_ARCHITECTURE.md) and
[`docs/CERTIFICATE_WEB_OF_TRUST.md`](../../docs/CERTIFICATE_WEB_OF_TRUST.md) for the design this
implements. Lives **alongside** `packages/control-plane`, not in place of it yet — nothing points
production traffic here until the cutover is deliberate.

## Status

**Backend core + WebSocket connection lifecycle are built and verified end-to-end against a real
Postgres and a real Challenger handshake. No UI pages, no browser login flow yet.** What exists:

- `prisma/schema.prisma` — `Setting`, `Principal` (one entity for every DID-holder, human or not —
  §4/§4.5), `User` (1:1 human-profile extension of a `kind: "human"` Principal),
  `CapabilityCertificate` (the ledger, nullable `expiresAt`), `PendingRegistration`, `Workspace`.
  Deliberately minimal — models get added here as each subsequent feature is actually built, not
  ahead of time.
- `db/` — DAOs over the schema above (`client.ts` uses the same `@prisma/adapter-pg` + `pg.Pool`
  pattern as `packages/control-plane`).
- `lib/vault.ts` — reused unchanged (VaultysId signcrypt-to-self), per the "kept" list in the
  rebuild doc.
- `lib/certificates.ts` — `issueCapabilityGrant` (the co-signed request/grant flow, trust doc §3.2)
  and `ensureBootstrapAdmin` (the first-user exception, rebuild doc §4.5), including the
  race-safety note: the bootstrap grant uses a fixed id so a concurrent second attempt hits a real
  unique-constraint collision instead of silently minting two standing admin grants.
- `lib/protocol.ts` — a new, deliberately small message-type union (register, auth challenge/
  complete/failed, registration_pending, heartbeat/pong, cert_status_request/response) — not a
  reuse of `@vaultysclaw/shared`'s `WSMessageType`, which still carries the chat/workflow/channel
  types this rebuild cuts. Kind-specific message types (chat, tool calls, etc.) get added per-kind
  later, layered on top of this core, never mixed into it.
- `lib/agent-sender.ts` — the same transport-agnostic `AgentSender` shape as
  `packages/control-plane`, with only `WsSender` implemented so far; `PeerjsSender` (trust doc
  §4.4) is a deferred addition, not a redesign, when it's built.
- `lib/ws-server.ts` + `server.ts` — the connection lifecycle: register → VaultysId Challenger
  handshake (in-memory per connection, not round-tripped through a DB session row like
  `packages/control-plane`'s `AuthSession` — this is a long-lived process, not a stateless API
  route) → known Principal auto-connects, unknown Principal gets a `PendingRegistration` row.
  Also implements `heartbeat`/`pong` and the full `cert_status_request`/`cert_status_response`
  protocol (trust doc §4.1) — a connected Principal can ask about any certificate's live status
  and get back a control-plane-signed answer.

Verified manually (ad-hoc scripts against a throwaway Docker Postgres, not committed as repeatable
tests — see the deferred item below):
- Bootstrap issues exactly once even under a simulated race; `@vaultysclaw/trust`'s
  `resolvePermission` correctly authorizes/denies against the persisted ledger; a normal agent
  `capability_request` → `capability_grant` round-trip produces a real, independently-verifiable
  co-signed certificate.
- A real WS client running the actual Challenger crypto handshake against a live
  `ControlPlaneWSServer`: unknown DID → `registration_pending`; a Principal upserted + granted a
  certificate → reconnects and gets `auth_complete`; `heartbeat` → `pong`; a self-signed
  `cert_status_request` → a verified, signed `cert_status_response`.

## Explicitly deferred (next slices, not started)

- **`capability_request`/`capability_grant` over the wire.** The primitives exist
  (`lib/certificates.ts`) and the message types are reserved in `lib/protocol.ts`'s design, but
  nothing in `ws-server.ts` handles them yet — a live agent asking for more capabilities needs an
  admin-approval UI to be meaningful, and that doesn't exist yet either. Wire both together in the
  same slice.
- **WebRTC/PeerJS transport** (trust doc §4.4) — `AgentSender` is shaped for it; not implemented.
- The browser VaultysId QR login flow (`user-server-channel.ts` + `useVaultysConnect` equivalents)
  — reused conceptually from `packages/control-plane`, not yet ported. Needed before any human can
  reach the bootstrap-admin path through the real UI rather than a direct DB/function call.
- Any admin console or Access Portal page (`docs/PAGE_DESIGN.md`) — including approving a
  `PendingRegistration` into an actual `Principal`, which today only has DAO methods
  (`PendingRegistrationDAO.approve`), no caller.
- Notification Channels/Apprise, Webhooks, Model Registry, OIDC/Entra — added to the schema and
  this package only once each is actually being built.
- A Docker-gated integration test suite (mirroring the root project's `vitest.config.docker.mjs`
  pattern) covering both the DB layer and the WS handshake — everything verified so far used
  one-off scripts against a throwaway container, not committed, repeatable tests.

## Design rules carried over from the rest of the monorepo

- `packages/policy` and `packages/trust` stay pure/dependency-light — this package is the only
  place their outputs get persisted or driven by I/O (same layering as `packages/control-plane`
  today).
- Humans are Principals (`kind: "human"`), not a separate identity/permission table — see the
  schema comment on `Principal`/`User` before reintroducing a parallel `role` concept.
