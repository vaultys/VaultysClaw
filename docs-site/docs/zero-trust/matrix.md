---
sidebar_position: 2
title: The compliance matrix
description: VaultysClaw's per-domain self-assessment against Anthropic's Zero Trust for AI Agents framework — including the domains scoring zero.
---

# The Zero Trust compliance matrix

Self-assessment of **VaultysClaw's rebuilt control plane** against the twelve
control domains of Anthropic's *Zero Trust for AI Agents* guidance.

:::info Scope of this assessment
This matrix describes `packages/controlplane` — the rebuilt, certificate-centred
control plane — together with `packages/policy`, `packages/trust`,
`packages/agent-runtime`, the `proxy` interception point, and the Go sensor.

It does **not** describe the older proof-of-concept control plane, whose
assessment claimed a broader feature surface built on unsigned, mutable policy
rows. Where the two disagree, this page wins.
:::

## Summary

| # | Domain | Foundation | Enterprise | Advanced |
|---|---|---|---|---|
| 1 | [Agent identity & authentication](#1-agent-identity--authentication) | ✅ Built | 🟡 Partial | 🟡 Partial |
| 2 | [Access control & privilege](#2-access-control--privilege-management) | ✅ Built | ✅ Built | 🟡 Partial |
| 3 | [Resource boundaries & blast radius](#3-resource-boundaries--blast-radius) | ✅ Built | 🟡 Partial | ⬜ Absent |
| 4 | [Observability & auditing](#4-observability--auditing) | ✅ Built | 🟡 Partial | ⬜ Absent |
| 5 | [Behavioural monitoring & response](#5-behavioural-monitoring--response) | 🟡 Partial | ⬜ Absent | ⬜ Absent |
| 6 | [Input validation](#6-input-validation) | 🟡 Partial | ⬜ Absent | ⬜ Absent |
| 7 | [Output filtering & leak prevention](#7-output-filtering--leak-prevention) | ⬜ Absent | ⬜ Absent | ⬜ Absent |
| 8 | [Tool access & security](#8-tool-access--security) | ✅ Built | 🟡 Partial | 🟡 Partial |
| 9 | [Credential protection](#9-credential-protection) | ✅ Built | 🟡 Partial | ⬜ Absent |
| 10 | [Integrity & recovery](#10-integrity--recovery) | ✅ Built | 🟡 Partial | ⬜ Absent |
| 11 | [Agent memory protection](#11-agent-memory-protection) | ↩ Inherited | ↩ Inherited | ⬜ Absent |
| 12 | [AI governance](#12-ai-governance) | ✅ Built | 🟡 Partial | ⬜ Absent |

**Overall posture: Foundation complete; Enterprise partial, led by access control.**

The rebuild's shape is visible in that table. Domains 1, 2, 9 and 10 — the ones a
certificate ledger directly addresses — are the strongest, and domain 2 is the
only one where the Enterprise tier is genuinely complete, because attribute-scoped
multi-certificate resolution *is* the ledger's core function rather than something
layered on top. Domains 5, 6 and 7 — the ones about inspecting agent behaviour
and content — are the weakest, and domain 7 is empty.

---

## 1. Agent identity & authentication

Every party holds a VaultysId DID and proves possession of the corresponding
private key. No party authenticates with a bearer secret.

### Foundation — ✅ Built

| Control | Implementation | Status |
|---|---|---|
| Unique cryptographic identity | VaultysId DID per Actor; EdDSA, with a `dilithium_ed25519` post-quantum option actually wired (not a decorative badge) | ✅ |
| Identity verification | SRP-style `Challenger` handshake, `service: "auth"`, per connection | ✅ |
| No hardcoded credentials | Agents present no secret at all; identity is key possession | ✅ |
| Credential rotation not required for auth | Nothing to rotate — there is no shared secret in the agent path | ✅ |

The public key observed during the handshake is persisted on the Actor
(`Actor.publicKey`), which is what makes later **offline** re-verification of any
certificate that Actor co-signed possible with no live connection.

### Enterprise — 🟡 Partial

| Control | Status | Notes |
|---|---|---|
| Certificate lifecycle management | ✅ Built | Issue, deliver, inspect, revoke, expire — see [Certificates](/docs/concepts/certificates) |
| Certificate transparency / inspectability | ✅ Built | Every certificate's decoded payload, both signatures, and an independent live re-verification are shown in the admin console |
| Mutual TLS with certificate pinning | ⬜ Absent | Transport security is ordinary TLS; identity is proven at the application layer instead |
| Hardware-backed credentials | 🟡 Partial | Real WebAuthn/FIDO2 identities are supported for humans (`navigator.credentials.create()` + `VaultysId.fido2FromAttestation`). No HSM path for agents. |

### Advanced — 🟡 Partial

Post-quantum identities (`dilithium_ed25519`) are a real, selectable identity type
rather than a roadmap item — unusual at this tier. Everything else at Advanced
(hardware roots of trust for agent workloads, attested runtime identity) is absent.

**Known gap:** the PeerJS/WebRTC wallet-pairing path uses a public broker, which
means the listening peer ID is reachable by anyone who guesses or observes it. The
handshake is still cryptographically sound; the exposure is metadata and
connection attempts, and it is documented rather than downplayed.

---

## 2. Access control & privilege management

The strongest domain, and the one the whole architecture is organised around.

### Foundation — ✅ Built

| Control | Implementation | Status |
|---|---|---|
| Least privilege by default | An Actor with no certificate can do nothing. There is no default grant. | ✅ |
| Explicit permission model | `CapabilityCertificate` rows, signed, per capability | ✅ |
| Permission assignment at deployment | Registration → admin approval → interactive issuance | ✅ |
| Scope-limited permissions | Workspace scoping plus per-certificate `CertScope` | ✅ |

### Enterprise — ✅ Built

This is the tier the rebuild was designed to reach, and it does.

| Control | Implementation | Status |
|---|---|---|
| **Attribute-based access control** | `resolvePermission(action, activeCerts, now)` in `packages/trust` resolves a permission over the **set** of an Actor's currently-active certificates, matching `CertScope.resource` / `resourcePattern` / `maxUses` / `purpose` against the specific action | ✅ |
| **Just-in-time access** | A certificate may carry a TTL in seconds and a single-resource scope — "read exactly this file for the next 10 seconds" is an ordinary ledger row, revocable and auditable like any other | ✅ (primitive) |
| **Audit trail of permission changes** | `certificate.issued` / `certificate.revoked` recorded with the acting admin, reason, and full sanitised payload | ✅ |
| **No parallel RBAC layer** | Owner/Admin/Member does not exist. `admin_console_access` and `portal_access` are ordinary capabilities in the same ledger, checked by the same function. | ✅ |
| Dynamic privilege adjustment | 🟡 | Revocation and re-issuance take effect on the next check, but nothing adjusts privilege automatically in response to behaviour — see domain 5 |

:::note JIT is a primitive, not yet a workflow
Short-lived scoped certificates are fully supported by the ledger, the issuance
form, and `resolvePermission`. What does not exist is an automated *requester* —
an agent asking for a ten-second grant mid-task and getting one without a human
clicking approve. The mechanism is there; the ergonomics are not.
:::

### Advanced — 🟡 Partial

Delegation chains are **designed, not built**: the schema carries
`delegatedByDid`, `parentCertId`, and `parentCertHash`, and the verification order
is specified. No code path produces or consumes them, and the `delegation`
capability is deliberately not offered in any UI so an admin cannot fabricate a
certificate that claims delegation guarantees it does not have.

One piece is genuinely live today: **`non_delegatable`**. It is a plain capability
requiring no new column, and a certificate carrying it can never be a delegation
chain's parent.

---

## 3. Resource boundaries & blast radius

### Foundation — ✅ Built

| Control | Implementation | Status |
|---|---|---|
| Identity-based isolation | Every workload is attributable to a DID; nothing acts anonymously | ✅ |
| Tenancy boundary | Workspaces scope Actors, certificates, and model access | ✅ |
| Capability allow-listing per kind | `allowedCapabilitiesForKind()` filters an approval server-side — a capability outside a kind's list is dropped even if submitted by a direct form post, not merely hidden in the UI | ✅ |
| Controlled connectivity | Agents connect outbound to the control plane; they do not accept inbound connections from each other by default | ✅ |

### Enterprise — 🟡 Partial

| Control | Status | Notes |
|---|---|---|
| **Network egress enforcement** | ✅ Built | The `proxy` Actor kind is an interception point that refuses agent traffic its signed rule set and certificate do not authorise. Its rules are signed by the control plane at push time, and it enforces a `trust.failClosed` posture derived from the org trust policy. |
| **Tool-call enforcement on the host** | 🟡 Partial | The `harness` Actor kind decides every tool call from a signed grant and rule set, over resource URIs rather than network destinations. Ships **observe-only** by default — it records and refuses nothing — and `explicit` mode is advisory unless OS confinement is established. |
| Container-based isolation per agent | 🟡 Partial | Not provided for agents generally — a deployment-time concern. A **supervised harness** is the exception: `sandbox: require` establishes kernel-enforced confinement and refuses to launch without it. **macOS only** (a seatbelt profile via the deprecated `sandbox-exec`); Linux and Windows backends are designed and not built, and report an error rather than a silent pass. |
| Documented blast-radius analysis per Actor | 🟡 Partial | The certificate ledger makes "what can this Actor reach" mechanically answerable, but no report renders it |
| Per-workspace trust policy overrides | ⬜ Absent | `trust.failMode` and `trust.stapleTtlSeconds` are org-wide only; the per-workspace override columns are designed but not in the schema |

:::caution The proxy governs a zone, not an agent
An interception point governs everything pointed at it. Two agents behind one
proxy are indistinguishable to its decision. `system` mode — where the host's
proxy settings route *all* traffic through it — is not implemented, and the agent
refuses to start in that mode rather than half-supporting it.
:::

:::caution A supervisor's default posture refuses nothing
`mode: observe` is the default and decides, records, and permits everything. That
is deliberate — the resource strings it produces end up inside signed
certificates, so they are learned before being frozen — but a deployment left
there is instrumented, not governed. `vaultysclaw-sensor report` is how you get
from one to the other.
:::

### Advanced — ⬜ Absent

Hardware/hypervisor isolation per sensitive agent: not provided. The harness
supervisor's confinement is an OS sandbox, not a hypervisor boundary.

---

## 4. Observability & auditing

### Foundation — ✅ Built

| Control | Implementation | Status |
|---|---|---|
| Comprehensive action logging | One `AuditLogEntry` table; `recordEvent()` is the single call site every domain event passes through | ✅ |
| Attribution to identity | Every entry carries `actorDid` / `actorName`, or explicitly null for events with no human origin | ✅ |
| Field-level change capture | `diffFields()` records what actually changed, `from` → `to`, not just that something did | ✅ |
| Certificate re-verification in the trail | Certificate rows in the audit log carry a **live-recomputed** signed/invalid badge, re-derived from the stored certificate bytes rather than trusting a stored flag | ✅ |
| Status-check audit | Every `cert_status_request` is recorded as a `CertStatusCheck` row — who asked about which certificate, and when | ✅ |

### Enterprise — 🟡 Partial

| Control | Status | Notes |
|---|---|---|
| Append-only by construction | 🟡 Partial | The DAO exposes only `create`/`list`/`count`/`recent` — no update or delete path exists in code. But it is an ordinary Postgres table; nothing at the database level prevents a privileged operator from rewriting it. **Append-only by discipline, not by storage.** |
| Signed / tamper-evident logs | ⬜ Absent | Audit rows are not signed or hash-chained. The certificates they reference are, which is why the live re-verification badge is meaningful — but the log itself is not tamper-evident. |
| SIEM export | ✅ Built | HMAC-SHA256-signed webhooks (`X-VaultysClaw-Signature: sha256=<hmac(timestamp + "." + rawBody)>`) to any endpoint; payloads pass explicit per-entity allow-list builders plus a recursive secret-key strip |
| Real-time alerting | 🟡 Partial | Notification Channels deliver per-event alerts through a self-hosted Apprise container. Event-driven, not anomaly-driven. |
| Distributed tracing across agents | ⬜ Absent | No correlation IDs across agent-to-agent calls |

:::tip Alert-integrity property worth naming
The audit row and the outbound alert are produced by the same `recordEvent()`
call from the same sanitised payload. They cannot describe different events, and
an alert cannot exist without a corresponding audit row.
:::

### Advanced — ⬜ Absent

ML-driven correlation, SIEM-side behavioural detection: not provided.

---

## 5. Behavioural monitoring & response

The weakest area other than output filtering — with one genuine strength.

### Foundation — 🟡 Partial

| Control | Status | Notes |
|---|---|---|
| **Shadow-AI discovery** | ✅ Built | The Go sensor observes host processes, classifies AI/agent workloads, and correlates them against the ledger: a workload whose identity evidence resolves to a known Actor is **managed**; one that does not, above a confidence threshold, is **shadow**. A sensor's own DID never counts as managing a workload it observed on itself. |
| Baseline behaviour definition | ⬜ Absent | No formal baseline is established or learned |
| Threshold-based alerting | ⬜ Absent | Nothing measures rates or volumes against a threshold |
| Incident response | 🟡 Partial | An admin can revoke any certificate immediately, and revocation is authoritative rather than advisory. The action is entirely manual. |

### Enterprise — ⬜ Absent

Automated baseline learning, statistical anomaly detection, automated containment,
context-aware analysis: none present.

### Advanced — ⬜ Absent

**Why this is the honest score:** VaultysClaw knows precisely *what an Actor is
allowed to do* and *what it was observed doing*, and it does not currently compare
the two over time. The data model is unusually well-suited to it — every action is
attributable to a DID and citable to a specific certificate — but no code performs
the comparison.

---

## 6. Input validation

### Foundation — 🟡 Partial

| Control | Status | Notes |
|---|---|---|
| Protocol message validation | ✅ Built | The WebSocket protocol is a small closed union of message types; unknown types are rejected rather than routed |
| Structural config validation | ✅ Built | `proxy` rule sets and `kindConfig` blobs are parsed by explicit validators that reject a malformed rule rather than dropping it silently |
| Deny-by-default routing | ✅ Built | An unauthenticated connection can reach only the register/auth handshake |
| **Schema-first validation across the admin surface** | 🟡 Partial | The rebuilt console is Server Actions over DAOs, not a typed contract layer. Validation is hand-written per action and is **not uniform** — the older webhook/channel/workspace/certificate actions check only for a session, while newer ones call `requireAdmin()`. This retrofit is in progress and is a real, known gap. |

:::danger Known gap: Server Action authorisation
Next.js dispatches a Server Action as a POST to its own generated endpoint
*without* re-running the layout of the route it is defined under. The admin
console's `admin_console_access` layout check therefore makes the console safe to
navigate but does not by itself make every action safe to invoke. Every mutating
admin action must begin with `requireAdmin()`. The Model Registry actions do; some
older actions do not yet.
:::

### Enterprise & Advanced — ⬜ Absent

Attack-payload pattern matching, sensitive-content filtering on input, spotlighting,
and constitutional classifiers are all absent.

---

## 7. Output filtering & leak prevention

### Foundation — ⬜ Absent · Enterprise — ⬜ Absent · Advanced — ⬜ Absent

**No partial credit. There is no output filtering in VaultysClaw.**

What exists is adjacent and should not be mistaken for it:

- **Secret handling on the platform's own outputs is careful.** A model's
  encrypted API key is omitted at the *query* level (a Prisma `select`, not a
  delete after the fact) so it cannot reach a page by accident. Webhook payloads
  pass explicit allow-list builders and then a recursive key blacklist. A webhook
  signing secret and an invitation link are revealed exactly once.
- **Capability gating limits what an agent can reach in the first place**, which
  reduces what there is to leak.

Neither of those inspects agent output. Nothing scans a result for PII,
credentials, or exfiltration patterns before it is returned or logged.

This is the single largest gap in the matrix and is tracked as such in the
[roadmap](/docs/zero-trust/roadmap).

---

## 8. Tool access & security

### Foundation — ✅ Built

| Control | Implementation | Status |
|---|---|---|
| Deny-by-default tool access | A capability an Actor does not hold authorises nothing | ✅ |
| Capability allow-list per Actor kind | Sensors can hold only `process_read`; agent kinds draw from the agent list | ✅ |
| Approval gate before grant | Every capability an Actor receives passed through an explicit admin approval | ✅ |
| Capability-gated behaviour proven at the client | ✅ | Verified end to end: the Go sensor logs `skipping poll cycle — process_read capability not yet granted` and reads no process at all until the certificate exchange completes |

That last row is the one worth dwelling on. It demonstrates the gate opening
exactly when — and not before — the control plane grants it, on a real client
binary rather than a mock.

### Enterprise — 🟡 Partial

| Control | Status | Notes |
|---|---|---|
| Certificate-based tool authentication | ✅ Built | An Actor's certificate is what authorises the action, and can be cited per action |
| Rate limiting on tool calls | ⬜ Absent | No per-Actor call budget or time-window limit |
| Tool-usage monitoring & alerts | ⬜ Absent | See domain 5 |

### Advanced — 🟡 Partial

Per-tool sandboxing arrived with the [harness supervisor](/docs/concepts/blast-radius#4-tool-calls--the-harness-supervisor):
tool calls are decided against the ledger on the host, and `sandbox: require`
backs that with OS confinement. Read the tier honestly, though — it is macOS-only,
opt-in, and observe-only by default.

Hardware isolation: not provided by the control plane.

---

## 9. Credential protection

### Foundation — ✅ Built

| Control | Implementation | Status |
|---|---|---|
| No credential embedding | Agents hold a private key, not a platform secret | ✅ |
| Encrypted secret storage | One vault primitive (VaultysId signcrypt-to-self) covers LiteLLM master keys, OIDC/Entra client secrets, and Apprise service URLs — one code path, not several | ✅ |
| Secrets never logged | Webhook payloads pass allow-list builders plus a recursive key strip; audit `details` reuse the same sanitised payload | ✅ |
| Reveal-once for generated secrets | Webhook signing secrets and invitation links are returned once and never re-displayed; only a hash is persisted for invitations | ✅ |
| Write-only secret fields | Apprise service URLs are never decrypted back into an edit form; blank means "keep existing" | ✅ |

A specific bug found and fixed rather than ported: the older implementation passed
the *encrypted* API key to the LLM proxy on update, registering a model that could
never authenticate upstream. The rebuild's sync function takes an explicitly named
plaintext parameter, and the update path decrypts before re-pushing.

### Enterprise — 🟡 Partial

| Control | Status | Notes |
|---|---|---|
| Confined decrypt capability | ✅ Built | Only the control-plane process holds the server VaultysId. The webhook dispatcher never needs `serviceUrls` back — Apprise stores what a key points at — so the decrypt capability never leaves one process. |
| Credential rotation policies | ⬜ Absent | No automatic rotation |
| External secrets manager integration | ⬜ Absent | Vault/AWS Secrets Manager not integrated |
| Per-agent credential isolation | ⬜ Absent | The LiteLLM virtual-key path that would mint per-workspace credentials is not built |

### Advanced — ⬜ Absent

HSM-backed key storage for the server identity: not provided.

---

## 10. Integrity & recovery

### Foundation — ✅ Built

| Control | Implementation | Status |
|---|---|---|
| Signed, independently verifiable grants | Both certificate formats are verifiable offline by any party, with no control-plane call | ✅ |
| Signed configuration push | A proxy's rule set is signed by the server identity at push time. The stored copy is deliberately left unsigned — a stored signature would need regenerating on every edit, and a stale one is indistinguishable from a tampered one. | ✅ |
| Ledger immutability for grants | Certificate rows are never mutated after issue except to flip status and fill revocation fields | ✅ |
| Rollback of a grant | Revoke, then re-issue. Both are ledger writes and both are audited. | ✅ |
| **Cross-language decision conformance** | The permission-resolution function exists twice — TypeScript in `packages/trust`, Go in the sensor's interception path. Both run the same committed vector set (`/conformance`: 25 permission cases plus grant and rule-set fixtures). A divergence between the two implementations is a release blocker. | ✅ |

### Enterprise — 🟡 Partial

| Control | Status | Notes |
|---|---|---|
| Configuration version control | 🟡 Partial | Certificates are append-only and therefore versioned by construction. Org `Setting` rows are ordinary mutable rows with no history. |
| Automated rollback on health-check failure | ⬜ Absent | |
| Immutable infrastructure updates | ⬜ Absent | Deployment-time concern |

### Advanced — ⬜ Absent

---

## 11. Agent memory protection

### ↩ Inherited

The rebuilt control plane has **no agent memory subsystem**. Agent memory is a
property of the agent runtime (the `openclaw` kind's own store), and this matrix
does not claim credit for it.

What the control plane does contribute:

- Memory contents never transit the control plane — there is no chat or channel
  surface for them to pass through, because that surface was removed.
- An agent's memory store is reachable only by that agent's own process; there is
  no cross-Actor read path in the platform at all.

Cryptographic integrity verification of stored memory, encrypted-at-rest memory,
and memory-poisoning detection: **absent** at every tier.

---

## 12. AI governance

### Foundation — ✅ Built

| Control | Implementation | Status |
|---|---|---|
| Shadow-AI visibility | Sensors classify unmanaged AI workloads on real hosts and correlate them against the ledger | ✅ |
| Model inventory | The Model Registry catalogues every LLM endpoint the org sanctions, with encrypted provider keys | ✅ |
| Policy enforcement is the same mechanism as identity | There is no separate governance engine to drift from the access model | ✅ |
| Governance events are auditable and exportable | `model.*`, `actor.*`, `certificate.*`, `workspace.*`, `human.*` events flow to the audit log and to webhooks/alerts from one call site | ✅ |
| Federated identity binds to the trust model | An SSO login that cannot be bound to a DID **never produces a session** — it produces a binding invitation instead. There is deliberately no "signed in but not yet anybody in the trust model" state. | ✅ |

### Enterprise — 🟡 Partial

| Control | Status | Notes |
|---|---|---|
| Policy versioning & approval audit | ✅ Built | Every grant records who approved it and what was actually granted — including when an admin approves a *reduced* set relative to what was requested |
| **Model-access enforcement** | ⬜ Absent | The registry records which workspaces may use which model and audits every change. **Nothing enforces it at inference time.** That needs the LiteLLM virtual-key path plus an LLM-config push to Actors, neither of which exists. The console states this limitation directly rather than implying a guarantee. |
| Trust-policy enforcement | 🟡 Partial | `trust.failMode` has exactly one consumer — the proxy interception point's fail-closed posture. `trust.stapleTtlSeconds` is persisted and deliberately **not** inherited by the proxy, because its strictest value (0, "always query live") would become the loosest behaviour for a decider that is offline by design. |
| Formal governance process | ⬜ Absent | Organisational, not technical |

### Advanced — ⬜ Absent

Continuous policy enforcement in a deployment pipeline, policy learning from
incident data: not provided.

---

## Regulatory alignment

Stated as coverage, not certification. VaultysClaw holds no attestations.

| Framework | What VaultysClaw contributes | What it does not |
|---|---|---|
| **SOC 2** | Attributed audit trail, signed access grants, approval workflow, encrypted secret storage | Tamper-evident log storage, real-time alerting on anomalies |
| **NIST SP 800-207** | Per-request identity verification, policy decision point separate from enforcement points, continuous status checking | Continuous behavioural evaluation, device-health signals in the decision |
| **ISO/IEC 42001 (AI management)** | AI system inventory, shadow-AI discovery, change audit, defined approval authority | Impact assessment workflow, model performance monitoring |
| **EU AI Act (Art. 12, logging)** | Automatically recorded, attributable event log over the lifecycle | Retention guarantees, log integrity protection |
| **GDPR** | Data minimisation in payloads, no agent traffic through third-party servers | Right-to-erasure automation, DPA tooling |
| **HIPAA** | TLS in transit, attributed access records | Encryption at rest, breach-notification automation |

---

## Keeping this page true

This matrix is maintained alongside the code, not refreshed occasionally. When a
control changes state, the same change updates this page. Concretely:

- Moving a row from **Design** to **Built** requires an end-to-end exercise
  against real infrastructure, not a passing type-check.
- Moving a row to **Built** on the strength of something *recorded* rather than
  *enforced* is not permitted — see the model-access row in domain 12 for the
  standard.
- A domain that regresses gets its row lowered in the same change that causes the
  regression.

Next: **[Gaps and roadmap](/docs/zero-trust/roadmap)**.
