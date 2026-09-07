# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

VaultysClaw is an **agent identity and trust** platform. A **control plane** (Next.js + WebSocket
server) maintains an append-only ledger of signed **capability certificates** bound to
[VaultysId](https://github.com/vaultys/id) DIDs, and decides what every Actor — agent, device,
sensor, or human — is allowed to do. Clients connect over WebSocket, prove their identity with a
Challenger handshake, and receive certificates they can verify offline.

**Monorepo**: pnpm workspaces + Turborepo.

| Package | Description | CLAUDE.md |
|---|---|---|
| `packages/policy` | Certificate wire format (sign/verify/pack), `AgentCapability`, `CertScope`, resource limits, runtime enforcement gates. Pure, no I/O. | [→](packages/policy/CLAUDE.md) |
| `packages/trust` | Trust ledger engine: ABAC/multi-certificate permission resolution (`resolvePermission`) over the `CapabilityCertificate` ledger. Pure, no I/O. | [→](packages/trust/CLAUDE.md) |
| `packages/shared` | The webhook event catalog + the LLM provider union. Deliberately tiny. | [→](packages/shared/CLAUDE.md) |
| `packages/controlplane` | The control plane: Next.js App Router admin console + WebSocket server, Prisma/Postgres, the certificate ledger. | [→](packages/controlplane/CLAUDE.md) |
| `packages/sdk` | TypeScript client for the control plane's protocol — handshake, capability state, certificate-status refresh, `resolvePermission`. The counterpart of `sdk-go/`. | [→](packages/sdk/CLAUDE.md) |
| `packages/webhook-dispatcher` | Standalone worker: consumes events from BullMQ, signs them (HMAC) and POSTs to endpoints; also fans out to Apprise notification channels. | [→](packages/webhook-dispatcher/CLAUDE.md) |
| `packages/simulator` | Fleet simulator: thousands of real-VaultysId Actors driven at a live control plane, on its own isolated stack. | [→](packages/simulator/CLAUDE.md) |

Outside the pnpm workspace:

| Directory | Description |
|---|---|
| `sdk-go/` | Go client SDK — `authz` (a port of `resolvePermission`), `grant` (offline packcert verification), `rules` (signed rule sets). |
| `vaultysclaw-sensor/` | Go workload sensor: detects local AI/agent processes and reports classified telemetry to the control plane. Also hosts the tier-1 interception proxy. What it recognises as AI is data, not code: the built-in rules are `internal/config/default-catalog.yaml` (embedded), extended by a hot-reloadable operator catalog. Add a newly-released harness to a catalog file, never to the detector — see `vaultysclaw-sensor/docs/DETECTION_CATALOG.md`. |
| `conformance/` | The TS↔Go contract. `permission-vectors.json` (37 cases) is run by **both** `packages/trust` and `sdk-go/authz`; `capability-names.json` (31 cases) by **both** `packages/policy` and `sdk-go/capability`; `grant-fixture.json`, `rules-fixture.json` and `kindconfig-fixture.json` are TypeScript-signed fixtures the Go side verifies. Never change a fixture without re-running both suites. |
| `docs-site/` | Docusaurus documentation site. |

## Commands

```bash
# Development
pnpm install
pnpm controlplane:dev          # docker up --wait + control plane dev server
pnpm controlplane:docker:up    # just its docker stack (postgres 5433 / redis 6381 / apprise 8000)
pnpm controlplane:docker:down
pnpm controlplane:webhook:dev  # webhook dispatcher against the controlplane schema (own terminal)
pnpm sensor:start              # the Go sensor against a local collector

# Fleet simulator — its own isolated stack (postgres 5434 / control plane 3003, ws 8083), never
# your dev database. docker/simulator.env is the single source of truth for its coordinates.
pnpm simulator:up              # database + migrations + build + control plane
pnpm simulator:demo            # 2,000 estate + 5,000 agent Actors against it
pnpm simulator stats           # what that control plane currently holds
pnpm simulator:down            # stop, keeping the data ( :nuke also deletes the volume )

# Build / quality
pnpm build                     # all packages via Turborepo
pnpm lint
pnpm type-check
pnpm format

# Testing — every suite is per-package; there is no root __tests__ directory
pnpm test                                            # turbo run test, all packages
pnpm --filter @vaultysclaw/policy test
pnpm --filter @vaultysclaw/trust test                # includes the conformance vectors
pnpm --filter @vaultysclaw/controlplane test
pnpm --filter @vaultysclaw/webhook-dispatcher test
cd sdk-go && go test ./...                           # the Go half of conformance
cd vaultysclaw-sensor && go test ./...
```

The dispatcher must point at the **same Postgres the control plane writes to**, not just one with
the same schema — otherwise jobs are consumed and every event reports zero targets while the
console shows an active subscription. `controlplane:webhook:dev` sources
`packages/controlplane/.env` for exactly this reason; don't write that URL down a second time.

`packages/webhook-dispatcher` has **no Prisma schema of its own** — run
`pnpm controlplane:webhook:prisma` (or the `controlplane:webhook:dev` script, which does it for
you) to copy the control plane's schema in and generate a client, or its type-check and tests fail
on a missing `PrismaClient` export.

## Communication Protocol

Clients connect to the control plane via WebSocket. Messages follow the typed envelope in
`packages/controlplane/lib/protocol.ts` — deliberately small: identity, registration, the
certificate/status protocol, `actor_config`, and `sensor_telemetry`.

**Actor lifecycle**:

1. Client connects → `register` → VaultysId Challenger handshake (`auth_challenge`)
2. Unknown DID → `PendingRegistration` row + `registration_pending`; known DID → `auth_complete`
3. Admin approves, choosing capabilities → the control plane starts a second, independent
   `service: "certificate"` Challenger exchange (`cert_challenge`) → `cert_issued`
4. A client re-checks its grant with `cert_status_request` → a control-plane-signed
   `cert_status_response` it can verify, cache, or staple
5. Kind-specific config (and signed policy artefacts) arrive as `actor_config`

Certificates are signed artefacts, not session state: `packages/policy` verifies them with no
network and no database. See `docs/CERTIFICATE_WEB_OF_TRUST.md`.

## Capabilities

A capability is either a **built-in** (a closed list in `packages/policy/src/types.ts`) or an
admin-defined **custom** `vendor:action` name from the control plane's registry
(`docs/CUSTOM_CAPABILITIES.md`). Both travel through identical machinery — the same certificates,
`CertScope` scoping, expiry, revocation and `resolvePermission`.

Three things to know before touching this area:

- **`AgentCapability` is no longer a closed union**, so exhaustiveness checking does not apply. A
  `switch` or `Record<AgentCapability, …>` over it silently stops being checked instead of failing
  to compile — always give such a map an explicit fallback.
- **Never validate a capability name by hand.** `assertValidCapabilityName` / `isCustomCapability`
  in `packages/policy` are the only grammar, mirrored in `sdk-go/capability` and pinned by
  `conformance/capability-names.json`. Changing the grammar means changing both and the table.
- **Deleting a registry entry is a mass revoke.** `handleCertStatusRequest` filters held custom
  capabilities against the live registry before signing a `cert_status_response`, so a deleted name
  stops resolving on every holder's next refresh. That signed response — not the stored certificate
  row — is what a client keeps.

## Webhooks & Notification Channels

One event pipeline, two kinds of delivery. A domain event is recorded in the audit log and enqueued
on a BullMQ queue; a standalone worker delivers it as a signed HTTP POST **and** as a rendered
human-facing alert through Apprise.

```
domain event → recordEvent()          → AuditLogEntry row (awaited)
 (controlplane/lib/audit.ts)          → enqueueWebhook() → BullMQ "webhooks" (Redis)
                                          → webhook-dispatcher:
                                             load active Webhook subscriptions → filter by event
                                             → sign (HMAC-SHA256) + POST
                                             load active NotificationChannels → render
                                             → POST to the Apprise API
```

- **Event catalog is the single source of truth**: `packages/shared/src/webhooks.ts`
  (`WEBHOOK_EVENTS`, `WebhookEventDef`, `WebhookJob`, `WEBHOOK_QUEUE_NAME`, `getWebhookEvent`).
- **Emit** via `recordEvent({ eventType, payload, performedBy, targetType, targetId })`
  (`packages/controlplane/lib/audit.ts`) — never `enqueueWebhook` directly from a domain site. One
  call drives both the audit trail and delivery.
- **Sanitized payloads**: build with an explicit per-entity helper in
  `packages/controlplane/lib/webhook-payloads.ts` — allow-lists only, never a secret.
  `enqueueWebhook` additionally runs `stripSensitive` as defence in depth.
- **BullMQ prefix**: the control plane's producer uses `prefix: "vaultysclaw-controlplane"`; a
  dispatcher instance serving it must set `BULLMQ_PREFIX` to the same value.
- Requires **Redis**. Producers are fire-and-forget and no-op when `REDIS_URL` is unset.

### Adding or changing a webhook event — ALWAYS update the docs

The `/admin/integrations/webhooks/docs` reference is generated from data you must keep current.
Whenever you **add, remove, or change the payload of** an event, do all of this in the same change:

1. **Catalog** — add/edit the entry in `packages/shared/src/webhooks.ts` (`type`, `label`,
   `description`, `group`). This drives both the config UI and the docs.
2. **Emit** — add/adjust the `recordEvent` call at the domain site.
3. **Payload builder** — update the matching helper in
   `packages/controlplane/lib/webhook-payloads.ts` (explicit allow-list — never add a secret field).
4. **Notification template** — add a renderer to `RENDERERS` in
   `packages/webhook-dispatcher/src/render.ts`, or the event silently never reaches a channel.
5. **Docs example** — update `EXAMPLE_PAYLOADS` in
   `packages/controlplane/lib/webhook-docs.ts`. A new event with no entry falls back to `{}` in the
   docs — that is a bug, not acceptable.
6. **Verify** — confirm every event has a non-empty, secret-free example, and `pnpm type-check` is
   clean.

Note `stripSensitive` matches the substring `apikey` case-insensitively, so a boolean field named
`hasApiKey` is silently deleted from delivered payloads. Name such flags `hasProviderKey`.

## Environment Variables

| Variable | Package | Purpose |
|---|---|---|
| `DATABASE_URL` | controlplane, webhook-dispatcher | PostgreSQL connection string (Prisma) |
| `REDIS_URL` | controlplane, webhook-dispatcher | Redis URL for the BullMQ webhook queue |
| `BULLMQ_PREFIX` | webhook-dispatcher | Must match the producer's prefix (`vaultysclaw-controlplane`) |
| `WEBHOOK_TIMEOUT_MS` | webhook-dispatcher | Per-endpoint delivery timeout (default 10000) |
| `APPRISE_API_URL` | controlplane, webhook-dispatcher | Self-hosted Apprise API base URL. Unset turns Notification Channels off entirely; webhook delivery is unaffected. |
| `NEXTAUTH_URL` / `APP_URL` | controlplane | Browser-facing base URL; used to build `adminUrl` deep links (`APP_URL` wins) |
| `NEXTAUTH_SECRET` | controlplane | NextAuth session secret |
| `PORT` / `WS_PORT` | controlplane | HTTP + WebSocket ports |
| `LITELLM_BASE_URL` / `LITELLM_MASTER_KEY` | controlplane | Deployment-time **fallback** for the Model Registry. The `Setting` rows an admin edits under Integrations → Models win, and the master key is stored encrypted there (`lib/vault.ts`). |

## Design rules

- **`packages/policy` and `packages/trust` stay pure.** No Prisma, Next.js, or WebSocket coupling;
  signing takes a `VaultysId`, enforcement takes an injected clock. `packages/controlplane` is the
  only place their outputs get persisted or driven by I/O.
- **Humans are Actors** (`kind: "human"`), not a separate identity or permission table. There is no
  `role` field anywhere — access is a ledger lookup (`lib/access-control.ts`'s `hasCapability`).
- **A Server Action must authorize itself.** Next.js dispatches an action as a POST to its own
  endpoint without re-running the layout it is defined under, so the `admin_console_access` gate in
  `app/admin/layout.tsx` does not protect it. Start every mutating admin action with
  `await requireAdmin()` (`lib/require-admin.ts`).
- **Never change a `conformance/` fixture on one side only** — the TS and Go suites both consume
  them, and that is the entire point.
