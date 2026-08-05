# packages/controlplane

The rebuilt VaultysClaw control plane — administration-first, the `CapabilityCertificate` ledger
at the core. See [`docs/REBUILD_ARCHITECTURE.md`](../../docs/REBUILD_ARCHITECTURE.md) and
[`docs/CERTIFICATE_WEB_OF_TRUST.md`](../../docs/CERTIFICATE_WEB_OF_TRUST.md) for the design this
implements. Lives **alongside** `packages/control-plane`, not in place of it yet — nothing points
production traffic here until the cutover is deliberate.

## Development

```bash
pnpm controlplane:dev              # docker compose up --wait, then the dev server
# or, separately:
pnpm controlplane:docker:up        # postgres + redis + apprise only (docker/docker-compose.controlplane.yml)
pnpm --filter @vaultysclaw/controlplane dev
```

`docker/docker-compose.controlplane.yml` is a **dedicated** dev stack — different default host
ports (5433/6381/8000) than `packages/control-plane`'s own `docker/docker-compose.yml`
(5432/6380/none), so both can run side by side with zero collision risk. Redis and Apprise are
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
client there first (`controlplane:webhook:prisma` — that package has no schema of its own locally;
only Docker copies one in, at build time, per its own CLAUDE.md), then starts the worker with
`REDIS_URL`/`BULLMQ_PREFIX`/`APPRISE_API_URL` pointed at this stack. Run it in its own terminal,
same as `notifier:dev`/`webhook:dev` are separate from `vaultysclaw:dev` for the old control plane
— it isn't wired into `controlplane:dev` itself.

## Status

Backend core, the WebSocket connection lifecycle, VaultysId QR login, the full admin navigation
shape (real + placeholder pages), real Actors/Sensors/Map/Certificates/Workspaces/Settings pages,
the Access Portal shell, and the design system (ported from `packages/control-plane`) are built.

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
  Certificates, Workspaces, Settings, and Integrations' Webhooks tab are real. Audit Log is still a
  real route rendering `components/layout/ComingSoon.tsx` with a description of what's planned, so
  the product reads as complete rather than missing a page outright.
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
- Everything the remaining placeholder pages describe: Audit Log (unified signed IntentLog/
  ActivityLog), the rest of Integrations (OIDC/Entra, API Keys, Model Registry — Webhooks and
  Notification Channels are now real, see above). Actors, Sensors, Map, Certificates, Workspaces
  (Overview/Actors/Access tabs — Budgets & Model Access still a stub), Settings, and both
  Integrations tabs are real. The certificate detail page (§1.5's signature-chain view) is built
  (`app/admin/certificates/[id]/page.tsx`) and its status-check-history section is real too — see
  `CertStatusCheckDAO` below.
- **A committed *production* deployment for a dispatcher against this schema isn't part of this
  repo yet** — `pnpm controlplane:webhook:dev` (see Development above) covers local dev, generating
  a client from this package's schema into `packages/webhook-dispatcher` on the fly; there's no
  compose entry or `Dockerfile.webhook-dispatcher` variant for actually deploying one yet. That's a
  deployment-time decision for whenever this package ships, not a code gap in
  `packages/webhook-dispatcher` itself — the dev script proves the same wiring works.
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
- Model Registry, OIDC/Entra — added to the schema and this package only once each is actually
  being built (Webhooks and Notification Channels already are, see above).
- A Docker-gated integration test suite (mirroring the root project's `vitest.config.docker.mjs`
  pattern) covering the DB layer, the WS handshake, and the admin flows.

## Design rules carried over from the rest of the monorepo

- `packages/policy` and `packages/trust` stay pure/dependency-light — this package is the only
  place their outputs get persisted or driven by I/O (same layering as `packages/control-plane`
  today).
- Humans are Actors (`kind: "human"`), not a separate identity/permission table — see the
  schema comment on `Actor`/`User` before reintroducing a parallel `role` concept.
