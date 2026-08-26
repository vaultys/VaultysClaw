# Custom Capabilities — Implementation Plan

Status: **built.** Implemented across `packages/policy`, `packages/controlplane`, `packages/sdk`
and `sdk-go/`. This document is kept as the design record — the reasoning behind each decision is
still the reason the code is shaped this way. Where the implementation departed from the plan, the
departure and its cause are recorded in §6 at the end.

## 1. The concept

A **custom capability** is an admin-defined, namespaced grant (`vendor:action`, e.g.
`acme:invoice.approve`) that travels through the *exact same* certificate, ledger and
trust-resolution machinery as a built-in `AgentCapability` — but whose **meaning** is known
only to the client application that binds an operation to it.

The control plane governs *who may hold it*. The application decides *what it does*.

Design decisions, fixed:

| Question | Decision |
|---|---|
| Who declares one | An admin, in an org-global control-plane registry. Agents never self-declare. |
| Naming | `vendor:action`. The colon is what makes collision with a future built-in impossible. |
| Trust engine | Full participation — `resolvePermission`, expiry, revocation, multi-cert resolution. |
| Grant model | Full `CertScope`: `resource`, `resourcePattern`, `maxUses`, `purpose`, delegation rules. |
| Approval | **Not** a registry concern. Stays `AgentToolDefinition.requiresApproval`. |
| Tool binding | A `capabilities.json` manifest the agent loads, so operators rebind without touching tool code. |
| Unsatisfied capability | Tool hidden from the LLM; the full declared manifest is reported in the `register` payload. |
| Ownership | Org-global registry (Owner-managed); grants scoped per workspace/actor as usual. |
| Registry deletion | **Fail closed** — a deleted name stops resolving, propagated through the existing staple/status protocol. |

## 2. Where today's code stands

- `AgentCapability` is a closed union — `packages/policy/src/types.ts:20`.
- Grantable sets are hardcoded per actor kind — `packages/controlplane/lib/capabilities.ts:5`,
  filtered at approval in `lib/registrations.ts:39`.
- `resolvePermission` matches by plain string equality —
  `packages/trust/src/resolve-permission.ts:62`. **It needs no change for custom names.**
- The status/staple protocol is complete *server-side*: `packages/policy/src/certs/cert-status.ts`
  (incl. the `maxAgeMs` staple gate) and `controlplane/lib/ws-server.ts:592`, which reads the cert
  live from the DB and returns `capabilities`/`resourceLimits`/`scope`/`status`, signed and audited.
- Trust config already reaches actors: `lib/actor-config.ts:160` maps `trust.failMode` →
  `failClosed`, and per-kind `maxStatusAgeSeconds` (`lib/proxy-kind.ts:125`).

### Three real gaps

1. **No client ever performs a status check.** `packages/sdk/src/actor-runtime.ts:445` hardcodes
   `status: "active"` when building the cert for `resolvePermission` and never refreshes. Nothing
   in the repo calls `verifyCertStatusResponseCert`. `failClosed`/`maxStatusAgeSeconds` are
   delivered and ignored. **Fail-closed is a config knob with no enforcement behind it.**
2. **`handleCertStatusRequest` returns `cert.capabilities` verbatim** from the row, unfiltered — a
   refresh would happily re-affirm a capability deleted from the registry.
3. The org-wide `trust.stapleTtlSeconds` an admin edits under Settings **does not** reach actors —
   only the per-kind `maxStatusAgeSeconds` does (`lib/actor-config.ts:150`).

Consequence: **the staple loop is a prerequisite of this feature, not a follow-up.** It is Phase 3.

### Scope note — one client stack now

An earlier draft of this plan split the agent-side work between `packages/agent-controller` (which
owned a tool registry) and `packages/sdk`. `packages/agent-controller`, `packages/agent-runtime`
and the legacy `packages/control-plane` have since been deleted from this branch, which
**simplifies the plan rather than complicating it**: there is one control plane, and its clients
are `packages/sdk` (TypeScript) and `sdk-go/` (Go).

The consequence for this feature: there is **no tool registry in this repo any more**. Phase 4's
manifest and tool binding therefore becomes an SDK capability — the SDK exposes the manifest and
the "which capabilities am I missing" report, and whatever host application binds tools to
capability names supplies the bindings. That is the right layer regardless: a capability's meaning
was always the application's business, and the SDK is the seam where the grant arrives.

## Phase 0 — Type widening (`packages/policy`, `packages/shared`)

`packages/policy/src/types.ts`:

```ts
export type BuiltinCapability = "file_access" | ... | "delegation";  // today's union, renamed
export type CustomCapability = `${string}:${string}`;
export type AgentCapability = BuiltinCapability | CustomCapability;
```

The template literal keeps arbitrary `string` unassignable while admitting any namespaced name.
It is deliberately *coarse* — `"acme:"` type-checks — so pair it with a runtime validator in the
same file, the single source of truth every layer calls:

```ts
export const CUSTOM_CAPABILITY_RE =
  /^[a-z0-9][a-z0-9-]{1,31}:[a-z0-9][a-z0-9._-]{1,63}$/;
export function isCustomCapability(c: string): c is CustomCapability;
export function assertValidCapabilityName(c: string): void;  // throws with a stable message
```

Also in this phase:
- `@vaultysclaw/shared` re-exports the new names alongside the old (`AgentCapability` keeps working).
- Sweep for exhaustive `switch`/`Record<AgentCapability, …>` over the old union — a union with a
  template literal member breaks exhaustiveness. Expect hits in UI label maps; give each a
  `default` branch that falls back to the registry label (or the raw name).
- `packages/trust` needs **no logic change** — `capabilities.includes(action.capability)` and the
  whole `CertScope` path are already name-agnostic.

**Tests:** `packages/policy` — validator accepts/rejects a table of names; a built-in is never
`isCustomCapability`. `packages/trust` — add conformance vectors in
`__tests__/conformance.test.ts` for a custom name with `resourcePattern` + `maxUses` + expiry,
proving it resolves identically to a built-in.

## Phase 1 — The registry (`packages/controlplane`)

New Prisma model (`prisma/schema.prisma`), migration `add_custom_capability`:

```prisma
model CustomCapability {
  id          String   @id @default(uuid())
  name        String   @unique   // "acme:invoice.approve"
  vendor      String              // "acme"          — denormalised for grouping in the UI
  action      String              // "invoice.approve"
  label       String
  description String?
  group       String?             // free-text grouping in the issuance UI
  createdBy   String              // DID or user id of the Owner who created it
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([vendor])
}
```

No `isActive`, no soft-delete: the decision is hard fail-closed, and a second "deprecated but
still resolving" state would quietly reintroduce the grandfather semantics we rejected.
`name` is immutable after creation (rename = delete + create, which correctly reads as a revoke).

`db/custom-capability.dao.ts`, mirroring `db/webhook.dao.ts`: `create`, `findById`, `findByName`,
`list`, `listNames()` (cheap `select: { name: true }` — the hot path for status filtering),
`update` (label/description/group only), `delete`. Export from `db/index.ts`.

**Deletion is a mass revoke and must say so.** The delete action:
1. counts non-revoked `CapabilityCertificate` rows whose `capabilities` JSON contains the name;
2. requires an explicit typed confirmation showing that count;
3. deletes the row, then revokes (or rewrites) the affected certs;
4. pushes `actor_config` to every connected holder so the change is prompt rather than
   staple-TTL-late.

Steps 3–4 are belt and braces. The authoritative mechanism is the Phase 3 status filter — a cert
that survives revocation still stops resolving on its next refresh.

## Phase 2 — Issuance surface (`packages/controlplane`)

**`lib/capabilities.ts`** — `allowedCapabilitiesForKind` is currently sync and hardcoded. Add:

```ts
export async function grantableCapabilitiesForKind(kind: string): Promise<readonly AgentCapability[]>
```

returning the kind's built-ins **plus every registry name**. Custom names are not
kind-partitioned — a `vendor:action` is meaningful to whichever agent binds a tool to it, and a
per-kind allow-list for admin-defined names would be a second registry to keep in sync. The
existing sync `allowedCapabilitiesForKind` stays as the built-in allow-list it already is.

Callers to make async:
- `lib/registrations.ts:39` — the approval filter. Anything not in the resolved set is dropped,
  exactly as today, so a stale form post naming a since-deleted capability grants nothing.
- The direct-issuance path behind `app/admin/certificates/new/page.tsx`.

**UI:**
- New CRUD page `app/admin/integrations/capabilities` (`integrations/` already holds `channels`,
  `identity`, `models`, `webhooks` — same shape). Owner-gated. Name field validated client- and
  server-side against `CUSTOM_CAPABILITY_RE`.
- `app/admin/certificates/new/page.tsx:6` has its **own hardcoded copy** of `AGENT_CAPABILITIES` —
  delete it, import from `lib/capabilities`, and render registry entries in a "Custom" section
  grouped by `vendor`/`group`, each with its label + description.
- `app/admin/actors/page.tsx:88` (registration approval) — same, honouring the per-kind built-in
  split it already does.
- Certificate detail page: render a custom name with its registry label, and flag
  **"not in registry"** when a held name no longer resolves.

**Audit + webhooks:** `capability.created` / `capability.updated` / `capability.deleted` via
`recordEvent`. Per the repo rule in `CLAUDE.md`, adding a webhook event means all five steps —
catalog entry, emit, payload builder (`customCapabilityPayload`, allow-list only), docs example in
`webhook-docs.ts`, and a verification pass. `capability.deleted` carries the affected-grant count.

## Phase 3 — Fail-closed: close the staple loop

### 3a. Control plane filters the status response

`lib/ws-server.ts:592` `handleCertStatusRequest`, after loading the cert:

```ts
const registry = new Set(await CustomCapabilityDAO.listNames());
const effective = (cert.capabilities as string[]).filter(
  (c) => !isCustomCapability(c) || registry.has(c)
);
```

Sign `effective`, not `cert.capabilities`. If the filter removed everything, still return the row's
real `status` with an empty capability list — "active certificate, nothing left on it" is the
honest answer, and collapsing it to `revoked` would misreport the ledger.

Do the same filtering wherever a grant is minted or pushed: the `cert_issued` payload and
`actor_config`'s `grantToken`. Otherwise a reconnect re-hydrates a deleted capability and the
actor holds it until its next refresh.

### 3b. SDK performs the check (`packages/sdk/src/actor-runtime.ts`)

This is the load-bearing change. Today `activeCerts()` asserts `status: "active"` and lies.

1. **Keep the server identity.** `handshake.contactId()` returns the control plane's `VaultysId`
   once the auth exchange completes; the runtime currently discards it. Store it as `serverVid` —
   `verifyCertStatusResponseCert` needs it, and taking it from the completed handshake (rather than
   from config) means the verifier key is the one that actually authenticated.
2. **`refreshCertStatus()`** — `signCertStatusRequestCert(vid, { certId, requesterDid, nonce })`,
   send `cert_status_request`, and on `cert_status_response` call
   `verifyCertStatusResponseCert(serverVid, token, maxAgeMs)`.
3. **On a verified response:** replace `capabilities` with the response's list, record
   `lastStatus` + `lastCheckedAt`, persist via `saveCapabilityState`, and emit a
   `capabilities` event so hosts can rebuild their tool set. **A capability that disappears from
   the response is dropped** — that is the whole fail-closed mechanism.
4. **Scheduling**, from `actorConfig.trust.maxStatusAgeSeconds`:
   - `> 0` — refresh on that interval, and on reconnect.
   - `= 0` — strictest: no cached status is acceptable, so refresh before answering
     `resolvePermission` (or refuse when offline).
   - `< 0` — unbounded; never auto-refresh. Keep today's behaviour.
5. **`activeCerts()` stops lying.** It reports the last verified status, and when the staple is
   older than `maxStatusAgeSeconds`: return `[]` if `trust.failClosed`, else keep the cached grant.
   Delete the "does not perform yet" comment at `:445` — it becomes false, and leaving it would be
   worse than never having written it.
6. **`cap-state.ts`** gains `lastStatus` / `lastCheckedAt`, written as optional fields so the
   file stays compatible with the Go SDK's `vconn/capstate.go` it deliberately mirrors.

### 3c. Make the admin knob real

`lib/actor-config.ts:150` documents that org-wide `trust.stapleTtlSeconds` does not map — only
per-kind `maxStatusAgeSeconds` does, which exists solely for `proxy`. For every other kind the
Settings knob is inert. Fix: fall back to `trust.stapleTtlSeconds` when the kind config carries no
override, preserving the documented translation (`0` = strict, negative = unbounded) rather than
inheriting the value blindly.

**Tests:** ws-server — a status request for a cert holding a deleted custom name returns it
filtered out. SDK — a refresh that omits a capability drops it; an expired staple with
`failClosed` empties `resolvePermission`; with `failClosed: false` it does not; `maxStatusAgeSeconds: 0`
forces a live query. Extend the existing controlplane integration test that already covers the
`cert_status_request`/`cert_status_response` round.

## Phase 4 — Client: manifest, binding & reporting (`packages/sdk`)

The SDK gains the vocabulary for an application to declare what capability names it needs and
which of its own operations each one gates. It does **not** gain a tool registry — binding a
capability to an actual operation stays the host application's job.

**A manifest the SDK loads** (`capabilities.json`, path via config, mirroring how
`capabilityStatePath` already works):

```jsonc
{
  "version": 1,
  "declares": [
    { "name": "acme:invoice.approve", "label": "Approve invoices",
      "description": "Marks an invoice approved in the Acme ERP." }
  ],
  "bindings": { "erp_approve_invoice": "acme:invoice.approve" }
}
```

`src/capability-manifest.ts`: load, parse, and validate every name with `packages/policy`'s
`assertValidCapabilityName`. `bindings` is opaque to the SDK — it maps host-defined operation names
to capability names, and the SDK only ever reads it to answer "which capability gates
`erp_approve_invoice`?" (`capabilityFor(operation)`) and to report the declared set upward. A
binding whose capability is absent from `declares` is a load error: a typo there is an operation
silently gated on a capability nobody will ever grant.

**Reporting.** `RegisterPayload` (`controlplane/lib/protocol.ts:56`) gains:

```ts
declaredCapabilities?: { name: string; label?: string; description?: string }[];
```

The SDK sends its whole manifest at registration. The control plane stores it on `Actor`
(`declaredCapabilities Json?`) and diffs it against registry + grants, so the actor detail page
shows, per entry: *in registry and granted* / *in registry, not granted* / *not in registry* — the
last with a one-click "create in registry" prefilled from the declared label and description.
Discovery without self-declaration: the admin still types the approval.

The SDK already sends `capability_request` when it holds nothing
(`packages/sdk/src/actor-runtime.ts:438`); leave it. The manifest is the complete picture, that
message is the "still stuck" nudge, and they do not conflict.

**Fail closed on the host side.** Give the SDK an explicit predicate the host is meant to gate on —
`isOperationAllowed(operation, resource?)`, resolving the binding then delegating to
`resolvePermission` — so a host never has to reimplement the check. An unbound or ungranted
operation returns false. There is deliberately no "no grants means allow everything" fallback; the
package this plan originally targeted had exactly that fail-open and it was a bug.

**Go parity** (`sdk-go/`): the manifest format and `assertValidCapabilityName`'s regex must match,
and the name-validation table belongs in `conformance/` alongside the permission vectors — that is
what stops the two SDKs drifting on what a legal capability name is.

## Phase 5 — Docs

- `docs/CERTIFICATE_WEB_OF_TRUST.md` — a subsection under §3.6 (`CertScope`) stating that custom
  names are scoped identically, and under §4.1 that a status response is filtered against the
  registry.
- `packages/controlplane/CLAUDE.md` — registry model, DAO, the integrations page, and the
  correction that the staple loop is now implemented (several notes there currently say it is not:
  lines ~943–949, and `app/admin/settings/page.tsx:17`).
- `packages/sdk` — the manifest format, `isOperationAllowed`, and the reporting payload.
- `packages/sdk` — README/example: the runtime now refreshes status, and what `failClosed` costs.

## Ordering and risk

Phases 0 → 1 → 2 are additive and shippable on their own: after Phase 2 an admin can define and
grant custom capabilities, and the agent gates on them locally. **But fail-closed is not real
until Phase 3.** Shipping 0–2 alone means a deleted capability keeps working on every connected
agent indefinitely — so if 3 is not landing in the same cycle, the registry UI must say plainly
that deletion does not take effect until reconnect.

Phase 4 is independent of 3 and can land in parallel, though both touch
`packages/sdk/src/actor-runtime.ts`.

The single largest risk is Phase 0's exhaustiveness sweep: widening a closed union to include a
template literal silently disables exhaustiveness checking everywhere it was relied on. Run
`pnpm type-check` across the monorepo before assuming the blast radius is small, and treat every
`Record<AgentCapability, …>` as a site that needs an explicit fallback rather than a compile error
that will helpfully find itself. The blast radius is much smaller than it was — six packages
instead of eleven — but the failure mode is silent either way.


---

## 6. What changed during implementation

Five things ended up different from the plan above. Each was a real constraint the plan had not
accounted for, not a change of mind.

**`filterAgainstRegistry` lives in `packages/policy`, not the control plane.** The plan put it in
`controlplane/lib/capabilities.ts`, which imports Prisma — so the pure filtering logic could not be
unit-tested without a database, and `sdk-go` had nowhere to mirror it from. It is pure capability-name
semantics, which is what `policy` owns. `sdk-go/capability` now carries the Go counterpart.

**`actor_config` had to become kind-agnostic.** Phase 3b assumed the SDK could read
`trust.maxStatusAgeSeconds` from its config, but `buildActorConfig` returned `null` for every kind
except `proxy` — so an ordinary Actor received no trust block at all, and the scheduler had nothing
to schedule from. Every kind now gets a payload carrying `trust`; only `proxy` gets
`kindConfig`/`ruleSetToken`/`grantToken`. This also resolved Phase 3c: the org-wide
`trust.stapleTtlSeconds` an admin edits under Settings previously reached *nothing*, and now reaches
every non-proxy kind with its strict `0` semantics intact.

**A packcert `grantToken` cannot be filtered, so it is withheld instead.** Phase 3a said to filter
custom capabilities everywhere a grant is minted or pushed. That works for the status response,
which the control plane signs fresh each time — but a packcert's capabilities are inside its
signature, so removing a stale name would mean re-minting the certificate under a new id and
silently changing what the holder can prove. `resolveGrantToken` withholds the grant and warns
instead, matching the existing challenger-format refusal. This is the one path where "filter it out"
was not available, and the plan had not noticed the difference.

**`resolvePermission` stayed synchronous; `checkPermission` was added.** The plan's
`maxStatusAgeSeconds: 0` behaviour ("refresh before answering") would have made the SDK's existing
synchronous API async — a breaking change, and a misleading one, since a decision that may block on
the network should look like it. `resolvePermission` remains sync and fails closed when it cannot
vouch for the staple; `checkPermission` and `isOperationAllowed` are the async variants that refresh
first. Under `maxStatusAgeSeconds: 0` the sync form always denies, which is the honest answer to
"decide without checking" when the org has said no cached status is acceptable.

**The name grammar got its own conformance table.** The plan mentioned Go parity only in passing.
Since this grammar decides which names a deployment can ever register or grant, a disagreement
between the two implementations would mean one accepting a name the other can never resolve —
the same class of bug the permission vectors exist to prevent. `conformance/capability-names.json`
(27 cases) is now run by both `packages/policy` and `sdk-go/capability`. It immediately earned its
keep: Go's `$` matches before a trailing newline where JavaScript's does not, so the Go pattern
needed `\A`/`\z` to agree — a real divergence that no amount of reading either regex would have
surfaced.

### Also fixed in passing

`issueCertificateAction` used the weak `session?.user?.did` presence check rather than
`requireAdmin()`, so any authenticated session — a `portal_access`-only human included — could
issue a certificate by posting directly to the action endpoint. It also accepted whatever
capabilities the form named, with no allow-list. Both are fixed: it now requires
`admin_console_access` and rejects anything outside `grantableCapabilitiesForKind`.
