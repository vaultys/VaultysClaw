# packages/controlplane

The rebuilt VaultysClaw control plane — administration-first, the `CapabilityCertificate` ledger
at the core. See [`docs/REBUILD_ARCHITECTURE.md`](../../docs/REBUILD_ARCHITECTURE.md) and
[`docs/CERTIFICATE_WEB_OF_TRUST.md`](../../docs/CERTIFICATE_WEB_OF_TRUST.md) for the design this
implements. Lives **alongside** `packages/control-plane`, not in place of it yet — nothing points
production traffic here until the cutover is deliberate.

## Status

Backend core, the WebSocket connection lifecycle, VaultysId QR login, and the first admin pages
(Overview + Principals, including onboarding approval) are built.

- `prisma/schema.prisma` — `Setting`, `Principal` (one entity for every DID-holder, human or not —
  §4/§4.5), `User` (1:1 human-profile extension of a `kind: "human"` Principal),
  `CapabilityCertificate` (the ledger, nullable `expiresAt`), `PendingRegistration` (carries the
  Principal's `did`, captured during the WS handshake), `AuthCertificate` (the raw VaultysId
  handshake artifact for a *login* attempt — distinct from `CapabilityCertificate`), `Workspace`.
  Deliberately minimal — models get added here as each subsequent feature is actually built, not
  ahead of time.
- `db/` — DAOs over the schema above (`client.ts` uses the same `@prisma/adapter-pg` + `pg.Pool`
  pattern as `packages/control-plane`).
- `lib/vault.ts` — reused unchanged (VaultysId signcrypt-to-self), per the "kept" list in the
  rebuild doc.
- `lib/certificates.ts` — `issueCapabilityGrant` (the co-signed request/grant flow, trust doc §3.2),
  `signSystemRequestCert` (self-signs the "request" half when nobody actually asked — an admin
  vouching, or the bootstrap exception), `issueAdminGrant` (an admin/system issuing a grant
  directly), and `ensureBootstrapAdmin` (the first-user exception, rebuild doc §4.5 — race-safe via
  a fixed cert id that collides on a concurrent second attempt instead of minting two grants).
- `lib/protocol.ts` — a small, purpose-built message-type union (register, auth challenge/complete/
  failed, registration_pending, heartbeat/pong, cert_status_request/response) — not a reuse of
  `@vaultysclaw/shared`'s `WSMessageType`, which still carries the chat/workflow/channel types this
  rebuild cuts.
- `lib/agent-sender.ts` — the same transport-agnostic `AgentSender` shape as
  `packages/control-plane`; only `WsSender` implemented so far (`PeerjsSender` for agents, trust
  doc §4.4, is deferred).
- `lib/ws-server.ts` — the connection lifecycle: register → VaultysId Challenger handshake
  (in-memory per connection, not round-tripped through a DB session row — this is a long-lived
  process, not a stateless API route) → known Principal auto-connects, unknown Principal gets a
  `PendingRegistration` row (reused across reconnect attempts, not duplicated). Also implements
  `heartbeat`/`pong` and the full `cert_status_request`/`cert_status_response` protocol (trust doc
  §4.1).
- `lib/user-login-channel.ts` + `lib/auth-config.ts` + `app/login/page.tsx` — the passwordless
  QR-code login (reused in spirit from `packages/control-plane`'s `UserServerChannel`/
  `useVaultysConnect`, trimmed to only the P2P wallet-pairing flow — the browser-extension
  "bastion" flow and the older WS-relay handshake are a separate feature, not ported). A human
  scans the QR with the VaultysId wallet app; the server runs the Challenger handshake over a
  PeerJS/WebRTC channel (`lib/webrtc-polyfill.ts` + `@vaultys/channel-peerjs`). On completion, an
  unknown DID becomes a `kind: "human"` Principal and runs `ensureBootstrapAdmin`; a known DID
  just signs in. **Session has no `role` field** — access is decided by certificates, not anything
  stored on the session.
- `lib/access-control.ts` — `hasCapability(did, capability)`: the one helper every gated
  page/route goes through, wrapping `@vaultysclaw/trust`'s `resolvePermission` over the DID's
  certificates. Not a role check.
- `lib/registrations.ts` — `approvePendingRegistration`/`denyPendingRegistration`: turns a
  `PendingRegistration` into a real `Principal` + an admin-issued grant (via `issueAdminGrant`,
  since agents don't yet send a signed `capability_request` over the wire — see deferred).
- `app/admin/layout.tsx` — the actual capability gate (`admin_console_access`), not a stub: an
  unauthenticated visitor is redirected to `/login`; an authenticated one without the capability
  sees "Access denied", not a redirect loop.
- `app/admin/page.tsx` (Overview) and `app/admin/principals/page.tsx` (Principals, with inline
  approve/deny via Next.js Server Actions in `app/admin/principals/actions.ts`) — the first two
  pages from `docs/PAGE_DESIGN.md`.
- `server.ts` runs the actual Next.js custom-server pattern (HTTP + Next.js pages/API + WS, all in
  one process — same shape as `packages/control-plane`'s `server.ts`).

## Verified

Everything below was exercised against a real (throwaway, Docker) Postgres and, where noted, a
real running dev server — not just type-checked. Ad-hoc scripts/HTTP calls, not committed as
repeatable tests (see deferred).

- **Ledger + trust engine**: bootstrap issues exactly once even under a simulated race;
  `resolvePermission` correctly authorizes/denies against the persisted ledger; a
  `capability_request` → `capability_grant` round-trip produces a real, independently-verifiable
  co-signed certificate.
- **WS connection lifecycle**: a real WS client running the actual Challenger crypto handshake
  against a live `ControlPlaneWSServer` — unknown DID → `registration_pending` (now carrying the
  real DID); a Principal upserted + granted a certificate → reconnects and gets `auth_complete`;
  `heartbeat` → `pong`; a self-signed `cert_status_request` → a verified, signed
  `cert_status_response`.
- **Login flow**, against a real running dev server: `/` redirects to `/login` when
  unauthenticated; `/api/public/user/p2p-connect` genuinely opens a PeerJS/WebRTC channel (proving
  the `@roamhq/wrtc` native bindings work in this environment) and returns a real connection
  string/DID; a simulated completed handshake driven through the **real** NextAuth HTTP endpoints
  produces a correct session.
- **Admin approval flow**, end to end against a live server: a bootstrap admin signed in over real
  HTTP correctly sees the Overview/Principals pages; a second human *without* the capability
  correctly gets "Access denied" at the same route; `approvePendingRegistration` correctly creates
  the `Principal`, issues a real certificate (1-year expiry, not indefinite — the "no expiry"
  exception stays reserved for bootstrap), and the Principals page reflects it on reload (pending
  count → 0, new Principal listed).
- **Caveat, not verified**: the actual PeerJS/WebRTC wire exchange with a real VaultysId wallet
  app (no physical wallet in this environment — the Challenger crypto itself is already proven via
  the WS-agent path), and the Server Actions' framework-level wiring (`approveRegistrationAction`/
  `denyRegistrationAction` — Next.js's own `<form action={...}>` mechanism, not curl-able; the
  business logic they call, `approvePendingRegistration`/`denyPendingRegistration`, is verified
  directly).

## Explicitly deferred (next slices, not started)

- **`capability_request`/`capability_grant` over the wire.** The primitives exist and an agent's
  *initial* grant can be admin-issued (`issueAdminGrant`), but nothing in `ws-server.ts` lets a
  *connected* agent ask for more capabilities later — that needs both a new message handler and an
  admin-facing way to approve/deny the request.
- **WebRTC/PeerJS transport for agents** (trust doc §4.4) — `AgentSender` is shaped for it; not
  implemented. (The login flow's own PeerJS/WebRTC usage is separate and already built.)
- The rest of `docs/PAGE_DESIGN.md`: Certificates page (issue/revoke/inspect scope, status-check
  history), Audit Log, Workspaces, Integrations, Settings, and the Access Portal. `/` is a bare
  placeholder, not the real landing page.
- A human's `name`/`email` profile — a freshly registered human gets `name: "Unnamed"` and no
  email; there's no profile-completion step yet.
- Notification Channels/Apprise, Webhooks, Model Registry, OIDC/Entra — added to the schema and
  this package only once each is actually being built.
- A Docker-gated integration test suite (mirroring the root project's `vitest.config.docker.mjs`
  pattern) covering the DB layer, the WS handshake, and the admin flows.

## Design rules carried over from the rest of the monorepo

- `packages/policy` and `packages/trust` stay pure/dependency-light — this package is the only
  place their outputs get persisted or driven by I/O (same layering as `packages/control-plane`
  today).
- Humans are Principals (`kind: "human"`), not a separate identity/permission table — see the
  schema comment on `Principal`/`User` before reintroducing a parallel `role` concept.
