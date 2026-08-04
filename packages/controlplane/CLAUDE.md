# packages/controlplane

The rebuilt VaultysClaw control plane — administration-first, the `CapabilityCertificate` ledger
at the core. See [`docs/REBUILD_ARCHITECTURE.md`](../../docs/REBUILD_ARCHITECTURE.md) and
[`docs/CERTIFICATE_WEB_OF_TRUST.md`](../../docs/CERTIFICATE_WEB_OF_TRUST.md) for the design this
implements. Lives **alongside** `packages/control-plane`, not in place of it yet — nothing points
production traffic here until the cutover is deliberate.

## Status

Backend core, the WebSocket connection lifecycle, VaultysId QR login, the full admin navigation
shape (real + placeholder pages), real Actors/Certificates/Workspaces/Settings pages, the Access Portal
shell, and the design system (ported from `packages/control-plane`) are built.

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
- **Full nav shape** (`components/layout/Sidebar.tsx`): Overview, Actors, Certificates —
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
  unrelated existing Actor it has no key for. The useful case is a fresh, empty database:
  there, the first dev-mode click registers the browser's identity, then — since this transport is
  code this repo owns end to end, unlike a real wallet app — runs the bootstrap admin grant through
  a **second, independent live SRP exchange** instead of an offline system-issued cert: double SRP,
  one to connect/register (`service: "register"`), one to actually claim
  `admin_console_access` (`service: "certificate"`, docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b) — see
  `lib/user-login-channel.ts`'s `handleCertificateRequest` below. On a database that already has
  people in it, a *new* browser identity correctly fails to log in (verified: the Challenger
  handshake completes successfully — proving the crypto/transport is correct — and `loginHuman`
  correctly rejects the unknown DID) — that's not a limitation to fix, it's the same security
  property the wallet-based flow has.
- **`app/admin/certificates/[id]/page.tsx`** — the certificate detail page (docs/PAGE_DESIGN.md
  §1.5's signature-chain view): full raw + decoded payload for both the grant and the embedded
  request, using `packages/policy`'s new `decodeCertUnsafe` (decode without verifying — display
  only), plus independent re-verification via `lib/cert-inspect.ts`'s `inspectCertificate`. Shows
  which key actually verifies the embedded request — the concrete, inspectable version of the
  "an inspector of the ledger can see both halves were signed by the same key" audit signal from
  the trust doc. Requires `Actor.publicKey` (new column — see below) to verify an
  agent-signed request; falls back to trying the control plane's own key (covers admin-issued/
  bootstrap grants) and shows "could not verify" gracefully for older rows with no key on record.

- `prisma/schema.prisma` — `Setting`, `Actor` (one entity for every DID-holder, human or not —
  §4/§4.5; now also carries `publicKey`, the base64 raw key captured at registration from the
  completed Challenger handshake, enabling independent re-verification later with no live
  connection), `User` (1:1 human-profile extension of a `kind: "human"` Actor),
  `CapabilityCertificate` (the ledger, nullable `expiresAt`; `certFormat` discriminates
  `"packcert"` — two nested `packages/policy` tokens, `requestCertificate` populated — from
  `"challenger"` — the library's native dual-signature certificate, trust doc §3.2b,
  `requestCertificate: null`), `PendingRegistration` (carries the Actor's `did` and
  `publicKey`, captured during the WS handshake, carried onto `Actor` at approval; `approvedBy`
  + `deliveredAt` track the interactive-issuance lifecycle — `deliveredAt: null` after approval
  means "waiting for the agent to be connected", not "not yet granted"), `AuthCertificate` (the raw
  VaultysId handshake artifact for a *login* attempt — distinct from `CapabilityCertificate`),
  `CertStatusCheck` (write-only audit row per `cert_status_request`/`cert_status_response` round —
  `certId`, `requesterDid`, `status`, `checkedAt` — surfaced on the certificate detail page),
  `Workspace`. Deliberately minimal — models get added here as each subsequent feature is actually
  built, not ahead of time.
- `db/` — DAOs over the schema above (`client.ts` uses the same `@prisma/adapter-pg` + `pg.Pool`
  pattern as `packages/control-plane`).
- `lib/vault.ts` — reused unchanged (VaultysId signcrypt-to-self), per the "kept" list in the
  rebuild doc.
- `lib/certificates.ts` — `issueCapabilityGrant` (the co-signed request/grant flow, trust doc
  §3.2a), `signSystemRequestCert` (self-signs the "request" half when nobody actually asked — an
  admin vouching), `issueAdminGrant` (an admin/system issuing a grant directly),
  `isBootstrapAdminNeeded` (the up-front existence check, split out so a caller can decide *how* to
  bootstrap before committing to it), `ensureBootstrapAdmin` (the QR/PeerJS wallet path's
  single-SRP, system-issued bootstrap grant — §3.2a, kept because a real third-party wallet app
  can't be assumed to understand a follow-up `service: "certificate"` challenge), and
  `persistChallengerCertificate` (persists the result of any live `service: "certificate"` exchange
  — §3.2b; both `lib/ws-server.ts`'s agent issuance and `lib/user-login-channel.ts`'s dev-mode
  bootstrap funnel through this one function). All three issuance paths share the same
  `certId`-collision race guard — a fixed id doubles as the "only one admin gets bootstrapped"
  lock, whichever path wins it.
- `lib/protocol.ts` — a small, purpose-built message-type union (register, auth challenge/complete/
  failed, registration_pending, heartbeat/pong, cert_status_request/response) — not a reuse of
  `@vaultysclaw/shared`'s `WSMessageType`, which still carries the chat/workflow/channel types this
  rebuild cuts.
- `lib/agent-sender.ts` — the same transport-agnostic `AgentSender` shape as
  `packages/control-plane`; only `WsSender` implemented so far (`PeerjsSender` for agents, trust
  doc §4.4, is deferred).
- `lib/ws-server.ts` — the connection lifecycle: register → VaultysId Challenger handshake
  (in-memory per connection, not round-tripped through a DB session row — this is a long-lived
  process, not a stateless API route) → known Actor auto-connects, unknown Actor gets a
  `PendingRegistration` row (reused across reconnect attempts, not duplicated). Also implements
  `heartbeat`/`pong`, the full `cert_status_request`/`cert_status_response` protocol (trust doc
  §4.1 — every request is also recorded via `CertStatusCheckDAO.record`, the audit trail behind the
  certificate detail page's status-check-history table), and the interactive issuance flow (trust
  doc §3.2b): a connected Actor's plain
  `capability_request` message updates its `PendingRegistration` row (whether still
  `awaitingApproval` on a fresh registration, or an already-known Actor asking for more); once
  an admin approves (`lib/registrations.ts`), `deliverApprovedCapabilities(did)` proactively starts
  a second, independent `service: "certificate"` Challenger exchange over the same connection
  (`cert_challenge` round-trip, mirroring `auth_challenge`'s mechanics exactly) — completing it
  persists a `certFormat: "challenger"` row and sends `cert_issued`. If the agent isn't connected
  when approved, delivery is deferred: `deliverIfApproved` runs the same check from the "existing
  Actor reconnect" branch of the auth handshake, so it's picked up on the agent's next
  successful `auth`. A module-level singleton (`setWSServerInstance`/`getWSServerInstance`, wired
  up in `server.ts`) is what lets a Server Action (`lib/registrations.ts`, running in the same
  Next.js custom-server process) reach the live connection map at all.
- `lib/user-login-channel.ts` + `lib/auth-config.ts` + `app/login/page.tsx` — the passwordless
  QR-code login (reused in spirit from `packages/control-plane`'s `UserServerChannel`/
  `useVaultysConnect`, trimmed to only the P2P wallet-pairing flow — the browser-extension
  "bastion" flow and the older WS-relay handshake are a separate feature, not ported). A human
  scans the QR with the VaultysId wallet app; the server runs the Challenger handshake over a
  PeerJS/WebRTC channel (`lib/webrtc-polyfill.ts` + `@vaultys/channel-peerjs`). On completion, an
  unknown DID becomes a `kind: "human"` Actor; a known DID just signs in. **Session has no
  `role` field** — access is decided by certificates, not anything stored on the session.
  Bootstrap admin differs by transport (see `lib/certificates.ts` above): the QR/wallet path calls
  `ensureBootstrapAdmin` once, directly. The dev-mode classic-HTTP-relay path
  (`lib/browser-connect.ts`, `app/api/public/user/{connect,request/[token]}`) instead runs a
  **double SRP**: after `handleRequest` completes the login round for a brand-new registration and
  `isBootstrapAdminNeeded()` is still true, it creates a second `AuthCertificate` row via
  `createCertificateRound` — tagged in `metadata` (`{ kind: "certificate", humanDid, capabilities,
  certId, issuedBy }`) so `handleRequest` routes any round against it to `handleCertificateRequest`
  instead of the login dispatch — and stashes `{ certRound: { key } }` onto the *login* cert's own
  metadata. `/api/public/user/listen/[token]` surfaces that `certRound` to the poller; the login
  page (`app/login/page.tsx`) sees it, runs `browser-connect.ts`'s `completeCertificateRound(key)`
  — the same software identity, `service: "certificate"` instead of `"auth"` — and only then calls
  `signIn`. `handleCertificateRequest` mirrors `lib/ws-server.ts`'s agent issuance exactly: embeds
  `capabilities` as metadata on the first server-side round, persists via
  `persistChallengerCertificate` on completion. There's no `PendingRegistration` for a human
  bootstrapping themselves — the certificate-round `AuthCertificate` row *is* the approval. A
  failed certificate round doesn't block sign-in (best-effort — the same idempotent bootstrap check
  just re-offers a fresh round on the next login attempt).
- `lib/access-control.ts` — `hasCapability(did, capability)`: the one helper every gated
  page/route goes through, wrapping `@vaultysclaw/trust`'s `resolvePermission` over the DID's
  certificates. Not a role check.
- `lib/registrations.ts` — `approvePendingRegistration`/`denyPendingRegistration`: turns a
  `PendingRegistration` into a real `Actor`, marks the registration `approved` with
  `deliveredAt: null`, then calls `getWSServerInstance()?.deliverApprovedCapabilities(did)` — the
  admin only decides *what* to grant, `ws-server.ts` runs the live exchange that actually produces
  the certificate (trust doc §3.2b). Distinct from `lib/certificates.ts`'s `issueAdminGrant`, which
  stays reserved for the non-interactive system/admin-issued path (§3.2a, e.g. bootstrap) — this
  function no longer calls it.
- `app/admin/layout.tsx` — the actual capability gate (`admin_console_access`), not a stub: an
  unauthenticated visitor is redirected to `/login`; an authenticated one without the capability
  sees "Access denied", not a redirect loop.
- `app/admin/page.tsx` (Overview) and `app/admin/actors/page.tsx` (Actors, with inline
  approve/deny via Next.js Server Actions in `app/admin/actors/actions.ts`) — the first two
  pages from `docs/PAGE_DESIGN.md`.
- **`app/admin/actors/[did]/page.tsx`** (docs/PAGE_DESIGN.md §1.4) — full Actor detail: registered/
  last-seen, public key, an edit form (`updateActorAction` in `app/admin/actors/actions.ts` — name/
  workspace for any kind, email additionally for humans via `UserDAO.updateEmail`), and every
  certificate issued to that Actor with inline revoke (reuses `app/admin/certificates/actions.ts`'s
  `revokeCertificateAction` directly rather than duplicating it). DIDs are base64url-encoded for the
  URL segment (`lib/actor-route.ts`'s `encodeDidParam`/`decodeDidParam`) — a raw `did:vaultys:...`
  string is not a safe path segment: even percent-encoded, Next's client-side router decodes it back
  to literal colons before the real top-level navigation and the server 404s on that (confirmed by
  network trace — the RSC prefetch of the encoded form succeeds, the actual navigation does not).
- **`app/admin/workspaces/{page.tsx,[id]/page.tsx,new/page.tsx,actions.ts}`** (docs/PAGE_DESIGN.md
  §1.7) — list (actor/member counts computed from `ActorDAO.list()` + active certs, not stored
  counters) and a tabbed detail page (Overview edit form, Actors — assign/remove via
  `assignActorWorkspaceAction`, a *separate* action from `updateActorAction` so assigning a workspace
  never touches a human's email as a side effect — and Access, listing humans holding a
  `CertScope.resource = "workspace:<id>"` grant, with a deep link into
  `app/admin/certificates/new` that pre-fills the resource field via a `resource` search param).
  Tabs are plain `?tab=` query-param links, not the ported `Toolbar`'s client-side `tabs` action kind
  (that one takes an `onChange` closure, which — like `onClick` — can't cross the Server→Client
  Component boundary from a page that fetches its own data; `PageChrome` doesn't bridge it (yet)).
  Budgets & Model Access is a `ComingSoon`-style stub — needs the token-budget/model-registry schema
  this rebuild hasn't ported (rebuild doc §8, step 4+).
- **`app/admin/settings/{page.tsx,actions.ts}` + `lib/org-settings.ts`** (docs/PAGE_DESIGN.md §1.9)
  — Server identity (a plain read of `ServerIdentityDAO.getServerVaultysId()`, no new state);
  Trust policy (`updateTrustPolicyAction` persists `trust.failMode`/`trust.stapleTtlSeconds` as
  `Setting` rows, trust doc §5.3 — genuinely written, not yet read by any verifier, and the page
  says so); General (`updateGeneralSettingsAction` sets `org.name`, which `app/admin/layout.tsx`
  reads and threads through `AppShell` → `Sidebar` as the `orgName` prop — the one piece of this
  page that's fully wired end to end, not just persisted). `lib/org-settings.ts` centralizes the
  `Setting` key strings and defaults so the page, its actions, and the layout can't drift on them.
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
  real DID); an Actor upserted + granted a certificate → reconnects and gets `auth_complete`;
  `heartbeat` → `pong`; a self-signed `cert_status_request` → a verified, signed
  `cert_status_response` whose issuance is also correctly persisted as a `CertStatusCheck` row
  (`requesterDid`, `status`, `checkedAt`), readable back via `CertStatusCheckDAO.listForCert` and
  rendered on the certificate detail page.
- **Settings**, end to end in a real browser: changing the organization name updates the sidebar
  immediately on the next render (proving the `layout.tsx` → `AppShell` → `Sidebar` prop-threading
  actually works, not just that the value persisted); saving the trust policy form with its default
  values round-trips correctly (`trust.failMode: "closed"`, `trust.stapleTtlSeconds: "0"` confirmed
  in the DB after submit).
- **Dev-mode double-SRP bootstrap**, both at the protocol layer (calling `UserLoginChannel.
  handleRequest` directly, driving both Challenger rounds by hand) and end to end in a real
  browser against a live dev server on a freshly reset database: clicking "Connect without the app"
  runs the login round, then transparently a second `service: "certificate"` round, before
  `signIn` ever fires; the resulting `bootstrap-admin-cert` persists with `certFormat: "challenger"`
  and `metadata.pk2.capabilities = ["admin_console_access"]`, independently re-verifies
  (`Challenger.verifyCertificate`), and the signed-in browser correctly lands on `/admin` with the
  capability already in place — no race between sign-in and the grant landing.
- **Login flow**, against a real running dev server: `/` redirects to `/login` when
  unauthenticated; `/api/public/user/p2p-connect` genuinely opens a PeerJS/WebRTC channel (proving
  the `@roamhq/wrtc` native bindings work in this environment) and returns a real connection
  string/DID; a simulated completed handshake driven through the **real** NextAuth HTTP endpoints
  produces a correct session.
- **Admin approval flow**, end to end against a live server: a bootstrap admin signed in over real
  HTTP correctly sees the Overview/Actors pages; a second human *without* the capability
  correctly gets "Access denied" at the same route; `approvePendingRegistration` correctly creates
  the `Actor`, issues a real certificate (1-year expiry, not indefinite — the "no expiry"
  exception stays reserved for bootstrap), and the Actors page reflects it on reload (pending
  count → 0, new Actor listed).
- **Design system + full nav, end to end in a real browser** (not curl — Server Actions and
  client-side navigation need a real DOM): the admin console renders with the ported theme/sidebar/
  topbar; issuing a certificate through the real form (Actor select, capability checkboxes,
  scope, expiry preset) creates a real cert and redirects back to the list; revoking it through the
  real button flips its status, drops the active count, and removes its own revoke form from the
  row; granting a human `portal_access` through that same flow immediately unlocks `/portal` for
  them, and their **My Certificates** page correctly shows both that grant and their
  `system:bootstrap`-issued `admin_console_access` grant with correct `issuedBy` provenance.
- **Interactive certificate issuance** (trust doc §3.2b), a real WS client running the actual
  Challenger crypto against a live `ControlPlaneWSServer` in-process (so the `getWSServerInstance()`
  singleton is genuinely reachable, exactly like the real Server Action path): (1) an unknown
  agent registers, sends `capability_request` for two capabilities, and an admin approves with a
  *different, reduced* set — confirming "accept but modify" actually lands; the server then
  proactively starts a `service: "certificate"` exchange, completes it, and persists a
  `certFormat: "challenger"` row whose capabilities match the admin's edit, not the original
  request; `inspectCertificate` independently re-verifies it (`Challenger.verifyCertificate`)
  end to end. (2) The offline-delivery path: an agent registers then disconnects *before* approval;
  approving while offline correctly leaves `deliveredAt: null`; reconnecting with the same identity
  triggers `deliverIfApproved` and the same live exchange, ending in `cert_issued` and
  `deliveredAt` set. (3) The certificate detail page renders a `"challenger"`-format row correctly
  in a real browser — decoded pk1/pk2/nonce/sign1/sign2/metadata, verified badge, no "Embedded
  request" section (there is no separate request token for this format) — alongside a pre-existing
  `"packcert"` row (the bootstrap grant) rendering exactly as before, confirming the `certFormat`
  branch in `lib/cert-inspect.ts` didn't regress the older format.
- **Caveat, not verified**: the actual PeerJS/WebRTC wire exchange with a real VaultysId wallet
  app (no physical wallet in this environment — the Challenger crypto itself is already proven via
  the WS-agent path). One incidental observation from testing against the public PeerJS relay: an
  unidentified external peer attempted a connection mid-session (logged as a FIDO2/WebAuthn parse
  error) — a reminder that a public broker means the listening peer ID is reachable by anyone who
  guesses or observes it, not just the intended wallet; worth keeping in mind if/when this moves
  toward a real deployment.

## Explicitly deferred (next slices, not started)

- **WebRTC/PeerJS transport for agents** (trust doc §4.4) — `AgentSender` is shaped for it; not
  implemented. (The login flow's own PeerJS/WebRTC usage is separate and already built.)
- Everything the remaining placeholder pages describe: Audit Log (unified signed IntentLog/
  ActivityLog), Integrations (OIDC/Entra, API Keys, Webhooks, Notification Channels, Model
  Registry). Actors, Certificates, Workspaces (Overview/Actors/Access tabs — Budgets & Model
  Access still a stub), and Settings are real. The certificate detail page (§1.5's signature-chain
  view) is built (`app/admin/certificates/[id]/page.tsx`) and its status-check-history section is
  real too — see `CertStatusCheckDAO` below.
- **Trust policy enforcement.** `/admin/settings` genuinely persists `trust.failMode`/
  `trust.stapleTtlSeconds` (trust doc §5.3), but nothing reads them yet — no verifier in this
  rebuild consumes `packages/policy`'s `verifyCertStatusResponseCert(vid, token, maxAgeMs)` with a
  `maxAgeMs` derived from the staple TTL. The Settings page says so directly rather than implying
  enforcement that doesn't exist. Per-workspace override columns (trust doc §5.3's `Workspace.
  certFailMode`/`certStapleTtlSeconds`) also aren't added to the schema yet — org-wide is the only
  level today.
- A human's `name`/email is now editable from the Actor detail page (`updateActorAction`), but a
  freshly registered human still starts as `name: "Unnamed"` with no email — no first-login
  profile-completion prompt yet, it's admin-driven only.
- Notification Channels/Apprise, Webhooks, Model Registry, OIDC/Entra — added to the schema and
  this package only once each is actually being built.
- A Docker-gated integration test suite (mirroring the root project's `vitest.config.docker.mjs`
  pattern) covering the DB layer, the WS handshake, and the admin flows.

## Design rules carried over from the rest of the monorepo

- `packages/policy` and `packages/trust` stay pure/dependency-light — this package is the only
  place their outputs get persisted or driven by I/O (same layering as `packages/control-plane`
  today).
- Humans are Actors (`kind: "human"`), not a separate identity/permission table — see the
  schema comment on `Actor`/`User` before reintroducing a parallel `role` concept.
