---
sidebar_position: 2
title: Control plane
description: Two surfaces gated by two capabilities — the admin console and the Access Portal.
---

# Control plane

One process runs everything: the Next.js App Router application, the API routes,
and the WebSocket server. Postgres is the store; Redis and Apprise are optional
and turn features off when absent rather than breaking the app.

There are **two route trees, gated by two different capabilities** — not by an
`/app` versus `/admin` convention baked into routing. Which surface you can reach
is a ledger lookup, exactly like every other authorisation decision.

## Admin console — `admin_console_access`

| Page | What it does |
|---|---|
| **Overview** | Posture summary — Actors by kind, certificates expiring soon, recent revocations, and a live feed of the twenty most recent audit entries |
| **Actors** | Unified list of every Actor, filterable by kind, with inline approve/deny for pending registrations and a full detail page per Actor |
| **Sensors** | Fleet view — sensor count, online now, observed and shadow workload counts — plus a per-device workload table |
| **Map** | Actors placed geographically, clustered, with live online state read from the actual connection map rather than a stored field |
| **Certificates** | The ledger: issue, inspect, revoke. Detail view shows decoded payloads, which key verified which signature, independent re-verification, and status-check history |
| **Workspaces** | List and tabbed detail — Overview, Actors, Access |
| **Audit Log** | Filterable append-only trail with live certificate re-verification |
| **Integrations** | Webhooks, Notification Channels, Model Registry, Identity (OIDC/Entra) |
| **Settings** | Server identity, trust policy, organisation name |

An unauthenticated visitor is redirected to login. An authenticated visitor
without the capability sees **"Access denied"** — not a redirect loop, which is
what a role-based system tends to produce when it cannot distinguish "not signed
in" from "signed in, insufficient".

:::danger Layout gates protect navigation, not invocation
Next.js dispatches a Server Action as a POST to its own generated endpoint
**without re-running the layout** of the route it is defined under. The console's
capability gate therefore makes the console safe to browse; it does not by itself
make every action safe to invoke.

Every mutating admin action must begin with `requireAdmin()`, which checks the
ledger and returns the attribution the audit call needs — so the check and the
attribution come from one call and cannot drift apart. This retrofit is in
progress: the Model Registry actions do it, some older actions do not yet. See the
[roadmap](/docs/zero-trust/roadmap#2-server-action-authorisation-retrofit--domain-6).
:::

## Access Portal — `portal_access` {#access-portal}

A deliberately small, read-mostly surface for **any** human Actor, admin or not.

| Page | What it shows |
|---|---|
| **My certificates** | Every certificate where the signed-in DID is the subject: capability, scope, expiry, issuer |
| **My agents** | The subset of those certificates granting a connect right, each with a launch action into that Actor kind's own connect mechanism |

No workspace administration. No Actor management. No audit log. This surface only
ever answers *"what am I allowed to do, and let me do it"* — nothing about anyone
else.

:::note This is not the old chat product returning
The removed channel system was an open collaboration surface for anyone. The
portal is a certificate viewer plus a launch point. What "connecting" means is
owned by the target Actor's kind, not by the portal — the portal does not
implement chat, threads, mentions, or presence, and will not.
:::

## Authentication

### Passwordless VaultysId

The primary path, unchanged by the rebuild and not up for redesign. A human scans
a QR code with the VaultysId wallet app; the server runs the `Challenger`
handshake over a PeerJS/WebRTC channel. An unknown DID becomes a `kind: "human"`
Actor; a known DID signs in.

**The session carries no role field.** Access is decided by certificates, full
stop.

### SSO — OIDC and Microsoft Entra ID

SSO is an identity-*establishment* path, never a parallel trust tier.

Entra is **not a second protocol**. It is an OIDC provider whose issuer is a
function of the tenant, so there is one connector and one code path. The
connection kind exists only so the form asks for a tenant ID instead of a raw
issuer URL — an admin cannot paste a subtly wrong Microsoft URL.

Multiple providers can coexist: providers are built **per request from the
database**, so adding or disabling a connection takes effect on the next login
rather than the next deploy. A connection whose secret cannot be decrypted is
dropped with a log line rather than thrown, so one broken connection cannot take
down the login page — including the VaultysId path, which does not depend on it.

:::tip An unbound SSO login never produces a session
An identity provider can tell you who someone is before they hold a VaultysId, and
this schema has nowhere to put such a person — every authorisation decision is a
ledger lookup keyed by DID.

The previous design's answer was a nullable DID and a "claim your account later"
state: a signed-in user who is not yet anybody in the trust model. That is exactly
the parallel tier this design rules out.

So an unbound SSO login redirects to a **binding invitation** instead: a
system-issued, one-hour invitation carrying the provider's own name and email,
redeemed through the ordinary invite flow. That handshake mints the Actor, and the
external identity is then bound to the new DID. Every later login is an ordinary
DID session with no SSO-specific path at all.
:::

Security properties of the binding worth not regressing:

- Binding is a **conditional update on an unbound row**, so a completed binding is
  never silently repointed at a different DID — losing that race leaves the
  original binding intact.
- Each new unbound login **invalidates the previous pending binding link**, so
  exactly one live link exists per identity.
- The recorded issuer is the connection's **configured** value, never the token's
  own claim, so a token from elsewhere cannot launder its origin.
- A freshly bound human holds `portal_access` **only**, and this is deliberately
  not configurable per connection. Which provider you came from is not a good
  reason to hold more capability, and making it a knob would quietly turn SSO
  configuration into permission configuration.

:::caution Consequence to be explicit about
Anyone your identity provider will authenticate can obtain an Actor — with no
capabilities. That is the same trust boundary as the provider itself, which is the
point of federating. But point a connection at a directory whose membership you
control, not a public multi-tenant issuer.
:::

Not built: Entra **directory sync** (pre-provisioning users and groups through
Microsoft Graph). Login works without it.

### Development mode

For local work without a physical wallet, the login page offers a dev-mode
connect that runs the identical `Challenger` exchange over plain HTTP POSTs
instead of WebRTC. It supports four real identity types — software, software with
post-quantum `dilithium_ed25519`, passkey, and hardware FIDO2 — the last two
making genuine WebAuthn calls, not stubs.

The browser can hold several identities side by side and pick between them, so
testing as several different humans does not require destroying the previous
identity.

:::note Dev mode is not a backdoor
It registers or signs in as a genuinely new or previously dev-registered
identity — exactly like a real wallet, it cannot sign in as an unrelated existing
Actor whose key it does not have. Against a database that already has people in
it, a new browser identity completes the handshake correctly and is then correctly
rejected at login. The link is gated on a non-production build.
:::

## Ports and processes

| Piece | Default | Required? |
|---|---|---|
| HTTP + WebSocket (one process) | 3001 / 8081 | Yes |
| Postgres | 5433 | Yes |
| Redis | 6381 | Optional — unset disables webhooks and notification channels |
| Apprise | 8000 | Optional — unset disables notification channels only |
| Webhook dispatcher | separate process | Required for any event to actually be delivered |

Ports differ from the older control plane's (3000/8080/5432/6380) so both can run
side by side with no collision.

See [Deployment](/docs/guides/deployment).
