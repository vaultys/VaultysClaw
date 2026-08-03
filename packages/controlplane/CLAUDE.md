# packages/controlplane

The rebuilt VaultysClaw control plane — administration-first, the `CapabilityCertificate` ledger
at the core. See [`docs/REBUILD_ARCHITECTURE.md`](../../docs/REBUILD_ARCHITECTURE.md) and
[`docs/CERTIFICATE_WEB_OF_TRUST.md`](../../docs/CERTIFICATE_WEB_OF_TRUST.md) for the design this
implements. Lives **alongside** `packages/control-plane`, not in place of it yet — nothing points
production traffic here until the cutover is deliberate.

## Status

Backend core, the WebSocket connection lifecycle, VaultysId QR login, the full admin navigation
shape (real + placeholder pages), a real Certificates page, the Access Portal shell, and the
design system (ported from `packages/control-plane`) are built.

- **Design system**: `app/theme.css` (the adaptive CSS-variable palette, light/dark via `.dark`),
  `tailwind.config.js` (semantic color tokens — `bg-primary-600`, `text-foreground-500`, etc.,
  never raw Tailwind grays), `components/ThemeProvider.tsx`, and the layout chrome —
  `components/layout/{Sidebar,TopBar,AppShell,Toolbar,ToolbarContext,ToolbarSearch,ToolbarSteps,
  BreadcrumbContext}.tsx` — copied verbatim where they were already framework-only (Toolbar*,
  BreadcrumbContext, ThemeProvider, theme.css), rewritten trimmed where they were coupled to
  features this rebuild cuts (Sidebar: 3→7 flat nav items instead of the rail+panel two-tier
  design; TopBar: no notifications bell, no owner/admin role badge, no ts-rest profile fetch —
  `session.user.name` is already available).
- **`components/layout/PageChrome.tsx`** (new, no original equivalent) — bridges a Server
  Component page's data into the `useToolbar`/`useBreadcrumbs` client hooks. Necessary because
  these pages fetch directly via DAOs in an async Server Component, which can't call client hooks
  itself. Toolbar button actions are described as `{ href }` (serializable), not `{ onClick }` — a
  plain closure can't cross the Server→Client Component boundary, only a Server Action or
  serializable data can; `PageChrome` converts `href` into a `router.push` client-side.
- **Full nav shape** (`components/layout/Sidebar.tsx`): Overview, Principals, Certificates —
  fully built — plus Audit Log, Workspaces, Integrations, Settings as real routes rendering
  `components/layout/ComingSoon.tsx` with a description of what's planned, so the product reads as
  complete rather than missing pages.
- **`app/admin/certificates/`** — the real Certificates page (docs/PAGE_DESIGN.md §1.5): list with
  status badges, scope, and the "Never" expiry rendered in warning-amber (never neutral, per the
  "loud, not silent" rule); an issuance form (`new/page.tsx`) with the explicit no-expiry
  confirmation checkbox; inline revoke (reason required) via Server Actions in `actions.ts`.
  `lib/certificates.ts`'s `issueAdminGrant` gained an optional `scope` param to support this.
- **`app/portal/`** — the Access Portal shell (docs/PAGE_DESIGN.md §2), gated on `portal_access`
  instead of `admin_console_access`: `page.tsx` (My Certificates, real data — the one portal page
  built for real, since it's a direct `CapabilityCertificateDAO` query) and `agents/page.tsx` (My
  Agents, placeholder — needs the per-kind "connect" mechanism, deferred).
- `app/page.tsx` now routes a signed-in human to `/admin` or `/portal` based on which capability
  they actually hold, instead of a bare "logged in" placeholder.
- **Dev-mode login without a physical wallet** — `lib/browser-connect.ts` (client, trimmed from
  `packages/control-plane`'s SOFTWARE-identity path only, no PASSKEY/HARDWARE), plus
  `UserLoginChannel.handleRequest` and two new routes (`app/api/public/user/connect`,
  `app/api/public/user/request/[token]`) implementing the *classic* Challenger exchange relayed
  over plain HTTP POSTs instead of PeerJS/WebRTC — no native bindings needed at all. The login
  page's "Connect without the app (dev mode)" link is gated on `process.env.NODE_ENV !==
  "production"` (inlined at build time by Next.js, safe to check directly in a Client Component).
  The browser generates a software VaultysId once and persists it in `localStorage`, so repeat
  visits reuse the same identity. **This only ever registers/logs in as a genuinely new or
  previously-dev-registered identity** — exactly like a real wallet, it cannot log in as an
  unrelated existing Principal it has no key for. The useful case is a fresh, empty database:
  there, the first dev-mode click registers the browser's identity and runs
  `ensureBootstrapAdmin`, giving instant admin access with no wallet at all. On a database that
  already has people in it, a *new* browser identity correctly fails to log in (verified: the
  Challenger handshake completes successfully — proving the crypto/transport is correct — and
  `loginHuman` correctly rejects the unknown DID) — that's not a limitation to fix, it's the same
  security property the wallet-based flow has.
- **`app/admin/certificates/[id]/page.tsx`** — the certificate detail page (docs/PAGE_DESIGN.md
  §1.5's signature-chain view): full raw + decoded payload for both the grant and the embedded
  request, using `packages/policy`'s new `decodeCertUnsafe` (decode without verifying — display
  only), plus independent re-verification via `lib/cert-inspect.ts`'s `inspectCertificate`. Shows
  which key actually verifies the embedded request — the concrete, inspectable version of the
  "an inspector of the ledger can see both halves were signed by the same key" audit signal from
  the trust doc. Requires `Principal.publicKey` (new column — see below) to verify an
  agent-signed request; falls back to trying the control plane's own key (covers admin-issued/
  bootstrap grants) and shows "could not verify" gracefully for older rows with no key on record.

- `prisma/schema.prisma` — `Setting`, `Principal` (one entity for every DID-holder, human or not —
  §4/§4.5; now also carries `publicKey`, the base64 raw key captured at registration from the
  completed Challenger handshake, enabling independent re-verification later with no live
  connection), `User` (1:1 human-profile extension of a `kind: "human"` Principal),
  `CapabilityCertificate` (the ledger, nullable `expiresAt`), `PendingRegistration` (carries the
  Principal's `did` and `publicKey`, captured during the WS handshake, carried onto `Principal` at
  approval), `AuthCertificate` (the raw VaultysId handshake artifact for a *login* attempt —
  distinct from `CapabilityCertificate`), `Workspace`. Deliberately minimal — models get added here
  as each subsequent feature is actually built, not ahead of time.
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
- **Design system + full nav, end to end in a real browser** (not curl — Server Actions and
  client-side navigation need a real DOM): the admin console renders with the ported theme/sidebar/
  topbar; issuing a certificate through the real form (Principal select, capability checkboxes,
  scope, expiry preset) creates a real cert and redirects back to the list; revoking it through the
  real button flips its status, drops the active count, and removes its own revoke form from the
  row; granting a human `portal_access` through that same flow immediately unlocks `/portal` for
  them, and their **My Certificates** page correctly shows both that grant and their
  `system:bootstrap`-issued `admin_console_access` grant with correct `issuedBy` provenance.
- **Caveat, not verified**: the actual PeerJS/WebRTC wire exchange with a real VaultysId wallet
  app (no physical wallet in this environment — the Challenger crypto itself is already proven via
  the WS-agent path). One incidental observation from testing against the public PeerJS relay: an
  unidentified external peer attempted a connection mid-session (logged as a FIDO2/WebAuthn parse
  error) — a reminder that a public broker means the listening peer ID is reachable by anyone who
  guesses or observes it, not just the intended wallet; worth keeping in mind if/when this moves
  toward a real deployment.

## Explicitly deferred (next slices, not started)

- **`capability_request`/`capability_grant` over the wire.** The primitives exist and an agent's
  *initial* grant can be admin-issued (`issueAdminGrant`), but nothing in `ws-server.ts` lets a
  *connected* agent ask for more capabilities later — that needs both a new message handler and an
  admin-facing way to approve/deny the request.
- **WebRTC/PeerJS transport for agents** (trust doc §4.4) — `AgentSender` is shaped for it; not
  implemented. (The login flow's own PeerJS/WebRTC usage is separate and already built.)
- Everything the placeholder pages describe: Audit Log (unified signed IntentLog/ActivityLog),
  Workspaces (principals/budgets/model access, workspace-scoped admin via `CertScope`),
  Integrations (OIDC/Entra, API Keys, Webhooks, Notification Channels, Model Registry), Settings
  (server identity display, org-wide trust policy). Also: the Certificates page's per-cert detail
  drawer (signature chain, status-check history) from `docs/PAGE_DESIGN.md` §1.5 isn't built —
  today's page is list + issue + revoke only.
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
