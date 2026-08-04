# VaultysClaw Rebuild — Target Architecture

**Status:** Draft. No production users exist today (PoC only) — this is a ground-up rebuild of the
control-plane product surface, not a backward-compatible migration. It keeps what's already
correct (the VaultysId crypto layer, the cert primitives in `packages/policy`) and rebuilds
everything else around a much narrower admin-only scope.

**Depends on:** [`CERTIFICATE_WEB_OF_TRUST.md`](CERTIFICATE_WEB_OF_TRUST.md) — that doc is the
trust/cert-ledger spec (`CapabilityCertificate`, `packages/trust`, the status-check protocol). This
doc is everything around it: what product surface exists, how agent kinds plug in, and how
notifications/webhooks are unified. Read that doc first; this one assumes it.

**Supersedes:** `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `ZERO_TRUST_COMPLIANCE.md` where they
describe product surface (workflows, channels, notifications) that this doc removes. Their
description of the VaultysId identity/crypto model remains accurate and is not repeated here.

## 1. Mandate

- **Administration-first, with a minimal certificate-scoped exception.** No general end-user
  collaboration interface — but any human holding a VaultysId can still see and use the specific
  access they've been granted (§4.5's Access Portal). The distinction isn't "admins vs. end
  users," it's "an open collaboration surface for anyone" (cut) vs. "exactly what your own
  certificates say you can see or connect to" (kept, minimal).
- **Agent-agnostic core, kind-specific extensions.** One shared interface (identity, certificates,
  audit, onboarding) for every kind of remote agent; implementation-specific configuration lives in
  a kind extension, not the core.
- **Do less, better.** Workflow orchestration and human-facing chat are cut, not rebuilt smaller —
  they're better served by dedicated external tools (n8n) than by VaultysClaw re-implementing them.
- **Connecting to the interface stays on the current VaultysId architecture — this is not up for
  redesign.** Every reduction in product surface (§2) is about *what* the interface does once
  you're connected, never *how* you connect to it. Concretely, unchanged:
  - **Human operators**: the existing passwordless VaultysId QR-code login (`next-auth` custom
    provider, `lib/auth-config.ts`) stays exactly as-is. No username/password fallback gets
    introduced just because the audience is now "operators only" — the whole point of this
    rebuild is fewer surfaces with *more* trust rigor, not less. OIDC/Entra remain
    identity-*establishment* paths that still bind to a VaultysId DID (trust doc §6.3), not a
    parallel login mechanism.
  - **Agents/Actors of any kind**: the register → auth-challenge → certificate handshake in
    `packages/agent-runtime` (WS and WebRTC alike, trust doc §4.4) is untouched by this rebuild.
    §4's `Actor`/kind model changes what happens *after* a successful handshake (which
    certificate, which admin panel) — never the handshake itself.

## 2. Cut

| Feature | Current location | Why |
|---|---|---|
| Workflow engine (executor, scheduler, approvals) | `Workflow`/`WorkflowRun`/`WorkflowStep`/`WorkflowApproval`, `lib/workflow-executor.ts` | Deferred to n8n or similar. VaultysClaw's job is agent identity/trust, not orchestration. |
| End-user settings area | `app/app/settings/*` | No general end-user product surface. Does **not** remove per-human certificate visibility or agent-connect grants — that's kept as the minimal Access Portal, §4.5. |
| Channel collaboration (chat, threads, @mentions) | `Channel`/`ChannelMember`/`ChannelMessage`, `channel-types.ts` `ChannelEvent` union | This exists purely so humans can converse with agents conversationally — cut with the end-user interface. |
| Teams / generic channel bridges | `ChannelBridge`, `lib/bridges/teams-gateway.ts`, `lib/channel-bridge-service.ts` | Only exists to sync the channel system externally; goes with it. Also removes the two concrete security holes found in the earlier review (stub JWT verification, plaintext bridge secrets) by deleting the code rather than patching it. |
| In-app/email/push notification stack | `packages/notifier`, `Notification`/`NotificationPreference` | No end users to show a bell to. Replaced by §5. |

Nothing here needs a deprecation period or compatibility shim — no production traffic depends on
any of it, so it's deleted, not sunset.

## 3. Kept, mostly unchanged

- **Workspaces** — still the tenancy boundary for agents, budgets, and (now) certificates.
- **OIDC / Entra ID** identity linking — still the enterprise SSO path for admin operators, per the
  identity-binding design in `CERTIFICATE_WEB_OF_TRUST.md` §6.3.
- **VaultysId crypto layer** — `packages/policy/src/certs`, `@vaultys/id` challenge/response,
  passwordless QR login. This was never the problem; nothing here changes.
- **Model registry / LiteLLM routing / workspace budgets** — `ModelRegistry`,
  `ModelWorkspaceAccess`, `WorkspaceRouterKey` — needed by any LLM-backed agent kind (§4).
- **Credentials vault** (`vault.ts`, `Credential` model) — general encrypted-secret storage,
  extended to cover the Apprise service URLs in §5 instead of the inconsistent plaintext path the
  channel bridges used to take.
- **Webhooks** (`packages/webhook-dispatcher`, signed HMAC delivery) — kept as core, per your
  explicit call. Extended in §5 to also carry what used to be notifications.

## 4. The Actor / agent-kind model

### 4.1 Problem being fixed

Today, `Agent` and `SensorDevice` are two separate Prisma models with separate admin pages and
separate (but structurally identical) registration flows — a sensor was bolted on as a parallel
system rather than another kind of the same thing. That pattern doesn't scale to "agent
implementation would vary" (MCP servers, LLM-driven agents, future kinds) without a new
near-duplicate model per kind.

### 4.2 Design

One entity, `Actor`, replaces `Agent` + `SensorDevice`:

```prisma
model Actor {
  did          String   @id
  name         String
  kind         String   // "openclaw" | "mcp" | "sensor" | future kinds
  workspaceId  String?
  kindConfig   Json     @default("{}")   // kind-specific config, schema owned by the kind (§4.3)
  registeredAt DateTime @default(now())
  lastSeen     DateTime @default(now())

  workspace         Workspace?               @relation(fields: [workspaceId], references: [id], onDelete: SetNull)
  certificates      CapabilityCertificate[]  // the trust-doc ledger, unfiltered by kind
  // token usage, peer grants, etc. all key off `did` same as today's Agent relations
}
```

Every kind shares, unconditionally:
- **Onboarding** — one `PendingRegistration` flow (already has a `kind` discriminator today —
  generalize it from `"agent" | "sensor"` to any registered kind), one approval UI.
- **Certificates** — the `CapabilityCertificate` ledger from the trust doc. A sensor's cert
  typically carries no capabilities (telemetry-only, as today); an `openclaw` agent's cert carries
  whatever it requested and was granted, standing or scoped (trust doc §3.6).
- **Audit trail** — every Actor's actions land in the same unified log regardless of kind.
- **Status/trust checks** — the same `cert_status` protocol (trust doc §4) regardless of transport
  or kind.

### 4.3 Kind extensions

Each kind owns its own `kindConfig` JSON schema and its own admin panel component, registered in a
small in-code registry (not a database table — kinds are a deploy-time concept, not
runtime-configurable data):

| Kind | `kindConfig` shape | Admin panel adds |
|---|---|---|
| `openclaw` (the current `agent-controller`) | LLM provider/model, knowledge sources (RAG — confirmed as an extension, not core), skill overrides | Chat-with-agent (admin panel *and* the Access Portal for anyone holding a connect-grant, §4.5), token consumption dashboards, knowledge source management |
| `mcp` | MCP server URL, tool allowlist, transport (stdio/SSE) | Standard MCP config fields, exposed tool list |
| `sensor` | none (telemetry-only, as today) | Workload/process observation view (`/admin/sensors` UI, unchanged) |

Adding a new kind later means adding one config schema + one panel component — not a new Prisma
model, not a parallel registration flow.

### 4.4 What moves into the trust ledger instead of staying separate

`UserGrant`, `DelegationCert`, and `AgentPeerGrant` are three parallel models doing variations of
"grant a subset of capabilities to someone, signed, with expiry." Under the unified
`CapabilityCertificate` ledger (trust doc §3), all three collapse into one thing: a human operator
delegating scoped access to another operator, or one agent granting a peer access, is just another
`CapabilityCertificate` row — the `agentDid` field is any Actor's DID, human or not, and
`CertScope` (trust doc §3.6) expresses the narrowing. One ledger, one status-check protocol, one
audit trail — instead of four models each needing their own revocation/expiry logic.

### 4.5 Human Actors and the Access Portal

Humans are Actors too (trust doc §2, `kind: "human"`), each with their own VaultysId DID — not
only "operators who use the admin console." Two things follow, correcting an over-simplification in
§1/§2 above.

**A minimal end-user surface survives the cut — but it is not the removed channel system.** Any
human with a VaultysId can log in (the same passwordless QR flow, §1) to a narrow, read-mostly
**Access Portal**, distinct from the admin console, showing exactly the `CapabilityCertificate`
rows where *they* are the subject: what they're currently granted, by whom, expiring when, and —
for certs that grant a "connect" right to a specific agent — a way to open that connection. What
"connecting" actually looks like is owned by the target agent's kind (e.g. an `openclaw` agent's
chat mechanism, gated by presenting that specific cert), not by the portal itself — so this is a
certificate viewer plus a launch point, not a revival of the multi-user collaboration/channel
system that was cut. It replaces the "Chat-with-agent (ops/testing use)" line in §4.3's table below
with something broader: any human holding a valid connect-grant can chat with an `openclaw` agent
through it, not only admins testing it.

**Access to any interface is itself just a capability, not a parallel RBAC layer.** The control
plane has its own VaultysId — the `serverSecret`-derived identity that already signs every cert and
policy today — and is the root issuer for the whole ledger. Whether a given human can open the
admin console, the Access Portal, both, or neither, is decided by whether they hold a current,
non-revoked certificate granting the relevant capability (`admin_console_access`, `portal_access`,
or similar), issued and revocable through the exact same mechanism as an agent's `file_access`
grant — checked, audited, and expired identically. This reframes the operator-roles question from
§9: **Owner/Admin/Member doesn't need a separate enum at all — it can be capabilities in the same
`CapabilityCertificate` ledger**, one fewer parallel system to maintain and one more thing that's
auditable through the single ledger rather than a role table off to the side. This is a bigger
conceptual shift than the rest of this doc, so it's a recommendation here, not a decision — see §9.

**Bootstrap: the first user.** Gating admin-console access behind a certificate creates an obvious
chicken-and-egg problem — normal issuance requires an existing admin to approve the `capability_
request` (trust doc §3.2), and on a fresh deployment there isn't one yet. The exception: on the
*first* successful human VaultysId login/registration where no Actor of kind `human` anywhere
in the ledger currently holds an active `admin_console_access` cert, the control plane auto-issues
one to that DID — no approval step, `createdBy: "system:bootstrap"`, `expiresAt: null` (the
canonical use of the nullable-expiry exception in trust doc §3.3: a standing grant with no renewal
cadence, valid until someone explicitly revokes it).

That exception is guarded by the same existence check every time, so it fires at most once per
deployment — the moment any `admin_console_access` cert exists (bootstrap or otherwise), every
later registration falls through to the normal approval flow. The existence check plus the insert
must happen atomically (a transaction or a DB-level uniqueness guard on "one bootstrap grant per
deployment") so two humans registering within the same race window can't both walk through the
gap. The grant is deliberately loud, not silent: it lands in the Certificates ledger UI flagged as
a standing, no-expiry, system-issued grant, so the first real admin sees it immediately and can
consciously reissue it with an expiry later if they want a stricter posture than "never expires
until revoked."

## 5. Notifications → Webhooks + Apprise-backed Notification Channels

### 5.1 Model

Two distinct concerns, one event pipeline:

- **Webhooks** (unchanged) — raw, signed JSON delivered to a URL the operator fully controls (their
  own SIEM, a custom endpoint). VaultysClaw doesn't know or care what's on the other end.
- **Notification Channels** (new) — human-facing alerts, fanned out through a self-hosted
  [Apprise API](https://github.com/caronc/apprise-api) container. VaultysClaw renders a
  title/body and asks Apprise to deliver it; Apprise owns the actual email/Slack/Teams/PagerDuty/
  ntfy/etc. integration.

Both are driven by the same event catalog and the same BullMQ `webhooks` queue — one worker
(`packages/webhook-dispatcher`) fans out to both kinds of subscription per event, it's not two
pipelines.

### 5.2 Schema

```prisma
model NotificationChannel {
  id          String   @id @default(cuid())
  name        String
  description String?
  appriseKey  String   @unique   // the Apprise config key/tag this channel is pushed under
  serviceUrls String              // encrypted via vault.ts — one or more apprise:// URLs (mailto://, slack://, pagerduty://, ...)
  events      String[]            // subscribed event types, from the same catalog webhooks use
  isActive    Boolean  @default(true)
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now())
}
```

### 5.3 Admin flow

The administrator never touches Apprise's own config file — everything happens in VaultysClaw's
admin UI, under the same **Integrations** area the Webhooks tab already lives in, as a sibling
**Notification Channels** tab:

1. Admin creates a channel: name ("Ops Slack"), pastes one or more Apprise service URLs
   (`slack://token/channel`, `mailto://user:pass@smtp.example.com`), picks which event types
   trigger it (cert revoked, agent registration pending, cert expiring soon, agent gone offline).
2. Control plane encrypts `serviceUrls` with the existing vault (`vault.ts` — the same primitive
   already used for OIDC secrets and `Credential` rows, so no new secret-handling code path is
   introduced), stores the row, and calls Apprise's management API
   (`POST {APPRISE_API_URL}/add/<appriseKey>`) to push the URLs into Apprise's own store.
3. On a matching event, `webhook-dispatcher` renders `{title, body, type}` (reusing the exact
   template functions that used to live in `packages/notifier/src/render.ts` — moved, not
   rewritten) and calls `POST {APPRISE_API_URL}/notify/<appriseKey>`.
4. Deleting/disabling a channel calls `DELETE {APPRISE_API_URL}/del/<appriseKey>` and removes the
   row.

Apprise itself holds no VaultysClaw-specific logic and needs no auth of its own — it sits on an
internal network, reachable only from `webhook-dispatcher` and the control plane's admin API, never
exposed externally. That's what keeps it a genuinely swappable container: replacing it with ntfy or
a self-built relay later only touches this one integration point.

### 5.4 Deployment

```yaml
# docker-compose.yml addition
apprise:
  image: caronc/apprise:latest
  volumes:
    - ./apprise-config:/config
  restart: unless-stopped
  networks:
    - internal   # no public port mapping
```

New env var: `APPRISE_API_URL` (control-plane + webhook-dispatcher).

## 6. Target package structure

| Package | Change |
|---|---|
| `packages/policy` | Unchanged — cert wire format + single-cert enforcement gates. |
| `packages/trust` | **New** — ABAC/multi-cert decision engine (trust doc §9). |
| `packages/shared` | Trimmed — drop `ChannelEvent`/`ChannelBridge`/workflow-related types; fix the existing `shared` → `policy` layering inversion while touching this file anyway. |
| `packages/control-plane` | Rebuilt admin surface (§7) on the existing Next.js/WS foundation — `ws-server.ts` gets split per the original review (auth/connection lifecycle vs. per-kind handlers) as part of this rebuild, not as a separate later effort. |
| `packages/agent-runtime` | Unchanged in responsibility — already the transport/auth-agnostic layer this whole model leans on. Gains the `cert_status` message types (trust doc §4.4) and the WebRTC P2P hardening in `peer-manager.ts`. |
| `packages/agent-controller` | Becomes the reference implementation of the `openclaw` kind. Strips any workflow/channel-specific tool code. |
| `packages/mcp-gateway` | Becomes (or gains) the reference implementation of the `mcp` kind's registration path. |
| `vaultysclaw-sensor` (Go) | Moves into the pnpm workspace layout (organizational fix from the original review) as the `sensor` kind's implementation. |
| `packages/notifier` | **Deleted.** |
| `packages/webhook-dispatcher` | Extended per §5 — same package, two subscription types. |

## 7. Admin UI shape

Two separate apps/route trees, gated by different capabilities (§4.5) rather than a `/app/*` vs
`/admin/*` convention baked into the routing:

**Admin console** (`admin_console_access`):
- **Overview** — posture summary: actors by kind, certs expiring soon, recent revocations.
- **Actors** — unified list (today's `Agents` + `Sensors` pages merged), filterable by `kind`,
  onboarding/approval flow, kind-specific panel per §4.3.
- **Certificates** — the `CapabilityCertificate` ledger: issue, view, revoke, inspect scope/TTL,
  see status-check history.
- **Audit Log** — unified `IntentLog`/`ActivityLog` (merged, workspace-scoped, append-only per the
  original review's recommendation).
- **Workspaces** — unchanged in spirit, scoped to certs/budgets/model access instead of also
  workflows/channels.
- **Integrations** — OIDC/Entra, API Keys, Webhooks, **Notification Channels** (§5), Model
  Registry/LLM providers.
- **Settings** — server identity, trust policy (fail-open/closed + staple TTL, trust doc §5),
  general config.

**Access Portal** (`portal_access`, §4.5) — a separate, much smaller surface for any human
Actor, admin or not:
- **My certificates** — every `CapabilityCertificate` row where the logged-in DID is the subject:
  capability, scope, expiry, issuer.
- **My agents** — the subset of those certs that grant a connect right, each with a launch action
  into that agent kind's own connect mechanism (e.g. `openclaw` chat).

No workspace administration, no actor management, no audit log — this surface only ever
answers "what am I allowed to do, and let me do it," nothing about anyone else.

## 8. Rebuild sequencing

Not a backward-compatible migration — but still sequenced, so the codebase is buildable and
demoable at every step rather than broken for months:

| Step | Scope |
|---|---|
| 1 | `packages/trust` + `CapabilityCertificate` ledger (trust doc §9, Phase 0) — build and test in isolation, no product wiring yet. |
| 2 | `Actor` model + kind registry + unified onboarding/admin pages, replacing `Agent`/`SensorDevice`. Migrate `vaultysclaw-sensor` into the workspace. |
| 3 | Wire certificates end-to-end: issuance, status-check protocol (trust doc §4), `ws-server.ts` split, WebRTC hardening (trust doc §4.4). |
| 4 | Notification Channels + Apprise integration (§5); delete `packages/notifier`. |
| 5 | Delete workflows, channels, Teams bridge, end-user settings area, `UserGrant`/`DelegationCert`/`AgentPeerGrant` (subsumed per §4.4). |
| 6 | REST API VaultysId revamp (trust doc §6): `ApiKey` → DID-bound, session-cookie signature upgrade for mutating calls. |

Steps 4–5 can reorder freely relative to each other; step 6 is independent and can run in parallel
with any other step once step 1 lands.

## 9. Open questions

- **Operator roles**: §4.5 proposes collapsing Owner/Admin/Member into capabilities in the same
  ledger (`admin_console_access`, `portal_access`, maybe a finer `audit_read_only` if you want a
  read-only auditor tier without full admin rights). Confirm this is the direction rather than
  keeping a parallel role enum alongside the cert ledger.
- **Access Portal's "connect" mechanism**: §4.5 leaves what "connecting" to an agent actually looks
  like as owned by the agent's kind (e.g. `openclaw` chat). Worth confirming that's sufficient for
  the kinds you care about first (`openclaw`, `mcp`) rather than needing a portal-side abstraction
  over multiple kinds' connect UIs.
- **`packages/agent-controller`'s existing tool surface** (`remote-agent-tools.ts` and similar) —
  worth an inventory pass to confirm nothing left in there quietly depends on channels/workflows
  before step 5 deletes those models out from under it.
