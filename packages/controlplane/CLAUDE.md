# packages/controlplane

The VaultysClaw control plane — administration-first, the `CapabilityCertificate` ledger
at the core. See [`docs/REBUILD_ARCHITECTURE.md`](../../docs/REBUILD_ARCHITECTURE.md) and
[`docs/CERTIFICATE_WEB_OF_TRUST.md`](../../docs/CERTIFICATE_WEB_OF_TRUST.md) for the design this
implements.

**This is now the only control plane.** `packages/control-plane` — the pre-rebuild app this one was
built alongside — has been deleted from this branch, along with `packages/agent-runtime`,
`packages/agent-controller`, `packages/mcp-gateway` and `packages/notifier`. Notes below that say
"ported from `packages/control-plane`" or compare against it are **provenance, not navigation**:
that code is only on older branches, so don't try to open it. A handful of deferred items below are
phrased as "not ported yet"; read those as "not built".

The client half of the protocol lives in `packages/sdk` (TypeScript) and `sdk-go/` (Go).

## Development

```bash
pnpm controlplane:dev              # docker compose up --wait, then the dev server
# or, separately:
pnpm controlplane:docker:up        # postgres + redis + apprise only (docker/docker-compose.controlplane.yml)
pnpm --filter @vaultysclaw/controlplane dev
```

`docker/docker-compose.controlplane.yml` is the dev stack — Postgres on **5433**, Redis on
**6381**, Apprise on **8000** (the non-default ports date from when a second control plane's stack
held 5432/6380; they are kept so an existing local `.env` keeps working). Redis and Apprise are
optional (`REDIS_URL`/`APPRISE_API_URL` unset just turns off Webhooks/Notification Channels, per
their sections below); Postgres is required. See `.env.example` for the full variable set.

**Redis/Apprise being reachable is not enough on its own** — a `packages/webhook-dispatcher`
instance also has to actually be running and consuming the queue, or events enqueue correctly and
then just sit there forever (this exact gap shipped once — see the health check note under
Notification Channels below). Start one with:

```bash
pnpm controlplane:webhook:dev
```

This copies `prisma/schema.prisma` into `packages/webhook-dispatcher/prisma/` and generates a
client there first (`controlplane:webhook:prisma` — that package has no schema of its own locally),
then starts the worker with `REDIS_URL`/`BULLMQ_PREFIX`/`APPRISE_API_URL` pointed at this stack.
Run it in its own terminal — it is deliberately not wired into `controlplane:dev`, so remember it
exists: without a dispatcher consuming the queue, events enqueue correctly and then sit there
forever (see the health-check note under Notification Channels).

## Status

Backend core, the WebSocket connection lifecycle, VaultysId QR login, the full admin navigation
shape (real + placeholder pages), real Actors/Sensors/Map/Certificates/Workspaces/Settings pages,
the Model Registry, OIDC/Entra ID single sign-on, the Access Portal shell, and the design system
(ported from `packages/control-plane`) are built.

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
  Its `useEffect`s key off a `JSON.stringify` of just the serializable toolbar/breadcrumb content
  (title, description, actions minus `icon`/`onClick`), not an empty array or the raw prop
  objects — a real bug, found on the Integrations `?tab=` switch (§ below): a route whose toolbar
  depends on `searchParams` only gets a fresh RSC render on navigation, not a remount of this
  already-mounted Client Component, so an empty array froze the toolbar at whatever it showed on
  first mount (Integrations kept saying "webhooks" on every tab); the "obvious" fix of depending on
  the raw objects instead crashed the page ("Maximum update depth exceeded") because inline JSX
  object/array literals are fresh references every render, so that dependency never settles.
- **Full nav shape** (`components/layout/Sidebar.tsx`): Overview, Actors, Sensors, Map,
  Certificates, Workspaces, Settings, Integrations (both tabs), and Audit Log are all real.
- **`app/admin/certificates/`** — the real Certificates page (docs/PAGE_DESIGN.md §1.5): list with
  status badges, scope, and the "Never" expiry rendered in warning-amber (never neutral, per the
  "loud, not silent" rule); an issuance form (`new/page.tsx`) with the explicit no-expiry
  confirmation checkbox; inline revoke (reason required) via Server Actions in `actions.ts`.
  `lib/certificates.ts`'s `issueAdminGrant` gained an optional `scope` param to support this.
- **`app/portal/`** — the Access Portal shell (docs/PAGE_DESIGN.md §2), gated on `portal_access`
  instead of `admin_console_access`: `page.tsx` (My Certificates, real data — the one portal page
  built for real, since it's a direct `CapabilityCertificateDAO` query) and `agents/page.tsx` (My
  Agents, placeholder — needs the per-kind "connect" mechanism, deferred).
- `app/page.tsx` shows `components/marketing/LandingPage.tsx` (nav, hero, stats strip, feature
  grid, closing CTA, footer — styled after `packages/control-plane`'s own landing page, copy
  rewritten for this rebuild's actual features: one Actor ledger, signed capability certificates,
  the append-only audit log, webhooks/notification channels) to an anonymous visitor, and routes a
  signed-in human to `/admin` or `/portal` based on which capability they actually hold, instead of
  a bare "logged in" placeholder. `app/login/page.tsx` gained matching branding (gradient/mesh
  background, a feature-bullet panel beside the QR card on wide screens) — same underlying state
  machine, styling only.
- **Dev-mode login without a physical wallet** — `lib/browser-connect.ts` (client, ported from
  `packages/control-plane`'s equivalent — **all four** of its identity-generation paths, not just
  software: `"software"`/`"software-pqc"` (`VaultysId.generateMachine()`, the latter passing
  `"dilithium_ed25519"` — a real algorithm choice the library already supported that neither
  control-plane app had ever actually used; `packages/control-plane`'s own "PQC" badge was purely
  decorative, see `components/DevIdentityPicker.tsx`'s doc comment) and `"passkey"`/`"hardware"`
  (real `navigator.credentials.create()` WebAuthn calls + `VaultysId.fido2FromAttestation`, verbatim
  from that package's `getPkCred`/`generateBrowserId` — not stubs), plus
  `UserLoginChannel.handleRequest` and two new routes (`app/api/public/user/connect`,
  `app/api/public/user/request/[token]`) implementing the *classic* Challenger exchange relayed
  over plain HTTP POSTs instead of PeerJS/WebRTC — no native bindings needed for the software/PQC
  paths (passkey/hardware still need a real platform/FIDO2 authenticator, same as production). The
  login page's "Connect without the app (dev mode)" link is gated on `process.env.NODE_ENV !==
  "production"` (inlined at build time by Next.js, safe to check directly in a Client Component).
  The browser can hold **several** VaultysIDs side by side, of any of the four types
  (`listStoredDevIdentities`/`generateDevIdentity(type)`/`removeStoredDevIdentity`, keyed in
  `localStorage` under `vaultysclaw:devIdentities`, migrated automatically from the older
  single-identity key if present) rather than always silently reusing/overwriting one —
  `components/DevIdentityPicker.tsx` is a full-screen modal (portaled to `document.body` — an
  ancestor's completed `animate-fade-in-up` CSS animation leaves a resolved, non-`none` `transform`
  behind, which creates a containing block for `position: fixed`, so an in-place modal would be
  confined to that ancestor's box instead of the real viewport) letting a developer pick which
  stored identity to connect as or generate a fresh one of a chosen type, from both `/login` and
  `/invite/[token]`'s dev-mode controls — makes testing as several different humans not require
  destroying the previous identity first. Omitting a picker choice falls back to whichever identity
  was used most recently (tracked separately, `vaultysclaw:activeDevIdentityDid`) — the same
  one-click behavior this had before multiple identities existed. **This only ever registers/logs in as a genuinely new or
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
  connection; plus `locationLat`/`locationLon`/`locationLabel`, ported from the old app's identical
  `Agent`/`User` fields — see `/admin/map` below), `ActorLink` (a directed, freely-labeled edge
  between any two Actors — "reports to", "belongs to", ... — deliberately generic, not a fixed
  relation type), `User` (1:1 human-profile extension of a `kind: "human"` Actor),
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
  `SensorWorkload` (a `kind: "sensor"` Actor's classified AI/agent process observations — no
  separate device table, the sensor's own connection already makes it an `Actor`; upserted by
  `(deviceDid, fingerprint)`, current-state not a log), `Workspace`, `Webhook`, `NotificationChannel`
  (see Webhooks / Notification Channels below). Deliberately minimal — models get added here as
  each subsequent feature is actually built, not ahead of time.
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
- `lib/capabilities.ts` — `AGENT_CAPABILITIES` (openclaw/mcp) vs. `SENSOR_CAPABILITIES` (today, just
  `process_read` — `vaultysclaw-sensor` gates reading local process info at all on actually holding
  this) and `allowedCapabilitiesForKind(kind)`, the allow-list `lib/registrations.ts`'s
  `approvePendingRegistration` filters a submitted grant against — anything not in the matching
  list is dropped even if somehow submitted (e.g. a direct form post), not just hidden in the UI.
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
  Next.js custom-server process) reach the live connection map at all. `deliverApprovedCapabilities`
  always sends `auth_complete` the moment it promotes a still-connected pending sender into
  `connected`, *before* deciding whether to start the certificate exchange — a sensor approved with
  zero capabilities skips the exchange entirely and is just marked delivered, since there's nothing
  to certify; without `auth_complete` sent first regardless, a client whose only capability grant
  ever comes back empty would never be told it's connected at all (found wiring
  `vaultysclaw-sensor` against this server for real — see below). **The certificate itself carries
  no metadata for this exchange** — `github.com/vaultys/vaultysid/go` (the sensor's Challenger
  implementation) has a verification bug where non-empty signed metadata always fails Go-side
  re-verification (`Step2`/`Finalize` reconstruct the signed payload with metadata hardcoded to
  empty instead of what was actually received); rather than depend on a fix landing in a pinned
  external dependency, `cert_issued` instead carries the granted capabilities as a plain, unsigned
  `capabilities: string[]` field alongside the certificate bytes — see
  `vaultysclaw-sensor/docs/vaultysclaw-integration.md`'s phase 4 update for the full story.
- **`handleSensorTelemetry`** (also in `lib/ws-server.ts`) — the one kind-specific message this
  file handles: a connected `kind: "sensor"` Actor's classified AI/agent process observations
  (`vaultysclaw-sensor/docs/vaultysclaw-integration.md`). Upserts into `SensorWorkload` by
  `(deviceDid, fingerprint)` — current-state, not an append-only log, matching the sensor's own
  "report deltas" model — via `SensorWorkloadDAO`. `deviceDid` is always the connection's own
  authenticated identity (`connectedBySender`), never the client-claimed `agentId` field the Go
  sensor also sets on the envelope. Also merges the batch's `Device.hostname`/`os` into the Actor's
  `kindConfig` (`ActorDAO.mergeKindConfig`) — kind-specific fields don't get their own columns.
- **`app/admin/sensors/{page.tsx,[did]/page.tsx}`** (ported from `packages/control-plane`'s
  fleet-monitoring page) — a list (stat cards: sensor count, online now via
  `getWSServerInstance().isConnected`, total/shadow workloads via `SHADOW_THRESHOLD =
  0.75` in `db/sensor-workload.dao.ts`) and a per-device detail page (workloads table, Shadow/
  Observed pill per row). No "assigned user" column like the old app had — that concept doesn't
  exist in this rebuild's schema at all; a sensor's owner/relationship is just an `ActorLink` (see
  below), shown read-only here and edited from the Actor detail page.
- **`lib/workload-status.ts`** — the managed/observed/shadow correlation
  (`vaultysclaw-sensor/docs/vaultysclaw-integration.md` §4): `resolveManagingActors` batch-resolves
  a set of workloads' `SensorWorkload.identityEvidence` values against `ActorDAO.findManyByDid`
  (one query, not N+1), excluding any that resolve to a `kind: "sensor"` Actor — a sensor's own DID
  never counts as "managing" a workload it observed on itself; `computeWorkloadStatus` then returns
  `"managed"` for a workload whose evidence resolved to a real Actor, otherwise falling back to the
  existing `agentConfidence >= SHADOW_THRESHOLD` shadow/observed split. The sensor decides nothing
  here — an unresolved or revoked DID just falls through to shadow/observed, same as no evidence at
  all. Wired into both `/admin/sensors` (a new "Managed" stat card) and the per-device detail page
  (a third status pill, plus "by `<Actor name>`" linking to the managing Actor's page when
  applicable). `vaultysclaw-sensor` populates real `identityEvidence` via an operator-configured
  `agentIdentityPath` pointing at a real agent's own identity file — see that repo's integration
  doc for the sensor-side half.
- **Actor location** (`Actor.locationLat`/`locationLon`/`locationLabel`, ported from the old app's
  identical `Agent`/`User` fields) — set from the Actor detail page (`lib/geocode.ts`'s server-side
  Nominatim lookup by city name, or exact coordinates) or from `/admin/map` directly (click a pin →
  `components/map/world-map/LocationEditor.tsx`, same modal, calling the same
  `setActorLocationAction`). `/admin/map` is `packages/control-plane`'s OpenLayers world map
  (`components/map/world-map/*`), ported near-verbatim — clustering, pin styling, tile source, all
  unchanged — with `MapMarker.type` now an Actor `kind` (openclaw/human/sensor/mcp) instead of the
  old app's agent/user/docling/s3, and `online` read from the same live WS connection map every
  other "online" indicator in this app uses, not a stored field.
- **`ActorLink`** (`db/actor-link.dao.ts`) — a directed, freely-labeled edge between any two Actors
  ("reports to", "belongs to", "manages", ...), deliberately generic rather than a fixed relation
  type like the old app's sensor-only "assigned user". Edited from the Actor detail page's
  Relationships section; shown (read-only) on the Sensors list as a stand-in for what "assigned
  user" used to show.
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

## Webhooks

Signed HTTP delivery to admin-configured endpoints — kept as core per `docs/REBUILD_ARCHITECTURE.md`
§3, first Integrations slice actually built (`app/admin/integrations`, previously a bare
`ComingSoon` stub). Same wire format and dispatcher code as `packages/control-plane`'s webhooks
(root `CLAUDE.md`'s "Adding or changing a webhook event" checklist still applies — extend
`@vaultysclaw/shared`'s `WEBHOOK_EVENTS` catalog, add a payload builder, add a docs example), but
this package's admin surface is plain Server Actions, not ts-rest, since that's this rebuild's
pattern everywhere else.

- **Schema**: `Webhook` model (`prisma/schema.prisma`) mirrors `packages/control-plane`'s
  field-for-field — same shape `packages/webhook-dispatcher` already expects, so that package's
  code works against this schema unmodified. `db/webhook.dao.ts` is a plain DAO (no ts-rest
  contract layer); `lib/webhook-secret.ts` has `generateWebhookSecret`/`secretPreview`.
- **Event catalog**: this package's own events (`actor.registration_requested`, `actor.approved`,
  `actor.denied`, `actor.updated`, `certificate.issued`, `certificate.revoked`) were added to
  `@vaultysclaw/shared`'s `WEBHOOK_EVENTS` under new "Actors"/"Certificates" groups — the catalog is
  genuinely shared across both control-plane packages, not forked. `workspace.created`/`updated`
  are reused as-is from the existing "Workspaces" group (`workspace.deleted` has no emission site
  yet — there's no workspace-delete action in this rebuild at all). `lib/webhook-events.ts`'s
  `CONTROLPLANE_WEBHOOK_EVENTS` filters the shared catalog down to just these groups — the
  create/edit forms and the docs page all read from it, not the raw shared catalog, so an admin
  here is never offered a checkbox for an event (e.g. `agent.created`, `model.updated`) that
  belongs to control-plane's domain and will never actually fire in this app.
- **Producer** (`lib/webhook-queue.ts`): same BullMQ queue *name* as control-plane
  (`WEBHOOK_QUEUE_NAME`) but a distinct `prefix` (`"vaultysclaw-controlplane"`) — this package's
  Postgres is entirely separate from control-plane's, so a shared Redis must never let one
  dispatcher process treat the two apps' jobs as one queue. **Running an actual dispatcher for this
  schema means a separate `packages/webhook-dispatcher` instance**, pointed at this package's
  `DATABASE_URL` with its `Queue`/`Worker` `prefix` set to that same value — not a code change to
  the dispatcher, a deployment-time configuration difference. Fire-and-forget and a no-op when
  `REDIS_URL` is unset, same as every other producer in this monorepo.
- **Payloads** (`lib/webhook-payloads.ts`): `stripSensitive` (same key-blacklist regex as
  control-plane) + `actorPayload`/`certificatePayload`/`workspacePayload` — explicit allow-lists for
  this package's actual domain objects. Deliberately excludes an Actor's `kindConfig` (kind-specific,
  not guaranteed safe/meaningful) and location fields, and a certificate's raw `certificate`/
  `requestCertificate` bytes.
- **`performedBy` / `adminUrl`** — attached at each emission site (every call site already has
  `session.user` or an `approver`/`denier` parameter; the payload builders above don't, so this
  isn't baked into them) rather than derived downstream: `performedBy: {did, name}` is the admin
  who did it (absent for events with no human origin, e.g. `actor.registration_requested` — an
  agent's own connection attempt), and `adminUrl` (`buildAdminUrl`/`actorAdminUrl` in
  `webhook-payloads.ts`, built from `APP_URL`/`NEXTAUTH_URL`) is an absolute deep link back to the
  relevant page — `/admin/actors` (list, not a DID-keyed detail page) for
  `registration_requested`/`denied`, since no Actor row exists yet for either; the specific
  detail/edit page for everything else. Both fields ride along on the raw Webhook payload too
  (an external system may find a deep-link just as useful), and are what
  `packages/webhook-dispatcher/src/render.ts` appends to every Notification Channel body ("By: …" /
  "View: …") — see that package's CLAUDE.md.
- **`changes` / `grantedCapabilities`** — what actually changed, alongside who changed it.
  `diffFields(before, after, fields)` (`webhook-payloads.ts`) compares specific fields between a
  fetched-before-update row and the updated one, returning only the fields that actually differ
  (`workspace.updated`: name/description/color; `actor.updated`: name/workspaceId/email — the last
  needs an extra `UserDAO.findByDid` first, since `email` lives on the separate `User` profile, not
  `Actor`) — attached as `changes: FieldChange[]`. There's no "before" to diff for a `*.created` or
  `actor.approved` event; the latter instead carries `grantedCapabilities` (the filtered set
  `approvePendingRegistration` actually persists, not the raw submitted list) as the change that
  matters for that event. `render.ts` renders both into the body ("Changes:\n  field: from → to",
  "Granted: …") — see that package's CLAUDE.md for the exact formatting rules (e.g. `(none)` for a
  null/empty value, so a rendered diff never shows a bare empty string).
- **Admin UI** (`app/admin/integrations/{page.tsx,actions.ts,webhooks/*}`): list, create, edit,
  toggle active, delete, regenerate secret. The one-time secret reveal
  (`webhooks/NewWebhookForm.tsx`, `webhooks/RegenerateSecretButton.tsx`) is a new pattern for this
  rebuild — a Client Component calling a `"use server"` action directly (not via `<form action>`)
  and `await`-ing its return value, which Next.js supports natively; every other Server Action in
  this package so far has been fire-and-`redirect`/`revalidatePath` with no return value needed.
- **Docs** (`lib/webhook-docs.ts` + `app/admin/integrations/webhooks/docs/page.tsx`): same
  "examples built from the real payload builders, so they can't drift" approach as control-plane,
  restricted to `CONTROLPLANE_WEBHOOK_EVENTS`. A Server Component throughout — the original's
  collapsible event list used client-side `useState`; this one uses plain `<details>`, no JS needed
  for that interaction.

## Notification Channels

Human-facing alerts fanned out through a self-hosted Apprise API container (docs/
REBUILD_ARCHITECTURE.md §5) — the other half of the same event pipeline Webhooks use, not a
separate one (§5.1): `packages/webhook-dispatcher`'s single worker fans every job out to both
subscription kinds. `app/admin/integrations` gained a second tab (`?tab=channels`, `TabLink`
mirroring `app/admin/workspaces/[id]/page.tsx`'s own `?tab=` pattern) now that Integrations has two
real sections, not one.

- **Schema**: `NotificationChannel` (`prisma/schema.prisma`) — `appriseKey` (unique, plain, the
  identifier Apprise stores config under), `serviceUrls` (one or more `apprise://` URLs,
  newline-separated, **encrypted via `lib/vault.ts`** since they often embed credentials, e.g.
  `mailto://user:pass@host`), `serviceTypes` (plain `string[]`, e.g. `["slack"]` —
  `lib/apprise.ts`'s `extractServiceTypes` pulls just the URL scheme out of `serviceUrls` *before*
  encrypting it; not sensitive, unlike the rest of the URL, and it's the one thing that actually
  lets an admin tell channels apart in the list/detail UI — `ServiceTypeBadges.tsx` renders it via
  `serviceTypeLabel`'s friendly-name map, falling back to the capitalized raw scheme for anything
  not in that short list), `events` (same catalog as Webhooks), `isActive`, `createdBy`. Unlike
  a Webhook's `url`, the dispatcher never needs `serviceUrls` back — Apprise itself stores what an
  `appriseKey` points at, pushed once via `/add` at create/update time — so `db/notification-
  channel.dao.ts` and the dispatcher's own query both only ever touch `id`/`appriseKey`/`events`/
  `isActive`, never the encrypted column, keeping the decrypt capability confined to this
  package's own process (the only one holding the server's VaultysId).
- **Admin-CRUD-time Apprise client** (`lib/apprise.ts`): `pushAppriseConfig`/`deleteAppriseConfig`
  call `POST {APPRISE_API_URL}/add|del/<appriseKey>` — confirmed empirically against the real
  `caronc/apprise` image that **both are POST**, including `/del` (a bare `DELETE` returns 405),
  contradicting docs/REBUILD_ARCHITECTURE.md's description of that endpoint as `DELETE`. Both
  throw on failure rather than swallowing errors — create/update need the admin to see immediately
  if Apprise rejected the URLs or is unreachable, not discover a channel that silently never
  delivers anything; delete is more lenient (`app/admin/integrations/actions.ts`'s
  `deleteChannelAction` catches and logs a failed Apprise cleanup but still removes the local row,
  since an unreachable Apprise shouldn't permanently block an admin from clearing their own list).
- **Encryption**: `lib/vault.ts`'s existing `encryptSecret`/`decryptSecret` (VaultysId
  signcrypt-to-self) — the same primitive already used elsewhere in this package, no new
  secret-handling path introduced. The service-URLs field is treated as **write-only** in the edit
  form (`channels/[id]/page.tsx`): never decrypted back into the page, blank means "keep the
  existing value," matching how a webhook's HMAC secret is handled (shown once, not re-displayed)
  even though the underlying reason differs slightly (these are admin-entered credentials, not a
  system-generated token).
- **Admin UI** (`app/admin/integrations/{page.tsx,actions.ts,channels/*}`): list, create, edit,
  toggle active, delete — no "reveal" flow needed here (unlike a webhook's generated secret, the
  admin supplies these values directly), so `channels/new/page.tsx` is a plain
  `<form action={createChannelAction}>` + redirect, no client-component wrapper.
- **Dispatcher extension** (`packages/webhook-dispatcher`): `src/render.ts` (`renderNotification`
  — `{title, body, type}` templates for this package's actor/certificate/workspace events, `null`
  for anything else so an event with no template is skipped, not sent blank), `src/apprise.ts`
  (`notifyApprise`, delivery-time only — never needs `serviceUrls`), and `delivery.ts`'s
  `processNotificationJob`/`selectNotificationTargets` (same fan-out/retry-skip shape as
  `processWebhookJob`, tracked separately as `_notifiedChannels` since channel ids and webhook
  endpoint ids are different namespaces). Gated on `APPRISE_API_URL` being set — unset means the
  whole notification-channel path is skipped, webhook delivery is unaffected either way. See that
  package's own CLAUDE.md for the full picture, including the real, documented limitation that
  Notification Channel failures aren't currently dead-lettered (only webhook failures are).
- **Health check** (`lib/integrations-health.ts`, `channels/HealthPanel.tsx`, shown at the top of
  the Notification Channels tab): Redis and Apprise being independently reachable is genuinely not
  enough to know a channel will actually fire — an event can enqueue correctly and then sit
  forever if no `packages/webhook-dispatcher` instance is running (exactly what happened once: the
  producer worked, `enqueueWebhook` doesn't throw when nothing's consuming, so nothing surfaced
  the gap until an admin noticed a specific notification never arrived). Redis/Apprise are checked
  by direct reachability (`queue.client`'s resolved `status`, a `fetch` to the base URL);
  "Dispatcher" is checked via BullMQ's `Queue.getWorkers()` on the same queue+prefix
  (`vaultysclaw-controlplane`) — the one signal that actually answers "is anything consuming this
  queue right now," which reachability alone can't. All three reuse `lib/webhook-queue.ts`'s
  existing `getQueue()` singleton/connection rather than opening a second one just to check health.

## Model Registry

The org's catalogue of LLM endpoints and which workspaces may use each (docs/PAGE_DESIGN.md §1.8,
"unchanged from today"). A third Integrations tab (`?tab=models`), same `TabLink` pattern as the
other two. Postgres is the source of truth; **LiteLLM is pushed to, never read back** — nothing
here writes the proxy's model list into `ModelRegistry`, so an unconfigured or unreachable proxy
degrades the registry to inert catalogue data instead of breaking it.

- **Schema**: `ModelRegistry` + `ModelWorkspaceAccess` (`prisma/schema.prisma`, migration
  `add_model_registry`). Two deliberate divergences from packages/control-plane's version, both
  documented on the models themselves: `isActive Boolean` rather than its `status String` (every
  other toggleable row here is already `isActive`, and a two-valued String is a stringly-typed
  boolean), and **no `WorkspaceRouterKey`/per-Actor `litellm*` virtual-key columns** — those are the
  *enforcement* half of the old design and there is nothing in this package to consume a minted key
  yet (no LLM-config push to Actors). A grant row is therefore an authorization record the console
  shows and audits, not something enforced at inference time; the workspace-access UI says so in as
  many words rather than implying a guarantee that doesn't exist.
- **`apiKeyEnc` never leaks by accident** (`db/model.dao.ts`): every read path a page or action uses
  returns `SafeModel`, which omits the column at the *query* level (a Prisma `select`, not a delete
  after the fact) and exposes only `hasApiKey`. The one path that needs the ciphertext has to call
  `findByIdWithSecret` by name, so handling a secret is greppable and obvious in a diff.
- **LiteLLM client** (`lib/litellm.ts`): `registerModel`/`removeModel`/`healthCheck`/`listModels`
  plus `probeProviderModels` (a direct provider probe for the form's "Test connection", which runs
  server-side because the endpoint is often on a private network the admin's browser can't reach and
  the key must never leave the server). Two things it deliberately does *not* port:
  - **No module-level config cache / `setLiteLLMConfig` / service-lifecycle singleton.** The old
    package resolves config from two mutable module globals seeded by an `initializeLiteLLMService()`
    call in `server.ts` — wrong under Next.js, where a Server Action and a Server Component render
    can be in different workers, so a config change is only visible to whichever one ran that call.
    Here every call reads the `Setting` rows, so an edit takes effect on the next request everywhere.
  - **No `createWorkspaceKey`/`createAgentKey`** — see the virtual-key note above.
  - Config lives in `Setting` (`litellm.baseUrl`, `litellm.masterKeyEnc`, keys in `lib/org-settings.ts`)
    with `LITELLM_BASE_URL`/`LITELLM_MASTER_KEY` as the deployment-time fallback, DB winning. Both
    halves must resolve or the integration reports "not configured" — a base URL with no master key
    can't authenticate against the proxy's admin API, and the panel says exactly that rather than
    looking configured while silently pushing nothing.
- **Bug fixed rather than ported**: control-plane's model-update route passes `updated.apiKeyEnc` —
  the *encrypted* value — to LiteLLM (its create path correctly passes the plaintext), which
  registers a model that can never authenticate upstream. Here `syncToLiteLLM` takes an explicitly
  named `apiKeyPlain`, and the update path decrypts the stored key when re-pushing so an
  endpoint/model-id edit doesn't silently drop the credential either.
- **Admin UI** (`app/admin/integrations/{page.tsx,actions.ts,models/*}`): list + `LiteLLMPanel`
  (three-state: connected / unreachable / not configured, plus "Re-push all models" to catch up
  models registered while the proxy was off), a shared `ModelForm.tsx` for register and edit, and a
  detail page with workspace-access toggles and delete. Provider is fixed after creation — it
  determines the LiteLLM name and wire format, so changing it in place would orphan the upstream
  registration. `lib/model-providers.ts` holds the per-provider defaults (lifted out of the old
  package's form component so the action validating a submission and the form rendering it agree on
  one list); agent-SDK providers are catalogued but never pushed, since they run a vendor harness
  rather than an HTTP endpoint.
- **Events**: `model.created`/`updated`/`deleted` — the shared catalog's own, so "Models" simply
  joins `EMITTED_GROUPS` in `lib/webhook-events.ts`. `modelPayload` (`lib/webhook-payloads.ts`)
  reports `hasProviderKey`, **not** `hasApiKey`: `stripSensitive` matches the substring `apikey`
  case-insensitively, so a field named `hasApiKey` — a boolean carrying no secret at all — would be
  silently deleted from every delivered payload. Renaming it was cheaper and more visible than
  adding an exception to the blacklist. Workspace grant/revoke emits `model.updated` with an
  explicit `workspaceAccess` diff rather than a new event type, since inventing one would mean
  emitting an event the shared catalog doesn't define.

## Identity: OIDC + Microsoft Entra ID

SSO as an **identity-establishment** path, never a parallel trust tier
(docs/CERTIFICATE_WEB_OF_TRUST.md §6.3). A fourth Integrations tab (`?tab=identity`).

**Entra ID is not a second protocol.** It's an OIDC IdP whose issuer is a function of the tenant
(`https://login.microsoftonline.com/<tenantId>/v2.0`), so there is one connector and one code path;
`SsoConnection.kind` exists only so the form asks for a tenant ID instead of a raw issuer URL (an
admin can't paste a subtly wrong Microsoft URL) and so Entra-specific features have somewhere to
hang later. This is deliberately unlike packages/control-plane, where OIDC is a NextAuth provider
and "Entra" is an entirely separate Microsoft Graph directory-sync feature with its own panel.

- **Schema**: `SsoConnection` + `SsoIdentity`, plus a nullable `Invitation.ssoIdentityId`. A real
  model rather than the old package's flat `Setting` rows (`oidc_issuer`, `oidc_client_id`, …),
  which allowed exactly **one** IdP per deployment — an org running both an in-house OIDC provider
  and Entra had to choose. Rows also make each connection independently enable/disable-able and
  auditable. `clientSecretEnc` is encrypted via `lib/vault.ts` — note the old package encrypts the
  OIDC secret but stores the **Entra** client secret in plaintext (`entra_client_secret`); that is
  not carried over.
- **The unbound-identity problem, and why it isn't solved with a nullable DID.** An IdP can tell us
  who someone is before they hold a VaultysId, and this schema has nowhere to put such a person:
  `Actor.did`/`User.did` are primary keys and `Session.user.did` is non-nullable, because every
  authorization decision here is a ledger lookup keyed by DID. packages/control-plane's answer was a
  nullable `User.did` plus a "claim your account later" state — i.e. a signed-in user who is not yet
  anybody in the trust model, exactly the parallel tier §6.3 rules out. **So an unbound SSO login
  never produces a session.** `lib/sso.ts`'s `resolveSsoLogin` returns either `{kind: "signin", did}`
  or `{kind: "bind", url}`, and the NextAuth `signIn` callback returns that URL — NextAuth turns a
  string return into a redirect. The binding URL is a system-issued, 1-hour `Invitation` carrying the
  IdP's own name/email, redeemed through **the existing invite flow** (wallet QR, or a dev identity
  in development); that handshake mints the Actor, and `registerHumanFromInvitation` then binds the
  external identity to the new DID. Every later login is an ordinary DID session with no SSO-specific
  path at all.
- **Security properties worth not regressing**: `bindDid` is a conditional `updateMany` on
  `did: null`, so a completed binding is never silently repointed at a different DID (which is what
  would let a replayed binding link take over an account) — losing that race leaves the existing
  binding intact. Each new unbound login deletes the previous pending binding invitation, so exactly
  one live link exists per identity (the raw token is never persisted, only its hash, so an old link
  can't be *reused* — but it can be left lying around, and this stops that). The recorded issuer is
  the connection's configured value, never the token's `iss` claim, so a token from elsewhere can't
  launder its origin. A freshly bound human holds `portal_access` **only** (`BINDING_CAPABILITIES`),
  deliberately not configurable per connection — "which IdP you came from" is not a good reason to
  hold more capability, and making it a knob would quietly turn SSO config into permission config.
- **Consequence to be explicit about**: anyone your IdP will authenticate can obtain an Actor (with
  no capabilities). That's the same trust boundary as the IdP itself, which is the point of
  federating — but a connection should point at a directory whose membership you control, not a
  public multi-tenant issuer.
- **NextAuth wiring**: `buildAuthOptions()` (`lib/auth-config.ts`) builds providers **per request
  from the DB**, and `app/api/auth/[...nextauth]/route.ts` awaits it — so adding or disabling a
  connection takes effect on the next login, not the next deploy, and multiple IdPs can coexist.
  Everything that merely *verifies* a session keeps importing the static `authOptions`; a JWT check
  needs no provider list. A connection whose secret can't be decrypted is dropped with a log line
  rather than thrown, so one broken connection can't take down the login page (including the
  VaultysId path, which doesn't depend on it).
- **UI**: `app/admin/integrations/identity/*` — one form with a kind switch (not two panels, which
  is also what stops the two drifting), live discovery "Test connection", and the **redirect URI**
  shown on the detail page with a copy button, since a mismatch there is the most common reason a
  new connection fails at first login. Creating/re-pointing a connection **refuses to save** against
  an issuer whose discovery document doesn't resolve or lacks authorization/token/JWKS endpoints —
  unlike a webhook URL, an IdP is live infrastructure, and a bad one produces a login button that
  fails only for whoever clicks it first. The login page fetches `/api/public/sso/providers` (id +
  display name + kind only — never issuer or client id) and renders buttons below the QR; the invite
  page swaps its copy when `?sso=1`, since "you've been invited" is the wrong thing to tell someone
  who just authenticated with their own corporate account and is mid-flow.
- **Not built**: Entra **directory sync** (Microsoft Graph client-credentials user/group
  pre-provisioning, `lib/entra-sync.ts` in the old package). Login works without it; sync is a
  separate feature for pre-creating accounts, and porting it means porting Graph paging and a second
  credential path. No `sso.*` webhook events either — the shared catalog defines none, and inventing
  some here would emit events packages/control-plane's catalog doesn't know; connection changes are
  audited via `recordEvent` instead, and those payloads never carry the client secret.

## Custom Capabilities

Admin-defined `vendor:action` capability names (`docs/CUSTOM_CAPABILITIES.md`), carried by the
same certificates, scoping, expiry and revocation as built-in ones. The control plane governs who
may hold a name; what it *permits* is decided by whichever application binds an operation to it.

- **Grammar and helpers** live in `@vaultysclaw/policy`, not here: `AgentCapability` is now
  `BuiltinCapability | \`${string}:${string}\``, with `CUSTOM_CAPABILITY_RE`,
  `assertValidCapabilityName`, `parseCustomCapability` and `filterAgainstRegistry` as the single
  source of truth. `sdk-go/capability` is the Go half, held to it by
  `conformance/capability-names.json` (27 cases, run by both suites).
  **Widening the union disabled exhaustiveness checking** over capabilities — a `switch` or
  `Record<AgentCapability, …>` silently stops being checked rather than failing to compile. Nothing
  in this package relied on it, but anything mapping a capability to a label or icon now needs an
  explicit fallback.
- **Registry**: `CustomCapability` (`prisma/schema.prisma`, migration `add_custom_capability`) +
  `db/custom-capability.dao.ts`. Org-global, admin-managed. **No `isActive`, no soft-delete** — the
  decision is hard fail-closed, and a "deprecated but still resolving" state would reintroduce
  exactly the grandfathering that was rejected. `name` is immutable; renaming is delete-and-recreate,
  which reads as (and is) a revoke.
- **Grantable set**: `lib/capabilities.ts`'s `grantableCapabilitiesForKind(kind)` = the kind's
  built-ins + every registry name. Custom names are deliberately **not** partitioned by kind — a
  `vendor:action` is meaningful to whichever application binds it, and a per-kind allow-list for
  admin-defined names would be a second registry to keep in sync for no security gain. Both
  issuance paths filter against it (`lib/registrations.ts`, `app/admin/certificates/actions.ts`),
  so a name deleted while a form was open grants nothing.
- **Fail closed, via the status protocol.** `lib/ws-server.ts`'s `handleCertStatusRequest` filters
  a certificate's custom capabilities against the live registry before signing the
  `cert_status_response` — that signed response, not the stored row, is what a holder keeps. This
  is the authoritative propagation path: deleting a registry row stops those grants resolving on
  every holder's next refresh, whether or not the revocation reached them. `deliverApprovedCapabilities`
  re-filters too, so a reconnect can't re-hydrate a name deleted while the Actor was offline.
  - **One place it can't hold, and says so**: `lib/actor-config.ts`'s `grantToken` is a packcert
    whose capabilities are *inside* the signature, so a stale name can't be filtered out without
    re-minting under a new id. That grant is **withheld** with an admin-visible warning instead —
    same shape as the existing challenger-format refusal.
- **Deletion is a mass revoke and the UI says so.** `app/admin/integrations/capabilities/[id]`
  shows the affected-grant count, requires the name typed to confirm, then revokes each affected
  certificate and pushes `actor_config` to connected holders. Steps beyond the delete are belt and
  braces; the status filter is what actually enforces it.
- **`actor_config` is no longer proxy-only.** Every kind now receives one, because the `trust`
  block is meaningful to anything that re-checks its own status. `resolveOrgTrust` maps the org-wide
  `trust.stapleTtlSeconds` for non-proxy kinds (0 keeps its strict "no cached status is acceptable"
  meaning, negative is unbounded); `proxy` keeps its own `maxStatusAgeSeconds` for the reason
  documented in that file. Before this, the Settings knob reached nothing at all.
- **Declared capabilities**: an Actor reports its manifest in `register`
  (`RegisterPayload.declaredCapabilities`), stored on `Actor.declaredCapabilities` once the
  handshake proves the DID. Purely informational — it drives the wanted/registered/granted table on
  the Actor detail page and the "requested but not grantable" hint on the approval list. **An Actor
  cannot declare a capability into existence**; an admin still creates the registry entry and
  issues the grant.
- **Events**: `capability.created` / `updated` / `deleted` (group "Capabilities" in the shared
  catalog). `capability.deleted` carries `affectedGrants`.

## Scale

The connection lifecycle is the hot path, and it was written as if one Actor connected at a time.
Fixed after a fleet simulator (`packages/simulator`) measured handshake p50 at ~3 s with 700
concurrent Actors and a collapse at 7,000. Same run after the changes below: **p50 840 ms, p95
1.3 s, zero errors** — roughly 3.6× on the same hardware and database.

What actually mattered, in the order it mattered:

- **The server identity was rebuilt per handshake.** `ServerIdentityDAO.getServerVaultysId()` did a
  `Setting` read *plus* `VaultysId.fromSecret` — ~0.75 ms of key derivation on the event loop — for
  a value written once at boot and never again. Every handshake signs with it and so does every
  `cert_status_response`, so a 7,000-Actor ramp spent ~5 s of pure blocking CPU re-deriving it. Now
  cached for the process's lifetime (`resetCache()` exists for tests). Rotating the identity means
  a restart, which was already true.
- **The connection pool was `pg.Pool`'s default of 10.** The WebSocket server and every Next.js
  request handler share one pool, and a handshake puts several queries behind it — so the queue in
  front of the pool, not Postgres, was the limit. `DATABASE_POOL_MAX` (default 40), with an
  `idleTimeoutMillis` so a bursty ramp doesn't pin the high-water mark, and a
  `connectionTimeoutMillis` so exhaustion surfaces as an error naming the pool instead of a request
  that never returns.
- **Write amplification on the two paths that scale with fleet size.** `lastSeen` was an UPDATE per
  heartbeat (~230/s at 7,000 Actors on a 30 s heartbeat) and `CertStatusCheck` an INSERT per status
  check. Both are now buffered in `ws-server.ts` and flushed every `FLUSH_INTERVAL_MS` (5 s) via
  `touchLastSeenBatch` / `recordBatch`. Safe because neither is read closely: **"online now" comes
  from the in-memory `connected` map, never from `lastSeen`**, and the status-check table is
  append-only audit data. A failed flush drops the batch rather than retrying — this process holds
  thousands of live sockets and must not grow an unbounded queue during a database outage.
  Everything that must not be lost (certificates, approvals, revocations) is still written inline
  and awaited.
- **An awaited write inside the handshake.** The reconnect branch did `await touchLastSeen(did)`
  before telling the Actor it was connected. Now buffered with the rest.
- **`setDeclaredCapabilities` wrote on every reconnect**, storing bytes already there. A manifest is
  fixed for the life of a build and the row is already in hand from the lookup, so it is now
  compared first (`sameDeclaredCapabilities`, order-insensitive — a stringify would report a change
  whenever an SDK emitted its declarations in a different order).
- **`CustomCapabilityDAO.listNames()` was a query per status check** — a scaling regression this
  feature introduced. Now cached with a 5 s TTL, invalidated by every write in that DAO, with
  concurrent misses collapsed into one query. The TTL is the window in which a capability deleted by
  *another process* still resolves, so it is a security property, not a performance knob — in-process
  deletions invalidate immediately.

Not addressed, and the next thing to look at: the Challenger handshake's own Ed25519 work runs on
the event loop, so handshake throughput is ultimately single-core. Moving it to a worker pool is the
only remaining structural fix.

## Audit Log

A unified, append-only log (docs/PAGE_DESIGN.md §1.6) — replaces the old app's split IntentLog
(agent intent execution)/ActivityLog (a simpler admin event log) with one table, since this
rebuild has no separate "intent execution" concept to track: every domain event already flows
through `lib/webhook-payloads.ts`'s sanitized builders and `lib/webhook-queue.ts`'s
`enqueueWebhook`, so the audit trail and the Webhooks/Notification Channels pipeline are always
the same "what happened" data, just two different consumers of it.

- **Schema**: `AuditLogEntry` (`prisma/schema.prisma`) — `eventType` (same catalog as Webhooks),
  `actorDid`/`actorName` (null for events with no human origin, e.g.
  `actor.registration_requested`), `targetType`/`targetId` (coarse type + id used to build a
  detail link — `"actor"` | `"certificate"` | `"workspace"`), `details` (the same sanitized
  payload already built for the event). No edit or delete — `AuditLogDAO` (`db/audit-log.dao.ts`)
  only ever `create`s, `list`s (filterable by `eventType`/`actorDid`/`from`/`to`), `count`s, and
  `recent`s.
- **`recordEvent()`** (`lib/audit.ts`) is the single call site every domain event goes through
  instead of calling `enqueueWebhook` directly: it writes the `AuditLogEntry` row (awaited,
  reliable) **and** calls the existing fire-and-forget `enqueueWebhook` with the exact same
  `eventType`/`payload` — one call drives both the audit trail and the Webhooks/Notification
  Channels pipeline. Every emission site (`app/admin/actors/actions.ts`,
  `app/admin/certificates/actions.ts`, `app/admin/workspaces/actions.ts`, `lib/registrations.ts`,
  `lib/ws-server.ts`'s `actor.registration_requested`) has been migrated to it; `enqueueWebhook`
  itself is no longer called from a domain site directly.
- **`app/admin/audit/page.tsx`** — the real page (docs/PAGE_DESIGN.md §1.6): a plain-GET filter
  form (event type, actor DID, from/to date), a list of entries (newest first, `<details>` per row
  disclosing the full JSON `details` blob, no client JS needed), a target link
  (`actor`/`certificate`/`workspace` → the matching detail page), and a live "signed"/"invalid"
  badge on certificate-related rows — computed the same way the certificate detail page does, by
  re-running `lib/cert-inspect.ts`'s `inspectCertificate` against the actual stored certificate
  bytes, not by trusting any stored flag. Actor kind badges and certificate re-verification are
  both batch-resolved once per page load (`ActorDAO.findManyByDid`, `CapabilityCertificateDAO.
  findManyByIds`), not per row.
- **Overview feed** (`app/admin/page.tsx`) — a "Recent activity" section (`AuditLogDAO.recent(20)`)
  with a "View full Audit Log →" link, giving the posture-summary page a live pulse instead of
  only static counts.

## Actor categories, devices & delegation

`Actor.kind` (`openclaw` | `mcp` | `sensor` | `device` | `human`) is a flat, open-ended string with
no grouping concept of its own — `lib/actor-kinds.ts` is now the single source of truth for what
each kind means: `ACTOR_KIND_META` (label + `ActorCategory` + Tailwind badge class),
`getActorKindMeta`/`categoryForKind` with a graceful fallback for an unrecognized kind. It replaces
four previously byte-identical `KIND_BADGE` object literals (Actors list/detail, Workspace detail,
Audit Log — all now render `<ActorKindBadge kind={...} />`, `components/ActorKindBadge.tsx`) and is
what `app/admin/actors/page.tsx`'s Humans/Agents & Devices sections,
`app/admin/certificates/new/page.tsx`'s optgroups, and the workspace-membership filters
(`app/admin/workspaces/{page,[id]/page}.tsx`) all key off instead of a duplicated `"human"` literal.
`components/map/world-map/types.ts`'s `TYPE_COLOR`/`TYPE_ONLINE_COLOR`/`MARKER_TYPES` and
`MarkerIcon.tsx` stay a parallel set of raw-hex/icon maps (canvas rendering, not Tailwind classes) —
each cross-references the other so a future kind addition doesn't drift between them.

**`device`** — a browser, computer, or server, categorized as `agent`. It registers exactly like
openclaw/mcp/sensor today (the generic WS `register` → `PendingRegistration` → admin-approval flow,
`lib/ws-server.ts`/`lib/registrations.ts` are kind-agnostic already — no protocol change was needed)
and falls into `lib/capabilities.ts`'s `AGENT_CAPABILITIES` default, same as any other non-sensor
kind.

**`Actor.ownerDid`** — a nullable self-relation recording "this actor belongs to / acts for that
actor," settable on any non-human actor (edit form on `app/admin/actors/[did]/page.tsx`, only shown
when `actor.kind !== "human"`) pointing at any other actor, human or agent. Shown both ways: the
owned actor's page links "Belongs to;" the owner's page lists "Owns." **Descriptive/administrative
only** — same caveat as the pre-existing `ActorLink` — not consulted by `packages/trust`'s
`resolvePermission`. It exists so a device can be recorded as belonging to a human (or another
agent) today, ahead of any real enforcement mechanism.

**Delegation certificates — designed, not built.** The eventual mechanism for a device (or any
actor) to actually act in the name of its owner, once a certificate is delivered accordingly: a
chained, dual-signed certificate. Certificate A is an actor's normal capability grant, exactly like
today (signed by that actor + the control plane, `packcert`/`challenger`). Certificate B delegates
capabilities to a second actor — it carries the `delegation` capability
(`packages/policy`'s `AgentCapability`), references A via `CapabilityCertificate.parentCertId` (a
self-relation) and `parentCertHash` (a hash of A's `certificate` bytes recorded at delegation time,
so a future verifier can confirm the chain even offline), names the delegator via `delegatedByDid`
(must equal `A.agentDid`), and is signed by **both** actor 1 (the delegator) and actor 2 (the
delegate) — **deliberately no control-plane signature**, unlike every cert format today.
`non_delegatable` is the one piece of this that's real and usable right now, because it needs no
new column at all: it's a plain `AgentCapability`, pickable in the certificate issuance form and the
registration-approval flow (not sensors' — see `lib/capabilities.ts`'s comment) exactly like any
other capability. If it appears anywhere in a certificate's `capabilities`, that whole certificate
can never be a delegation chain's parent — not per-capability, the whole cert.

**What's genuinely inert**: `CapabilityCertificate.delegatedByDid`/`parentCertId`/`parentCertHash`
and the `delegation` capability are schema/type additions only — no DAO method, Server Action, or UI
in this codebase ever sets them, and `delegation` is deliberately not offered in any
capability-selection UI (exposing it today would let an admin fabricate a cert that claims to be a
delegation without any of the actual guarantees a real one requires). Future verification, when
built, must check in order: (1) both actors' signatures over B, (2) `parentCertHash` matches the
live `A.certificate` bytes, (3) A is active/non-revoked/non-expired and does not carry
`non_delegatable`, (4) every capability in `B.capabilities` is present in `A.capabilities`,
(5) recurse if A is itself a delegation cert, up to a root cert co-signed by the control plane.

OIDC/Entra linking for humans (mirroring `packages/control-plane`'s `EntraIdentity`/`OidcIdentity`)
stays deferred per the existing schema-minimalism rule below — nothing added here ahead of that
feature actually being built.

## First-login profile completion

A plainly self-registered human (QR/dev-mode at `/login`, no invite involved) starts as
`Actor.name: "Unnamed"` with no email — previously fixable only by an admin, from the Actor detail
page. `app/welcome/{page.tsx,actions.ts}` is a one-time prompt closing that gap: `app/page.tsx`
redirects a signed-in human there first, before its usual admin/portal capability routing, whenever
`User.profileCompletedAt` is still null; the page lets them set their own name/email
(`completeProfileAction`, recorded as a normal `actor.updated` audit event — it genuinely is one,
just self-initiated, `performedBy` is the human themselves) or explicitly skip
(`skipProfileAction`, no profile change, just marks the prompt done so it doesn't nag every login).

`profileCompletedAt` is set at three points, not just here: immediately at creation for an
invite-onboarded human (`lib/user-login-channel.ts`'s `registerHumanFromInvitation` — already has a
real name/email from the invite, no need to ask again), and also whenever an admin edits a human's
profile from the Actor detail page (`app/admin/actors/actions.ts`'s `updateActorAction`) — otherwise
a human an admin had already renamed would still hit this prompt on their next sign-in.

## Human onboarding via invite

An admin can invite a specific human directly (`/admin/actors/invite`) instead of only waiting for
someone to self-register at `/login` — a single-use link that walks the invitee through the exact
same VaultysId pairing UI, scoped to that one invitation. Ported in spirit from
`packages/control-plane`'s `UserInvitation` feature, but restructured for this schema and fixing two
real bugs found in that implementation along the way (see below).

- **Schema** (`Invitation`, `prisma/schema.prisma`): `tokenHash` (sha256 of a
  `crypto.randomBytes(32)` raw token — the raw token is generated, returned once to the admin, and
  never persisted, the same reveal-once convention already used for a Webhook's signing secret),
  `name`/`email` (used to seed the new `Actor`/`User` on redemption), `capabilities` (granted via
  `issueAdminGrant` once redemption succeeds), `workspaceId`, `createdBy`, `expiresAt`,
  `redeemedAt`/`redeemedDid` (both null until redemption genuinely completes). `db/invitation.dao.ts`
  — `create` (generates + hashes the token), `findValidByToken` (not-found/expired/already-redeemed
  all return `null` alike — used at the point of actually registering, where the caller only needs
  a yes/no), `findByToken` (returns the row regardless of validity, for the pre-flight check below,
  which needs to explain *why*), `markRedeemed`.
- **Why not literally port the old model**: `packages/control-plane`'s `User.id` (a cuid) is
  decoupled from its nullable `User.did`, so it can pre-create an "unclaimed" placeholder row before
  any real VaultysId pairs, then `claim()` it later. This schema's `Actor.did`/`User.did` **is** the
  primary key, non-nullable — there is no placeholder slot to pre-create. `Invitation` is instead a
  fully standalone record with no `Actor`/`User` row until redemption's Challenger handshake actually
  completes (`lib/user-login-channel.ts`'s `registerHumanFromInvitation`, invoked from `registerHuman`
  when an `invitationToken` rides along in the `AuthCertificate`'s `metadata` — the same stash-in-
  metadata trick already used for the bootstrap double-SRP round, `CertRoundMeta`).
- **Two bugs in the old implementation, fixed by construction here, not ported**:
  1. Old: the invite was marked claimed at QR-**generation** time, so abandoning the page still
     burned it. Here: `markRedeemed` only runs after the Challenger handshake genuinely completes
     inside `registerHumanFromInvitation` — there is no earlier point that could mark it used.
  2. Old: neither the info route nor the redeem route re-checked "already claimed" before
     proceeding, so reopening a used link could silently mint an unrelated second account. Here:
     `GET /api/public/invite/[token]` (the redemption page's pre-flight check, run **before** any
     crypto exchange starts) and `registerHumanFromInvitation` itself (`findValidByToken`, re-checked
     at the moment of actual registration, not just at page-load) both independently reject an
     already-redeemed or expired token.
- **Admin UI**: `app/admin/actors/invite/{page.tsx,InviteHumanForm.tsx}` — Name/Email/Workspace/
  Capabilities (`portal_access` pre-checked)/expiry preset (1d/7d/30d, default 7d). `InviteHumanForm`
  is a Client Component calling `createInvitationAction` directly and awaiting its return value —
  the same one-time-reveal pattern as `NewWebhookForm.tsx`, necessary because the raw link, like a
  webhook secret, can never be shown again after this response. Entry point: "Invite human →" next
  to the Humans section heading on `/admin/actors`.
- **Redemption**: `app/invite/[token]/page.tsx` — a close cousin of `app/login/page.tsx` (this
  package has no shared login hook to extract into yet), always in register mode (no login branch —
  an invite is never for an existing Actor), hitting invite-scoped public routes that mirror the
  normal ones exactly except they skip the `hasAnyHuman()` register-vs-login decision:
  `GET /api/public/invite/[token]` (pre-flight validity), `GET /api/public/invite/[token]/p2p-connect`
  and `GET /api/public/invite/[token]/connect` (mirror `.../user/p2p-connect` and `.../user/connect`).
  `POST /api/public/user/request/[token]` and `GET /api/public/user/listen/[token]` are reused
  unchanged — that `token` is the per-session `AuthCertificate` connection hash, an unrelated
  namespace to the invite token in the URL.
- **Webhook events**: `human.invited` (creation — no Actor exists yet, so a small inline payload
  rather than reusing `actorPayload`) and `human.invitation_redeemed` (redemption —
  `actorPayload(actor) + invitedBy`), both in the "Actors" group.

## Verified

Everything below was exercised against a real (throwaway, Docker) Postgres and, where noted, a
real running dev server — not just type-checked. Ad-hoc scripts/HTTP calls, not committed as
repeatable tests (see deferred).

- **Ledger + trust engine**: bootstrap issues exactly once even under a simulated race;
  `resolvePermission` correctly authorizes/denies against the persisted ledger; a
  `capability_request` → `capability_grant` round-trip produces a real, independently-verifiable
  co-signed certificate.
- **`vaultysclaw-sensor` end to end, for real** — not a simulated client: a freshly built Go sensor
  binary (real machine, real `github.com/vaultys/vaultysid/go` identity) connects to this control
  plane's actual WS server, completes the real handshake, lands in `registration_pending`, gets
  approved with zero capabilities via `approvePendingRegistration`, reconnects, and reaches
  `auth_complete` (confirmed by the sensor's own log line, `vconn: connected`) — then sends real
  `sensor_telemetry` (Ollama and a local MCP-pattern process detected on the actual test machine)
  that lands correctly in `SensorWorkload`, keyed by the connection's authenticated DID. Found and
  fixed two real protocol bugs in `vaultysclaw-sensor/internal/vconn` in the process (the client
  expected an unsolicited "hello" this server never sends; the reference collector's own version
  of that same hello then raced with the fix) — see
  `vaultysclaw-sensor/docs/vaultysclaw-integration.md` for detail.
- **`vaultysclaw-sensor` capability-gated telemetry**: approving a sensor's registration with
  `process_read` checked correctly starts the certificate exchange (previously untested with a
  non-empty capability set); the sensor logs `sensor: skipping poll cycle — process_read capability
  not yet granted` before delivery and never reads a single process in that window, then
  `vconn: certificate delivered` immediately followed by a real `sensor: poll cycle` once the
  exchange completes — confirming the gate opens exactly when, and not before, the control plane
  actually grants it. This is also what surfaced the `vaultysid/go` metadata-verification bug above:
  the identical exchange with always-empty metadata had worked repeatedly before this.
- **managed/observed/shadow correlation** (`lib/workload-status.ts`): a direct DB-backed check
  against real Postgres — a fake `openclaw` Actor plus a workload naming its DID as
  `identityEvidence` resolves to `"managed"`; a workload with no evidence at high confidence
  resolves to `"shadow"`, low confidence to `"observed"`; a workload whose evidence names a
  nonexistent DID and one naming the sensor's *own* DID both correctly fall back to `"shadow"`
  rather than false-positiving as managed. `vaultysclaw-sensor`'s half (an operator-configured
  `agentIdentityPath` attached as evidence only on workloads matching a known agent framework) is
  covered by real Go unit tests in that repo (`internal/detector`, `internal/state`).
- **Notification Channels / Apprise**, end to end against a real `caronc/apprise` container and a
  local HTTP listener, no mocks: pushed a channel's service URL via the real `pushAppriseConfig`
  (`/add`), created the row with the service URL encrypted via the real `lib/vault.ts`, confirmed
  the decrypt round-trip matches the original plaintext, then ran the actual
  `packages/webhook-dispatcher` `processNotificationJob` code path (not a simulation of it) —
  the listener received the exact rendered `{title, body, type}` for a real event (`actor.approved`
  for the real sensor Actor already in the dev database), byte-for-byte matching `render.ts`'s
  template. Also confirmed the real image's `/del` is POST-only (a bare `DELETE` 405s), correcting
  docs/REBUILD_ARCHITECTURE.md's description of that endpoint.
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
- **Audit Log**, end to end in a real browser against a live dev server: editing a workspace's
  description through the real form produced a `workspace.updated` entry with the correct actor
  ("admin test", `human` badge), a working link to `/admin/workspaces/default`, and an expanded
  `details` blob showing the exact field-level diff (`changes: [{field: "description", from:
  "test", to: "audit-log-verification"}]`) plus `performedBy`/`adminUrl`; issuing a certificate
  through the real form produced a `certificate.issued` entry whose live-recomputed "signed" badge
  correctly showed `signed` (re-verified against the actual stored certificate bytes, not a stored
  flag). The Overview page's "Recent activity" feed correctly showed "Nothing yet." before either
  event and both entries, newest first, after.
- **Model Registry**, end to end in a real browser against a live dev server and real Postgres:
  registering a model through the actual form persisted the row with `litellmModelName`
  auto-derived (`openai/gpt-4o-research`), redirected to the detail page, and produced a
  `model.created` audit entry carrying `hasProviderKey: true` and **no trace of the key itself**;
  granting the default workspace produced a `ModelWorkspaceAccess` row and a `model.updated` entry
  whose diff was exactly `[{field: "workspaceAccess", from: [], to: ["default"]}]`, with the button
  correctly re-rendering as "Granted"; renaming the model re-derived the LiteLLM name
  (`openai/gpt-4o-research-v2`) and reported both `name` and `litellmModelName` in one diff; deleting
  it removed the row, cascaded the access row away, and recorded `model.deleted`. The docs page
  renders the new MODELS group with all three events, and a scripted pass over
  `buildWebhookEventDocs()` confirmed every documented event still has a non-empty, secret-free
  example (which is what caught the `hasApiKey` → `hasProviderKey` stripping issue above).
  Not exercised against a real LiteLLM container — the proxy was unconfigured throughout, so the
  push path was correctly a no-op and the panel reported "not configured".
- **Identity / SSO**, partly against Microsoft's real infrastructure: creating an Entra connection
  through the actual form derived the issuer from the tenant, **live-verified Microsoft's real
  discovery document** (`https://login.microsoftonline.com/common/v2.0`, all three required
  endpoints present), and persisted the client secret encrypted (SALTPACK ciphertext, verified in
  the DB — not plaintext). `GET /api/auth/providers` then listed the DB-driven provider, proving
  `buildAuthOptions()` reaches NextAuth, and a real CSRF-authenticated sign-in POST returned a
  `302` to `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=…&scope=openid
  %20email%20profile&response_type=code&redirect_uri=…` — i.e. the whole OAuth entry path is wired,
  not just configured. `/api/public/sso/providers` returns id/name/kind only (no issuer, no client
  id), and the audit entry for the change carries no secret.
  The binding half — which can't be reached without real tenant credentials — was verified directly
  against the live database instead (13 assertions, all passing): an unknown subject yields a
  `?sso=1` binding URL and an unbound `SsoIdentity`, never a session; the minted invitation is
  linked to that identity, carries the IdP's name/email, and grants `portal_access` only; a second
  unbound login issues a fresh link **and invalidates the previous one**; binding returns
  `{kind: "signin", did}` on every later login; and `bindDid` refuses to repoint an
  already-bound identity, leaving the original binding intact. Deleting the connection cascaded its
  identities away and emptied the login-page provider list.
  **Not verified**: an end-to-end login against a real tenant (no Entra app registration available
  here), so the id_token→claims→`signIn` callback hop is proven only at its two ends.
- **Caveat, not verified**: the actual PeerJS/WebRTC wire exchange with a real VaultysId wallet
  app (no physical wallet in this environment — the Challenger crypto itself is already proven via
  the WS-agent path). One incidental observation from testing against the public PeerJS relay: an
  unidentified external peer attempted a connection mid-session (logged as a FIDO2/WebAuthn parse
  error) — a reminder that a public broker means the listening peer ID is reachable by anyone who
  guesses or observes it, not just the intended wallet; worth keeping in mind if/when this moves
  toward a real deployment.

## Explicitly deferred (next slices, not started)

- **WebRTC/PeerJS transport for agents** (trust doc §4.4) — `AgentSender` is shaped for it; not
  implemented. (The login flow's own PeerJS/WebRTC usage is separate and already built. Also
  separate: `vaultysclaw-sensor` connecting is plain WS, not WebRTC — that's the one kind of remote
  agent actually wired end to end today, see Verified above.)
- Everything the remaining placeholder pages describe: the rest of Integrations (**API Keys** is the
  only tab left — Webhooks, Notification Channels, the Model Registry and Identity are now real, see
  above). Actors,
  Sensors, Map, Certificates, Workspaces (Overview/Actors/Access tabs — Budgets & Model Access
  still a stub), Settings, Audit Log, and both Integrations tabs are real. The certificate detail
  page (§1.5's signature-chain view) is built (`app/admin/certificates/[id]/page.tsx`) and its
  status-check-history section is real too — see `CertStatusCheckDAO` below.
- **A committed *production* deployment for a dispatcher against this schema isn't part of this
  repo yet** — `pnpm controlplane:webhook:dev` (see Development above) covers local dev, generating
  a client from this package's schema into `packages/webhook-dispatcher` on the fly; there's no
  compose entry or `Dockerfile.webhook-dispatcher` variant for actually deploying one yet. That's a
  deployment-time decision for whenever this package ships, not a code gap in
  `packages/webhook-dispatcher` itself — the dev script proves the same wiring works.
- **Per-workspace trust overrides** (trust doc §5.3's `Workspace.certFailMode`/
  `certStapleTtlSeconds`) aren't in the schema — org-wide is still the only level. Both org
  settings *are* now enforced end to end, see Custom Capabilities below.
- **The `proxy` kind's admin panel.** `lib/proxy-kind.ts` defines and validates the `kindConfig`
  schema, `lib/proxy-rules.ts` signs the rule set, and `lib/ws-server.ts`'s `pushActorConfig` pushes
  both — but there is no UI for authoring them yet, so a proxy's `kindConfig` has to be written
  directly to `Actor.kindConfig`. `proxyKindConfigWarnings` exists specifically for that panel to
  render.
- **Model-access enforcement.** The Model Registry records which workspaces may use which model and
  audits every change, but nothing enforces that at inference time — that needs the LiteLLM
  virtual-key path (a minted per-workspace/per-Actor key whose `models` allowlist is the actual
  gate) plus an LLM-config push down to Actors, neither of which exists here. See the Model Registry
  section above; the workspace-access UI states this limitation directly rather than implying a
  guarantee.
- **API Keys** (docs/CERTIFICATE_WEB_OF_TRUST.md §6.2) — the last placeholder Integrations tab. Not
  a port: the old package's `ApiKey` is a hashed bearer token scoped by `allowedRoutes` derived from
  its ts-rest `appContract`, and this package has neither a ts-rest contract nor **any REST API
  surface at all** (`app/api/*` is NextAuth plus the public login/invite/SSO routes; everything else
  is Server Actions + DAOs). §6.2's design — a service DID holding an `api_call`
  `CapabilityCertificate` scoped by `CertScope.resourcePattern`, authenticated per request with a
  signature over `method + path + bodyHash + timestamp + nonce` rather than a bearer secret — needs a
  REST surface to scope against before the tab means anything.
  Note for whoever builds it: do **not** carry over the old package's api-keys admin routes, whose
  `list`/`update`/`remove` handlers never call `getAuthContext` at all and are therefore
  unauthenticated.
- A Docker-gated integration test suite (mirroring the root project's `vitest.config.docker.mjs`
  pattern) covering the DB layer, the WS handshake, and the admin flows.

## Design rules carried over from the rest of the monorepo

- `packages/policy` and `packages/trust` stay pure/dependency-light — this package is the only
  place their outputs get persisted or driven by I/O (same layering as `packages/control-plane`
  today).
- Humans are Actors (`kind: "human"`), not a separate identity/permission table — see the
  schema comment on `Actor`/`User` before reintroducing a parallel `role` concept.
- **A Server Action must authorize itself.** `app/admin/layout.tsx`'s `admin_console_access` check
  is what makes the console safe to *navigate*, and it is not enough: Next.js dispatches an action
  as a POST to its own generated endpoint without re-running the layout of the route it's defined
  under, so a merely-authenticated session (a `portal_access`-only human, say) can invoke an admin
  action directly. Start every mutating admin action with `await requireAdmin()`
  (`lib/require-admin.ts`), which checks the ledger and returns the `performedBy` shape
  `recordEvent` wants, so the check and the audit attribution come from one call. The Model Registry
  actions do this; the older webhook/channel/workspace/certificate actions still only test for
  `session.user.did` and are being retrofitted.
