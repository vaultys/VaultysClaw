# packages/controlplane

The rebuilt VaultysClaw control plane — administration-first, the `CapabilityCertificate` ledger
at the core. See [`docs/REBUILD_ARCHITECTURE.md`](../../docs/REBUILD_ARCHITECTURE.md) and
[`docs/CERTIFICATE_WEB_OF_TRUST.md`](../../docs/CERTIFICATE_WEB_OF_TRUST.md) for the design this
implements. Lives **alongside** `packages/control-plane`, not in place of it yet — nothing points
production traffic here until the cutover is deliberate.

## Status

**Backend core is built and verified end-to-end against a real Postgres. No WebSocket server, no
UI pages, no browser login flow yet.** What exists:

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

Verified manually against a real (throwaway, Docker) Postgres: bootstrap issues exactly once even
under a simulated race, `@vaultysclaw/trust`'s `resolvePermission` correctly authorizes/denies
against the persisted ledger, and a normal agent `capability_request` → `capability_grant`
round-trip produces a real, independently-verifiable co-signed certificate.

## Explicitly deferred (next slices, not started)

- `lib/ws-server.ts` + `server.ts` — the actual WS/WebRTC connection lifecycle, register → auth
  challenge → certificate issuance over the wire, and the `cert_status` protocol (trust doc §4).
  Everything above this line works standalone via direct function calls; nothing yet drives it
  from a live agent connection.
- The browser VaultysId QR login flow (`user-server-channel.ts` + `useVaultysConnect` equivalents)
  — reused conceptually from `packages/control-plane`, not yet ported.
- Any admin console or Access Portal page (`docs/PAGE_DESIGN.md`).
- Notification Channels/Apprise, Webhooks, Model Registry, OIDC/Entra — added to the schema and
  this package only once each is actually being built.
- A Docker-gated integration test suite for the DB-touching code in `db/`/`lib/certificates.ts`
  (mirroring the root project's `vitest.config.docker.mjs` pattern) — the verification above was
  done with an ad-hoc script against a throwaway container, not a committed, repeatable test.

## Design rules carried over from the rest of the monorepo

- `packages/policy` and `packages/trust` stay pure/dependency-light — this package is the only
  place their outputs get persisted or driven by I/O (same layering as `packages/control-plane`
  today).
- Humans are Principals (`kind: "human"`), not a separate identity/permission table — see the
  schema comment on `Principal`/`User` before reintroducing a parallel `role` concept.
