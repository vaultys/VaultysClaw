# Certificate Web of Trust — Design

**Status:** Draft — core security architecture, supersedes the aspirational claims in
[`docs/SECURITY.md`](SECURITY.md) ("verified by the next Agent Controller before executing an
action") with a concrete protocol. Complements
[`ZERO_TRUST_COMPLIANCE.md`](../ZERO_TRUST_COMPLIANCE.md) — this doc is the design for closing
the Foundation → Enterprise gaps that document identifies under "Identity & Authentication" and
"Access Control."

## 1. Core principle

**No party is forced offline; every party can be made untrustworthy.**

VaultysClaw does not control agent code running on remote infrastructure, so it cannot guarantee
a revoked agent stops acting — a modified or compromised binary can ignore a revocation pushed to
it. What VaultysClaw *can* guarantee is that **nobody legitimate acts on a revoked agent's behalf
without knowing it's revoked**, because every interaction — control plane ↔ agent, agent ↔ agent,
third party ↔ agent, human ↔ API — is gated behind a live or stapled trust check against the
control plane's certificate ledger, and both sides of every interaction hold their own VaultysId
and their own certificate.

This reframes "kill switch" from *transport-level disconnect* (works only for full deregistration,
see `disconnectAgent`, [`ws-server.ts:2428`](../packages/control-plane/lib/ws-server.ts)) to
*ledger-level revocation* (works for narrowing/pulling capabilities without touching the
connection) — checked by whoever is about to trust the agent, not enforced by force-closing a
socket.

## 2. Actors

Every actor is a VaultysId-identified **Actor**. Four kinds exist today or are introduced here:

| Kind | Existing model | Has capabilities? | Registered via |
|---|---|---|---|
| `agent` | `Agent` | Yes | `PendingRegistration` (`kind: "agent"`), existing WS handshake |
| `sensor` | `SensorDevice` | No | `PendingRegistration` (`kind: "sensor"`) |
| `verifier` (new) | — | No (read-only trust) | `PendingRegistration` (`kind: "verifier"`) — same handshake, no capability request |
| `human` | `User` (+ `EntraIdentity`/`OidcIdentity`) | Via `UserGrant`/`DelegationCert` | Passwordless VaultysId QR login (existing), or OIDC/Entra bound to a DID (§6) |

`verifier` is the new addition: any external system that needs to check an agent's live status
(another org's agent, an MCP tool gateway, a monitoring dashboard, a workflow step acting on an
agent's output) registers the same way a sensor does — real VaultysId handshake, admin approval,
no capability grant — and gets its own certificate proving *it* is a known, attributable party.
This matters because the status-check protocol (§4) is itself authenticated: an anonymous caller
should not be able to fingerprint who the control plane is watching.

**Transport is not part of a Actor's identity.** Every Actor above connects over one of
two transports, and this design must treat both as equally first-class — a rule that becomes
concrete in §4.4:

- **WebSocket** — the default, agent ↔ control plane, raw WS.
- **WebRTC** — two distinct uses that must not be conflated:
  1. *Control-plane-brokered* (`peerjs-server.ts`): PeerJS as an alternate transport for the
     same agent↔control-plane link (e.g. when a firewall blocks raw WS). This already converges
     into the identical dispatch as WS — `routePeerjsMessage`
     ([`ws-server.ts:3002`](../packages/control-plane/lib/ws-server.ts)) calls the same
     `handleMessage` as the WS path ([`ws-server.ts:415`](../packages/control-plane/lib/ws-server.ts)).
     Any fix at that shared dispatch layer (§4.3) covers both transports for free.
  2. *Direct agent-to-agent* (`peer-manager.ts`, `packages/agent-runtime`): a genuinely
     peer-to-peer data channel between two agents that, once established, **never touches the
     control plane again**. This is the transport where the ledger design in this doc is not yet
     applied at all — see §4.4.

## 3. Certificate lifecycle

### 3.1 Today vs. target

Today, `Policy` rows ([schema.prisma:496](../packages/control-plane/prisma/schema.prisma)) are
mutable, deletable, unsigned grants — good enough for the enforcement gates in
`PolicyEnforcer` ([enforcer.ts](../packages/policy/src/enforcement/enforcer.ts)) but not a
verifiable artifact a third party can check independently. The existing `Certificate` model
([schema.prisma:105](../packages/control-plane/prisma/schema.prisma)) is a different thing
entirely — it's the low-level `@vaultys/id` connection/session certificate used during the WS
handshake itself, not a capability grant.

Target: a new **`CapabilityCertificate`** ledger — append-only, signed, status-tracked — becomes
the source of truth. `Policy` rows become a *view/config* over it (what an admin intends to grant);
`CapabilityCertificate` rows are the *record* of what was actually issued and to whom.

### 3.2 Request → co-signed issuance

Two distinct issuance paths exist, because two distinct situations exist: sometimes there's a live
counterpart to negotiate with, sometimes there isn't.

#### 3.2a No live counterpart — system/admin-issued (`packages/policy`'s `capability-grant.ts`)

Used for the bootstrap admin grant and for an admin approving a `PendingRegistration` whose agent
isn't currently connected. Reuses the existing cert primitives exactly as-is (`signCert`/`openCert`,
[`sign.ts`](../packages/policy/src/certs/sign.ts)):

```ts
// packages/policy/src/certs/capability-grant.ts
export interface CapabilityRequestBody {
  type: "capability_request";
  agentDid: string;
  requestedCapabilities: AgentCapability[];
  requestedResourceLimits?: ResourceLimits;
  nonce: string;
  issuedAt: number;
}
// signCapabilityRequestCert(vid, body) -- signed by whoever is vouching (the control plane
// itself, self-authored, when there's no live agent to ask — trust doc's signSystemRequestCert)

export interface CapabilityGrantBody {
  type: "capability_grant";
  certId: string;
  agentDid: string;
  workspaceId: string | null;
  grantedCapabilities: AgentCapability[];
  resourceLimits: ResourceLimits | null;
  requestCert: string;          // the embedded request — signed by the SAME key as the grant here
  issuedAt: number;
  expiresAt: number | null;
}
// signCapabilityGrantCert(controlPlaneVid, body) -- signed BY THE CONTROL PLANE
```

The control plane's signature covers a payload that embeds a request signed by the same key —
that's the honest audit signal for this path: nobody outside asked for this, the system/an admin
decided it directly (see `packages/controlplane/CLAUDE.md`'s `issueAdminGrant`).

#### 3.2b A connected agent — interactive issuance over a live `service: "certificate"` exchange

Used whenever the agent asking for capabilities is actually online: the SRP-style `Challenger`
protocol underneath VaultysId is multipurpose by design — `protocol`/`service` are plain strings
that discriminate *what* an exchange is for, and `metadata` carries whatever that purpose needs.
`service: "auth"` is a connection handshake; `service: "certificate"` is the same mechanism used to
*issue* a certificate interactively instead. This is deliberately not a variant of 3.2a's
`signCert`-based format — it's the library's own `Challenger` certificate (`pk1`/`pk2`/`sign1`/
`sign2`/`metadata`), which is a **native** dual-signature artifact (both parties' keys and
signatures as first-class fields, not one token nested inside another) and, importantly, is
**independently verifiable later by anyone**, offline, via `Challenger.verifyCertificate()` /
`Challenger.fromCertificate()` — the same "check it without replaying the session" property 3.2a's
format has, just gained natively instead of by embedding a token inside a token.

The full flow:

1. **Request** — a connected agent sends a plain `capability_request` message (`{
   requestedCapabilities, scope? }`) over its already-authenticated connection. No signature on the
   message itself — the connection already proved identity via the `auth` exchange; this message
   only needs to arrive over that authenticated channel. It creates (or updates) a
   `PendingRegistration` row with real `requestedCapabilities` — the same row type used for a brand
   new unknown-DID registration, generalized to also cover "an existing Actor wants more."
2. **Admin decision** — refuse (`denyPendingRegistration`), accept as requested, or accept with
   different capabilities than requested (the approval form defaults its checkboxes to what was
   requested but the admin can freely change them before submitting — "accept but modify" is the
   same action as "accept," just with edited input).
3. **Delivery is a live exchange, not an immediate write.** Approval marks the registration
   `approved` with `deliveredAt: null` — it does not mint a certificate yet. If the agent is
   currently connected, the control plane immediately prompts a new `service: "certificate"`
   `Challenger` round (proactively sending an empty-data challenge, exactly how `auth_challenge` is
   today) embedding the approved capabilities as metadata; the resulting completed certificate is
   what gets persisted as `CapabilityCertificate.certificate`, and `deliveredAt` is stamped. If the
   agent isn't connected, delivery simply waits: the next time that DID completes the `auth`
   handshake, the control plane checks for an approved-but-undelivered registration and runs the
   certificate exchange right after `auth_complete`, before anything else.

This means an agent-negotiated grant requires **both** the agent and the control plane to be
mutually, cryptographically present at the moment of issuance — a stronger liveness guarantee than
3.2a's path, which is exactly why 3.2a stays reserved for the cases with no live counterpart to
hold up their end of the exchange, rather than becoming the universal mechanism.

### 3.3 Ledger schema (additive Prisma migration)

```prisma
model CapabilityCertificate {
  id                String    @id            // certId, embedded in the signed payload too
  agentDid          String
  workspaceId       String?
  capabilities      Json      @default("[]")
  resourceLimits    Json?
  // "packcert" (3.2a: packages/policy's signCert wire format) or "challenger" (3.2b: the
  // library's native Challenger certificate) — the two formats are structurally different,
  // so anything that decodes/verifies this row branches on this field first.
  certFormat        String    @default("packcert")
  certificate       String                   // the cert itself (base64) — shape depends on certFormat
  requestCertificate String?                 // packcert only: the embedded request, for audit.
                                              // null for "challenger" rows — the co-signature is
                                              // already native to `certificate` (pk1/pk2/sign1/sign2).
  status            String    @default("active") // active | revoked | superseded | expired
  issuedAt          DateTime  @default(now())
  expiresAt         DateTime?                  // null = does not auto-expire (rare — see below)
  revokedAt         DateTime?
  revokedBy         String?                  // admin userDid, or "system"
  revokedReason     String?
  supersededByCertId String?

  agent     Agent      @relation(fields: [agentDid], references: [did], onDelete: Cascade)
  workspace Workspace? @relation(fields: [workspaceId], references: [id], onDelete: SetNull)

  @@index([agentDid, status])
  @@index([expiresAt])
}
```

Rows are never deleted or mutated after `active` except to flip `status` + fill the `revokedAt`/
`revokedBy`/`revokedReason` or `supersededByCertId` fields — this is what makes the ledger an
audit trail, not just a cache, and it's what a `verifier` is actually checking in §4.

**`expiresAt: null` is the exception, not the default.** The default posture for every cert in
this design is time-boxed (§3.6 makes short TTLs the normal case for scoped grants; §3.4 covers
proactive renewal for standing ones). A `null` expiry means the cert is valid until explicitly
revoked — no renewal cadence, no automatic lapse. That's a deliberate, narrow exception: it doesn't
weaken the ledger's revocation model (an indefinite cert is neutralized the same way any other
is — flip `status` to `revoked`, and every live-or-stapled check in §4 stops honoring it), it just
removes the *time* dimension for a specific grant. `packages/trust`'s `resolvePermission` (§9)
treats a `null` `expiresAt` as "never expires," full stop — no implicit far-future date, no special
casing beyond that one comparison. The canonical use is the bootstrap admin grant in
[`REBUILD_ARCHITECTURE.md`](REBUILD_ARCHITECTURE.md) §4.5 — issuing another indefinite cert should
be a conscious, reviewable choice, not a default a UI makes easy to reach for.

### 3.4 Renewal

Two modes, both already fit the existing `triggerCertReissue` mechanism
([`ws-server.ts:2278`](../packages/control-plane/lib/ws-server.ts)) — extend it to also mint a new
`CapabilityCertificate` row (`supersededByCertId` linking old → new) rather than only pushing an
`update_capabilities` message:

- **Reactive**: agent's cert is within N minutes of `expiresAt` → agent sends `capability_request`
  again (same flow as initial issuance).
- **Proactive**: a scheduled job (same shape as the existing notification-retention cron in
  `server.ts`) scans `CapabilityCertificate` rows expiring soon and pushes a fresh grant over the
  already-open socket before expiry — no gap where the agent is running uncertified.

### 3.5 Revocation

Revocation is a **ledger write, not a network action.** Admin action → `CapabilityCertificate.status
= "revoked"` + reason, control plane still *attempts* the cooperative `update_capabilities` push
(agent may honor it), but the authoritative effect is that `status()` calls (§4) now return
`revoked` to anyone who checks — including the control plane's own dispatcher (§4.3).

### 3.6 Multiple concurrent, attribute-scoped certificates (ABAC)

> **Custom capabilities scope identically.** An admin-defined `vendor:action` name
> (`docs/CUSTOM_CAPABILITIES.md`) is not a second kind of grant: `resolvePermission` matches it by
> the same string equality, and every `CertScope` field — `resource`, `resourcePattern`,
> `maxUses`, `purpose` — applies unchanged. The shared conformance vectors pin this in both
> implementations, so it cannot quietly stop being true.

Nothing in §3.3's schema actually requires one active cert per agent — `CapabilityCertificate`
rows are keyed by `agentDid`, not unique per agent. Make that explicit and load-bearing: an agent
routinely holds **several `active` certs at once** — a long-lived standing grant (e.g.
`agent_communication`, expires in days) plus, layered on top, one or more short-lived, narrowly
scoped grants issued for a single action — e.g. read one specific file, valid for the next 10
seconds.

This is the mechanism that gives VaultysClaw an actual ABAC story without a second policy engine:
it closes the gap `ZERO_TRUST_COMPLIANCE.md` lists under Enterprise Tier ("Attribute-based access
control," "Just-In-Time (JIT) access") using the *same* cert primitive from §3.2, just issued with
a tighter scope and a TTL in seconds instead of days.

**Scope, not just a capability name.** Extend `CapabilityGrantBody` (§3.2) with an optional
`scope`:

```ts
interface CertScope {
  resource?: string;        // e.g. "file:///reports/q3.pdf", "domain:api.stripe.com"
  resourcePattern?: string; // glob/prefix, e.g. "file:///reports/*"
  maxUses?: number;         // e.g. 1 for a single-use grant
  purpose?: string;         // free-text audit tag, e.g. "quarterly-report-export"
}
```

A cert with no `scope` behaves exactly as today — a plain capability grant. A scoped cert only
authorizes an action whose target matches `resource`/`resourcePattern`; short-lived scoped certs
are the normal shape for anything ABAC-flavored: "grant `file_access` to exactly this one path for
the next 10 seconds" is a `CapabilityCertificate` row with `expiresAt = issuedAt + 10_000`,
`capabilities: ["file_access"]`, `scope: { resource: "file:///reports/q3.pdf" }` — a full ledger
entry, auditable and revocable like any other, just very short-lived.

**Effective permission is resolved per-action over a set, not per-agent over a singleton.**
Enforcement stops asking "what is the agent's policy" and starts asking "does *any* of the agent's
currently active, non-revoked certs authorize *this specific* action":

```ts
function resolvePermission(
  action: { capability: AgentCapability; resource?: string },
  activeCerts: CapabilityCertificate[],
  now: number
): { allowed: boolean; grantingCertId?: string }
```

`activeCerts` is every cert with `status === "active"` and `expiresAt > now` for that agent —
deliberately a set. An intent/tool-call that wants to exercise a specific scoped grant should cite
its `certId` explicitly (a new field on the existing intent envelope) so the audit log records
precisely which grant authorized which action, rather than "some capability the agent happened to
hold." This also makes `IntentLog` rows verifiable against a specific, short-lived scope after the
fact — exactly the audit trail an ABAC claim needs to be credible to an auditor.

**Proactive renewal (§3.4) does not apply here.** A cert issued for one file read in the next 10
seconds should expire and disappear, not get silently refreshed. Renewal stays a property of
*standing* grants only — in practice, any cert carrying a `scope` or a TTL under a configurable
threshold is excluded from the proactive-renewal scan.

## 4. Trust verification protocol

This is the new piece — the "OCSP" of VaultysClaw.

### 4.1 Status-check message/route

> **The response is filtered against the custom-capability registry** before it is signed
> (`docs/CUSTOM_CAPABILITIES.md`). A `vendor:action` name an admin has deleted from the registry is
> omitted from `capabilities`, even though the stored certificate row still carries it — so a
> status check is the propagation path for a registry deletion, not merely a revocation check. This
> is deliberate and is what makes "delete a capability" fail closed: what the holder keeps is what
> this signed response says, not what the ledger row happens to contain.
>
> The status is still the row's own (`active`/`revoked`/`superseded`/`expired`). A certificate whose
> capabilities are all filtered away is reported as *active with nothing on it*, rather than
> collapsed to `revoked` — misreporting the ledger to express an authorization outcome would make
> the audit trail lie.

Two transports for the same operation, both requiring the caller to be an authenticated Actor
(agent, verifier, or human session — never anonymous):

- **WS** (for already-connected agents checking a peer, e.g. before honoring an
  `AgentPeerGrant`): new message types `cert_status_request` / `cert_status_response`.
- **REST**: `GET /api/certs/:certId/status` (or `?agentDid=` for "current active cert"), under the
  same auth upgrade as §6.

```ts
interface CertStatusRequest {
  certId: string;              // or agentDid to mean "current"
  requesterDid: string;
  nonce: string;
  signature: string;           // requester signs {certId, nonce, timestamp}
}

interface CertStatusResponse {
  certId: string;
  agentDid: string;
  status: "active" | "revoked" | "superseded" | "expired";
  capabilities: AgentCapability[];
  resourceLimits: ResourceLimits | null;
  checkedAt: number;
  expiresAt: number;
  signature: string;           // signCert(controlPlaneVid, responseBody) -- independently verifiable
}
```

The response is **signed by the control plane**, not just returned over an authenticated
transport — so a verifier can cache it, forward it, or present it to a *third* party ("here's proof
agent X was active as of 14:03") without that third party needing to hit the control plane itself.
This is what makes stapling (§5) possible without weakening the guarantee.

### 4.2 Who calls this

- **Agent-to-agent**: before an agent acts on an `AgentPeerGrant` from a peer, it checks the peer's
  current cert status (extends the existing peer-grant flow,
  [`peer-grant.ts`](../packages/policy/src/certs/peer-grant.ts), with a live/stapled check as a
  precondition, not just verifying the grant cert's own signature and expiry as today).
- **Verifier-to-agent**: an external system (MCP gateway, dashboard, another org) checks before
  trusting an agent's output.
- **Control-plane-to-agent** (§4.3): the control plane itself, before dispatching or accepting.

### 4.3 Closing the gap in `ws-server.ts`

The investigation that led here found the actual hole: `handleMessage`
([`ws-server.ts:461`](../packages/control-plane/lib/ws-server.ts)) keeps routing `result`/
`tool_execution` from an agent through a certificate reissue, with no per-message revalidation.
Under this design that's not a special case to bolt on — **the control plane's own dispatcher
becomes a verifier of its own ledger** on every inbound `result`/`tool_execution`, using the same
`cert_status` check any other verifier would use (in-process, so effectively free — no need to hit
the network for a check against its own database). This is the one change that makes revocation
actually bite on the control-plane↔agent link; everything else in this doc generalizes it outward.

### 4.4 Transport independence — WS and WebRTC treated together

The status-check protocol in §4.1 is defined as a **message shape**, not a WS message — that
distinction matters because it's the only way to make the direct agent-to-agent WebRTC channel
(`peer-manager.ts`) honor the same ledger as everything else.

**Current state of `peer-manager.ts` (the gap):** the P2P data channel runs a real SRP
(`Challenger`) handshake to prove identity — that part is solid, equivalent to the WS auth
challenge. But authorization after identity is proven is local-only and admits it in its own
comments: `isIncomingAuthorized` ([`peer-manager.ts:561`](../packages/agent-runtime/src/peer-manager.ts))
checks a `peerCatalog` cached from the last control-plane push, and when it can't find a matching
entry, falls through to `return true; // SRP passed — identity is proven; grant enforcement is
best-effort from local catalog` ([`peer-manager.ts:588`](../packages/agent-runtime/src/peer-manager.ts)).
Outgoing calls (`getOrConnect` → `findGrant`,
[`peer-manager.ts:246`](../packages/agent-runtime/src/peer-manager.ts)) similarly only check the
locally cached grant's presence, not its live status. A revoked `AgentPeerGrant` has no effect on
an already-cached catalog until the next push — there is currently no live or stapled check at
all on this transport, which is exactly the gap this whole design closes for WS.

**Fix, using primitives this doc already defines:** extend the `PeerMessage` union in
`peer-manager.ts` with `cert_status_request` / `cert_status_response` variants carrying the exact
`CertStatusRequest`/`CertStatusResponse` bodies from §4.1 (same signed-response guarantee) —
this is a JSON message over an already-open data channel, no new transport plumbing needed. Both
`connectToAgent` (outgoing) and `handleIncoming` (incoming) then run this check, subject to the
same fail-open/closed and staple-TTL config from §5, in place of the current "trust the cached
catalog" fallback:

- If online (can reach the control plane over its own WS link independently of the P2P channel):
  live query, same as any other verifier.
- If offline or partitioned: fall back to a stapled `CertStatusResponse` presented over the same
  data channel by the P2P peer that just proved its identity — cache validity governed by
  `stapleTtlSeconds`. This is the one case in the whole design where stapling isn't optional
  infrastructure but the *only* way the check can work when the two agents are P2P-connected but
  the control plane is unreachable to one or both — fail-closed here means "refuse the P2P call,"
  fail-open means "proceed on the last staple within TTL."

This makes the two WebRTC use cases symmetric with WS rather than one being fully covered (§4.3)
and the other being unauthenticated-in-effect: **any transport, once identity is proven, must
still pass the same live-or-stapled ledger check before a capability-gated action proceeds.**

## 5. Configurable trust policy

Both knobs are configurable **org-wide (default) and per-workspace (override)**, precedence
workspace → org default → hardcoded safe default (fail-closed, no staple) so new customers start
maximally strict and loosen deliberately.

### 5.1 Fail-open vs. fail-closed

What a verifier does when it cannot reach the control plane to check status:

| Mode | Behavior | Fits |
|---|---|---|
| `closed` (default) | Refuse to act/trust until a live check succeeds | Regulated / high-security customers |
| `open` | Proceed using last-known-good status if within staple TTL, else proceed anyway with a logged warning | Availability-sensitive deployments willing to accept the gap |

### 5.2 Staple vs. live query

| Mode | Behavior |
|---|---|
| `stapleTtlSeconds: 0` | Force live query every time (user's "force always query") |
| `stapleTtlSeconds: N > 0` | Verifier accepts a `CertStatusResponse` signed within the last N seconds, presented by the agent itself (stapled) or cached from a prior live check, before falling back to a live query |

### 5.3 Storage

```prisma
// Setting (existing model) rows, org-wide default:
//   "trust.failMode"          -> "open" | "closed"
//   "trust.stapleTtlSeconds"  -> number as string

// Workspace (existing model) — add nullable override columns:
model Workspace {
  // ...existing fields...
  certFailMode         String? // null = inherit org default
  certStapleTtlSeconds Int?    // null = inherit org default
}
```

## 6. REST API: from session/API-key to VaultysId

### 6.1 Current state

- Browser: `next-auth` session cookie (`getServerSession`,
  [`auth-utils.ts:45`](../packages/control-plane/lib/auth-utils.ts)) — but login itself is already
  passwordless VaultysId QR (per `docs/SECURITY.md`), so the DID exists; the cookie just isn't
  bound to it per-request.
- Programmatic: `ApiKey` ([schema.prisma:767](../packages/control-plane/prisma/schema.prisma)) — a
  static hashed bearer token with `allowedRoutes`/`workspaceId` scoping. Valid until expiry/
  revocation, no per-request proof of possession, no DID.

Neither is a live cryptographic signature over the specific request — a leaked cookie or key is
usable by anyone who has it until someone notices.

### 6.2 Target

Every REST caller becomes a Actor (§2) with a bound DID:

- **Humans**: the session cookie remains the baseline transport (unchanged UX), but is bound to
  the user's VaultysId DID at login. Read-only calls stay cookie-only; mutating/admin-scope calls
  (capability grants/revokes, credentials, admin settings) require an additional per-request
  signature (`X-VaultysId-Signature` over `method + path + bodyHash + timestamp + nonce`),
  verified against the DID bound to the session. This is a proof-of-possession upgrade, not a
  parallel auth system.
- **Services/agents calling the API directly**: `ApiKey` is repurposed from *shared secret* to
  *DID pointer* — the row stores the caller's DID and `allowedRoutes`/`workspaceId` scoping as
  today, but auth is the same signed-request scheme, not a bearer token. This reuses the exact
  primitive agents already use to authenticate over WS.

### 6.3 Graceful degradation for OIDC/Entra/SAML

These remain valid **identity-establishment** paths — how a human first proves who they are to an
enterprise IdP — but are not a parallel, permanent trust tier. `EntraIdentity`/`OidcIdentity`
([schema.prisma:39,51](../packages/control-plane/prisma/schema.prisma)) already link an external
identity to a `User`; this design requires that link to also bind/mint a VaultysId DID for that
user, so once SSO establishes *who*, the DID-based signing scheme in §6.2 handles *every request
after that* the same way regardless of how the user first logged in. No org is asked to give up
their IdP; they just end up inside the same ledger-checked trust model as everything else.

## 7. Migration plan (non-breaking, phased)

| Phase | Scope | Behavior change |
|---|---|---|
| 0 | `CapabilityCertificate` ledger + `capability-grant.ts` cert wrappers + bootstrap the new `packages/trust` package (§9) with `resolvePermission` and its property tests, issuance flow wired to existing approval UI | None — additive, existing `Policy`-based enforcement keeps working |
| 1 | Status-check protocol (WS + REST) + control plane checks its own ledger before dispatching/accepting (§4.3) | Revocation starts actually mattering on the control-plane↔agent link |
| 2 | `verifier` actor kind + agent-to-agent peer checks + configurable fail-open/closed + staple (§5) — **includes hardening `peer-manager.ts`'s WebRTC data channel** (§4.4), replacing the current "best-effort from local catalog" fallback ([`peer-manager.ts:588`](../packages/agent-runtime/src/peer-manager.ts)) with a live-or-stapled `cert_status` check | Revocation propagates to third parties over WS *and* direct P2P WebRTC; customers can tune the availability/security tradeoff |
| 3 | REST signed-request upgrade, `ApiKey` → DID-bound, OIDC/Entra → DID binding (§6) | Closes the "everything talking to the control plane has a VaultysId" gap for humans/services, not just agents |
| 4 | Retire remaining un-authenticated surfaces under the same model — notably the Teams bridge webhook (`verifyTeamsRequest`, currently a stub always returning `true`, [`teams-gateway.ts:63`](../packages/control-plane/lib/bridges/teams-gateway.ts)) — and route bridge secrets through the existing vault (`vault.ts`) instead of the current no-op `encryptConfig` | Closes the two concrete security holes found during the architecture review, using the same actor model rather than one-off fixes |

## 9. Package boundary: `packages/trust`

Everything in §3.6 is a decision function over a *set* of already-verified certificates — no
Prisma, no WebSocket, no Next.js. That purity is exactly what `packages/policy` already gets right
for the single-cert enforcement gates (`PolicyEnforcer`); the multi-cert/ABAC resolution logic
deserves the same treatment, but in its own package rather than folded into `packages/policy`'s
existing scope.

**Why a new package, not an addition to `packages/policy`:** `packages/policy`'s own `CLAUDE.md`
scopes it deliberately narrowly — cert wire format plus single-policy enforcement gates.
`resolvePermission` over a *set* of concurrent, overlapping, ABAC-scoped certificates is a
different responsibility with a different test shape (property/fuzz tests over random cert-set
combinations, not gate-by-gate unit tests), and it's exactly the kind of code a security audit
will want to point at as one self-contained artifact. Mixing it into `packages/policy` would blur
that boundary right when the codebase most needs it sharp.

**What `packages/trust` contains:**
- `resolvePermission(action, activeCerts, now)` — the core ABAC decision function (§3.6).
- `CertScope` and the extended `CapabilityCertificate`/`CapabilityGrantBody` types (superset of
  §3.2/§3.3).
- The renewal-eligibility rule from §3.6 (which certs are "standing" vs. "scoped/ephemeral").
- Property-based tests asserting the two invariants that actually matter for a security kernel:
  *revoking a cert never grants more access*, and *adding a cert never removes access* except via
  an explicit scope-narrowing renewal (`supersededByCertId`).

**What it does *not* contain:** signing/verification — `packages/policy/src/certs` already owns
the wire format, and `packages/trust` takes already-opened, already-verified cert payloads as
input, not raw tokens. No DB access either: a `CapabilityCertificateDAO` in control-plane fetches
the rows, `packages/trust` decides, control-plane acts on the decision. Same layering discipline as
`packages/policy` — consumed by DB-aware wrappers in `control-plane`, and directly (no DB at all)
by `agent-runtime` for local decisions, e.g. `peer-manager.ts` evaluating a `cert_status_response`
(§4.4) against its own locally-held cert set with no database in the loop.

**Dependency direction:** `packages/trust` depends on `packages/policy` for cert types
(one-directional — mirrors the existing `control-plane`/`agent-runtime` → `policy` layering, and
deliberately avoids repeating the `shared` → `policy` inversion flagged in the original
architecture review).

**Testing bar:** same convention as `packages/policy` — own `vitest.config.mjs`, Docker-free,
`pnpm --filter @vaultysclaw/trust test` runnable in isolation, picked up by the repo-root
`pnpm test`. This is the piece an external audit will scrutinize hardest, so the bar is exhaustive
cert-set combination coverage (expired/active/revoked/scoped/overlapping), not just happy-path
gates.

## 10. Non-goals (explicitly out of scope for this doc)

- Hardware-backed key storage / mTLS transport pinning — that's the "Advanced tier" axis in
  `ZERO_TRUST_COMPLIANCE.md`, orthogonal to this ledger design.
- Private-key compromise/rotation ceremonies — a leaked agent key is still usable until someone
  revokes *and* a verifier checks; this design makes that check meaningful and cheap, it doesn't
  prevent misuse in the window before revocation.
- Real-time behavioral risk scoring — noted as Enterprise-tier future work elsewhere, not part of
  the certificate lifecycle itself.
- A general-purpose policy DSL (Rego/OPA-style rule language) for `CertScope` — §3.6 deliberately
  keeps scope a small structured field (resource/pattern/uses/purpose), not an expression
  language. If real usage demands boolean logic over attributes, that's a follow-up design, not an
  extension bolted onto `packages/trust`'s core decision function.
