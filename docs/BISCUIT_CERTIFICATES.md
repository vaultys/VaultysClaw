# Biscuit Capability Certificates, Bound to VaultysId — Design

**Status:** Draft, not implemented. **Decision:** every capability grant becomes a
[Biscuit](https://www.biscuitsec.org/) token wrapped in VaultysId signatures, and the existing
`packcert` and `challenger` grant formats are deprecated. Gated on the Phase 0 spike (§16): nothing is
deprecated before its go/no-go.

Supersedes the grant *formats* of [`CERTIFICATE_WEB_OF_TRUST.md`](CERTIFICATE_WEB_OF_TRUST.md)
§3.2–§3.3, and designs the delegation certificate ("cert B") that the schema reserves and that
[`Délégation agentique dans VaultysClaw.md`](../Délégation%20agentique%20dans%20VaultysClaw.md)
analyses. The rest of the trust doc — the ledger, status protocol, stapling, trust policy — stands.

## 1. Summary

A capability certificate is a **Biscuit token wrapped in a chain of VaultysId-signed envelopes**,
used together with a **fresh VaultysId proof of possession**:

- **Biscuit** says *what* is allowed: capabilities, resources, expiry, delegation depth, and every
  narrowing applied since. Evaluated by the Rust reference implementation, `biscuit-auth`.
- **Envelopes** say *who* holds it. The control plane signs issuance; every holder countersigns
  receipt; every delegator signs the hop. Signed with `signCert`, so any VaultysId type works,
  hybrid Dilithium and FIDO2 included.
- **The presentation proof** says *who is using it now*. On an authenticated WebSocket it is the
  Challenger session itself; elsewhere a signature by the holder over the request.

Standing grants, short-lived scoped grants, the bootstrap admin grant, the human
`admin_console_access` grant and agent-to-agent delegations all share this one format.

## 2. Scope

| Becomes Biscuit | Stays as it is | Why it stays |
|---|---|---|
| Every `CapabilityCertificate` grant: admin-issued (trust doc §3.2a), interactively issued (§3.2b), scoped/JIT (§3.6), bootstrap admin, `admin_console_access` | **The ledger** — rows, the four-value `CertificateStatus`, revocation, `supersededByCertId` | Biscuit is a token format, with no store, no status and no audit trail |
| Delegation hops (cert B) | **`cert_status_response` / stapling** (`packages/policy/src/certs/cert-status.ts`) | A control-plane attestation that a grant is still live — an input to Biscuit evaluation, not a permission |
| | **The Challenger `auth` handshake** | It is how an Actor proves who it is, and it is the proof of possession on WebSocket |
| | **Signed rule sets, `kindConfig`** (`rules-fixture.json`, `kindconfig-fixture.json`) | Configuration, not permissions |
| | **Kill switches** (`lib/kill-switch.ts`), **trust policy** (`lib/trust-policy.ts`) | Computed at decision time and fed to Biscuit as facts |

Unchanged invariants from the root `CLAUDE.md`: `CertificateStatus` keeps four values (a suspended
or upstream-revoked grant is reported `revoked`); humans are exempt from kill switches;
`packages/policy` and `packages/trust` stay pure; no `conformance/` fixture changes on one side
only.

## 3. Why Biscuit, and why wrapped

Biscuit gives, already specified and audited:

- **Attenuation that can only narrow.** Any holder can append a block. In datalog v3 scoping a
  block's checks see only the authority block, the authorizer and itself, so facts added later can
  never satisfy an earlier check. No hand-written `isAttenuationOf` to prove correct.
- **Offline verification** against one public key.
- **Per-block revocation identifiers**: revoking a block invalidates every token derived from it.
- **A datalog policy language** for constraints `CertScope` cannot express (time windows, depth,
  re-delegable subsets, per-capability resource prefixes) — without inventing the DSL the trust doc
  §10 ruled out.

Used bare, Biscuit has three problems here. The VaultysId wrapper answers each:

| Bare Biscuit | Wrapped |
|---|---|
| **A bearer token.** Whoever holds the bytes can use them, and can append blocks — so a "bound to DID X" fact in a later block is worthless: a thief appends their own. | Every hop is signed by the previous holder's VaultysId; every use by the current holder's. A thief has the bytes, not the key. |
| **Raw Ed25519 / P-256 keys only.** VaultysId's `signChallenge` signs `sha256(INCIPIT ‖ data)` by design, FIDO2 identities produce WebAuthn assertions, `dilithium_ed25519` identities would lose their post-quantum half. | No VaultysId key ever signs a Biscuit block. Envelopes and proofs use `signCert` unchanged, for every VaultysId type. |
| **Classical signatures only.** | Envelopes and proofs carry each Actor's own VaultysId signature, hybrid Dilithium included. A forged Biscuit without a valid envelope chain is rejected (§7). |

**Hard rule:** a verifier never evaluates a Biscuit whose envelope chain it has not verified.
`packages/policy` and `sdk-go` expose no API that does — the raw `biscuit-auth` binding is internal.
This is what makes the classical Biscuit signature acceptable: it is defence in depth, never the
only check.

## 4. One Biscuit engine, in Rust

| Side | How it runs `biscuit-auth` |
|---|---|
| **TS** — control plane, `packages/sdk`, browser console | `@biscuit-auth/biscuit-wasm` (biscuit-auth 6 compiled to WASM). If the Node build still needs `--experimental-wasm-modules`, the control-plane server uses a napi-rs build of the same crate instead; the browser stays on WASM. |
| **Go** — `sdk-go`, sensor, proxy | `biscuit-auth` compiled to `wasm32-wasip1`, run in-process with [wazero](https://wazero.io) (pure Go). Neither `sdk-go` nor the sensor uses cgo today, and the sensor ships for darwin, linux and windows; this keeps it that way. cgo against a Rust static library is the fallback only if the spike shows wazero too slow for the proxy. |

`biscuit-go` is not used: it supports datalog v3.0 only (`MaxSchemaVersion = 3`, v2.2.2), with no
third-party blocks and no P-256.

**What stays implemented twice, in TS and Go:** the envelope chain, the presentation proof, the
verification order (§7) and the fact injection. That is VaultysClaw's own logic, and it is what the
conformance fixtures cross-check. Biscuit semantics have a single implementation — the reference
one, with the Biscuit project's own test samples behind it. The Rust crate version is pinned
identically on both sides, and the fixture records it.

## 5. Wire format

### 5.1 The container

```ts
// packages/policy/src/certs/biscuit-cert.ts (proposed)
interface VaultysBiscuit {
  v: 1;
  biscuit: Uint8Array;      // serialized Biscuit (protobuf), unmodified
  envelopes: string[];      // packcert tokens: [issue, delegation₁, delegation₂, …]
}
// on the wire: base64url(msgpack(VaultysBiscuit)), optional "vbiscuit:" prefix
```

Invariant: `envelopes.length === blockCount`; envelope *i* covers block *i*.

### 5.2 What envelopes sign, and how signers are identified

An envelope names its block by the block's **signature bytes**, never by the serialized token:

- they are unique, they already chain (each covers the previous block's signature), and they are
  byte-identical across implementations, where re-serialization might not be;
- they **are** Biscuit's revocation identifier for the block, so the ledger, the envelope and the
  engine all refer to the same bytes.

A `did:vaultys:` is `type ‖ SHA224(id)` truncated, so a signature cannot be checked from the DID
alone. Every signer's full public VaultysId `id` travels in the envelope; the verifier rebuilds
`VaultysId.fromId(id)`, checks `.did` matches, then calls `openCert`.

### 5.3 Issue envelope (block 0)

Signed by the control plane, then countersigned by the holder. The control plane's part:

```ts
interface BiscuitIssueBody {
  type: "biscuit_issue";
  v: 1;
  certId: string;           // the CapabilityCertificate row
  rootKeyId: number;        // which Biscuit root key signed block 0 (§10.1)
  blockSig: Uint8Array;     // signature of Biscuit block 0
  holderDid: string;
  holderId: Uint8Array;     // holder's public VaultysId id
  workspaceId: string | null;
  issuedBy: string;         // admin DID, "self:<did>" for an approved request, or "system:bootstrap"
  requestedCapabilities?: string[]; // what was asked, when it differs from what was granted
  issuedAt: number;
  expiresAt: number | null; // null only for the documented indefinite exceptions (trust doc §3.3)
}
// signCert(controlPlaneVid, body) — verified against the pinned anchor (sdk-go/grant/anchor.go)
```

The holder's acceptance, which is what `envelopes[0]` actually stores:

```ts
interface BiscuitAcceptBody {
  type: "biscuit_accept";
  v: 1;
  envelope: string;         // the signed issue (or delegation) packcert, verbatim
}
// signCert(holderVid, body)
```

**Acceptance is mandatory for every grant.** This unifies the two issuance paths of trust doc §3.2:

- **§3.2b, live counterpart:** acceptance is collected in the existing `service: "certificate"`
  exchange — the same moment the Challenger certificate is co-signed today. The live, mutual
  presence guarantee survives.
- **§3.2a, no live counterpart** (an admin approving while the Actor is offline): the row is
  created `approved` with `deliveredAt: null`, exactly as today, and the token is completed and
  delivered when the Actor next authenticates. An unaccepted token is not a certificate and
  verifies nowhere.
- **Bootstrap admin:** the first human countersigns over the login channel
  (`lib/user-login-channel.ts`) that co-signs `admin_console_access` today.

`issuedBy` and `requestedCapabilities` keep the audit signal the embedded `requestCert` gives today
("nobody outside asked for this" versus "granted as requested" versus "granted, modified").

### 5.4 Delegation envelope (blocks 1…n)

```ts
interface BiscuitDelegationBody {
  type: "biscuit_delegation";
  v: 1;
  blockIndex: number;
  blockSig: Uint8Array;         // signature of the block this hop appended
  prevEnvelopeHash: Uint8Array; // sha256 of envelopes[blockIndex - 1]
  fromDid: string;              // must equal the previous envelope's holder
  toDid: string;
  toId: Uint8Array;
  issuedAt: number;
  expiresAt: number;            // ≤ the previous envelope's expiresAt
  nonce: Uint8Array;
}
// signCert(fromVid, body), then wrapped in a biscuit_accept signed by toDid
```

A delegation envelope says nothing about which rights moved — that is the block's job. It only
attributes the block. The Challenger certificate format is not used for envelopes: signed metadata
in a Challenger certificate cannot be verified from Go (`sdk-go/grant/grant.go`).

### 5.5 Presentation proof

```ts
interface BiscuitPresentationBody {
  type: "biscuit_presentation";
  v: 1;
  lastBlockSig: Uint8Array; // binds the proof to this exact token at this exact length
  holderDid: string;
  audience: string;         // verifier DID or origin
  nonce: Uint8Array;        // verifier-issued when interactive; else random + replay cache
  issuedAt: number;         // rejected outside ±maxSkew (default 30 s)
  requestHash?: Uint8Array; // sha256 of the canonical request, when there is one
}
// signCert(holderVid, body)
```

On a WebSocket authenticated by a Challenger `auth` exchange for `holderDid`, the session is the
proof and no presentation body is sent. Everywhere else — HTTP through the proxy, a peer data
channel, a third-party verifier — it is mandatory.

## 6. Datalog vocabulary

The full engine is available on both sides (§4), but tokens are minted from a **documented,
versioned subset** so behaviour stays reviewable. The minting code emits nothing outside it; the
fixture (§14) pins it.

### 6.1 Authority block (minted by the control plane)

```datalog
cert("cert_8f2…");
right("acme:invoice.read");
right("acme:payment.execute");
resource_prefix("acme:invoice.read", "sharepoint://factures/2026-10/");
unrestricted("acme:payment.execute");
redelegable("acme:invoice.read");
purpose("month-end-close");
max_uses(500);

check if time($t), $t <= 2026-11-07T00:00:00Z;
check if depth($d), $d <= 1;
check if operation($op), right($op), live_capability($op);
check if operation($op), unrestricted($op)
      or operation($op), resource($r), resource_prefix($op, $p), $r.starts_with($p);
check if depth(0) or operation($op), redelegable($op);
```

Mapping from today's fields:

| Today | Biscuit |
|---|---|
| `capabilities` | `right` facts |
| `CertScope.resource` | `resource_exact($op, $r)` + an equality check |
| `CertScope.resourcePattern` | `resource_prefix` + `starts_with` |
| No scope | `unrestricted($op)` |
| `CertScope.maxUses` | `max_uses($n)`, enforced statefully (§6.4) |
| `CertScope.purpose` | `purpose($p)`, audit only |
| `expiresAt` | time check; absent for indefinite grants |
| `non_delegatable` | `check if depth(0)` and no `redelegable` facts |
| `resourceLimits` | `limit($name, $value)` facts, read by the enforcer that applies them (`PolicyEnforcer`) |

### 6.2 Attenuation block (appended by a holder or delegator)

```datalog
check if time($t), $t <= 2026-11-04T18:00:00Z;
check if operation("acme:invoice.read");
check if resource($r), $r.starts_with("sharepoint://factures/2026-10/supplier-x/");
```

Only checks. A block that adds facts gains nothing; they are visible to that block alone.

### 6.3 Facts the verifier injects

Injected only after §7 steps 1–5 succeed:

| Fact | Source |
|---|---|
| `time($now)` | verifier clock |
| `operation($cap)`, `resource($r)` | the action being authorized |
| `holder($did)` | the last envelope's holder, proven by the presentation proof |
| `depth($n)` | `envelopes.length - 1` |
| `live_capability($cap)` | built-ins + the live custom-capability registry — so a registry deletion still fails closed, as `handleCertStatusRequest` does today |

Authorizer policy: `allow if operation($op), right($op);` and default deny.

### 6.4 What Biscuit cannot express

`maxUses` is state. The enforcement point counts uses keyed by the last block's revocation id, and
the control plane counts for itself; neither trusts the other's counter.

## 7. Verification order

1. **Decode** the container; reject unless `envelopes.length === blockCount`.
2. **Biscuit signatures**, against the root public key named by `rootKeyId`.
3. **Issue envelope:** a `biscuit_accept` by `holderDid` wrapping a `biscuit_issue` signed by the
   pinned control-plane anchor, whose `blockSig` equals block 0's signature.
4. **Delegation envelopes**, for each *i ≥ 1*:
   - a `biscuit_accept` by `toDid` wrapping a delegation signed by the previous holder;
   - `blockSig` equals block *i*'s signature;
   - `prevEnvelopeHash` links to envelope *i − 1*;
   - every `id` hashes to its DID;
   - every `expiresAt` is ≤ its predecessor's and > now.
5. **Presentation proof** from the last holder: signature, `lastBlockSig`, `audience` is this
   verifier, `issuedAt` within skew, nonce unseen.
6. **Status.** Any failure here reports `revoked`, never a fifth status:
   - the grant's `certId`, via the stapled or live `cert_status_response`, as today;
   - every hop's revocation id, against the delegation revocation set (§8);
   - kill switch: suspended if any **non-human** DID in the chain is covered. Humans stay exempt,
     and a human-rooted chain ending at an agent is suspended with that agent.
7. **Authorize** with the facts of §6.3.

Steps 3–5 reject theft before any datalog runs. The order is fixed so every failure maps to one
error code (§12).

## 8. Revocation and status

- **Revoking a grant** is the ledger write it is today. Step 6 checks `certId`, so every token
  minted from it and every hop delegated from it dies with it.
- **Revoking one hop** revokes that hop's revocation id: that hop and everything below it die; the
  delegator keeps working.
- **Partial revocation** means issuing a narrower grant or hop, then revoking the wider one.

Offline verifiers learn about revoked hops from:

- **a holder-stapled `delegation_status_response`**, signed by the control plane over the status of
  each revocation id in the chain as of `checkedAt`, with the same `maxAgeMs` semantics as
  `cert_status_response`;
- **for enforcement kinds** (`proxy`, `harness`), the revoked-id set in `actor_config`, bounded by
  their own `maxStatusAgeSeconds`, exactly as certificate status is today.

## 9. Ledger

`CapabilityCertificate` keeps its shape and its four statuses:

| Column | Under Biscuit |
|---|---|
| `certFormat` | `"biscuit"` for grants, `"delegation"` for hops. `"packcert"` and `"challenger"` are legacy (§15). |
| `certificate` | the `VaultysBiscuit` container |
| `requestCertificate` | `null` — the request is folded into the issue envelope |
| `capabilities`, `scope`, `resourceLimits` | a **derived index** of block 0 plus any attenuation, written at issuance (§11) |
| `delegatedByDid`, `parentCertId`, `parentCertHash` | set on `"delegation"` rows; `parentCertHash = prevEnvelopeHash` |
| **new** `revocationId String? @unique` | block 0's signature for a grant, the hop's block signature for a delegation |
| **new** `indexExact Boolean` | whether the index fully describes the token (§11) |

Rows still never mutate after `active`, except for the status fields.

## 10. Control plane

### 10.1 Root key

- A dedicated Ed25519 Biscuit root key, separate from the control plane's VaultysId. Biscuit needs
  a raw signature, and `signChallenge` must not be bent to produce one.
- Stored encrypted via `lib/vault.ts`; `rootKeyId` allows rotation.
- Public keys reach Actors in `actor_config`, alongside the pinned anchor.

Forging a certificate takes both this key and the control-plane VaultysId (§5.3).

### 10.2 Issuance and delivery

`lib/certificates.ts` keeps its entry points — `issueCapabilityGrant`, `issueAdminGrant`,
`ensureBootstrapAdmin` — and their callers. What changes is what they produce:

1. build block 0 (§6.1);
2. sign the issue envelope;
3. collect the holder's acceptance, in the live certificate exchange or at next authentication;
4. persist the row.

`persistChallengerCertificate` is retired with the legacy formats.

`actor_config.grantToken` (`lib/protocol.ts`) carries the container instead of a packcert. That
lets `actor-config.ts`'s "verifiable format" rule (`VERIFIABLE_CERT_FORMAT`) collapse: every
current grant is verifiable offline, which today only `packcert` rows are.

### 10.3 Delegation

`delegation_register { container }` runs §7 steps 1–4 and writes a `"delegation"` row. An
unregistered hop is honoured offline only within a short ceiling (proposed: 15 minutes past
`issuedAt`, a `trust-policy.ts` setting). Past that, verifiers require registration evidence, so
the control plane always sees the subtree it may have to revoke.

### 10.4 Events

`certificate.issued` and `certificate.revoked` keep their names. Their payloads gain `certFormat:
"biscuit"` and `revocationId`. `delegation.registered`, `delegation.revoked` and
`delegation.violation` are new. All of them follow the six-step checklist in the root `CLAUDE.md`.

## 11. `packages/trust` and the console

The console never presents tokens: `hasCapability` (`lib/access-control.ts`) reads the ledger.
Running WASM on every page load would be wasteful, so:

- `resolvePermission` keeps evaluating the **derived index** — the `capabilities`/`scope` columns
  written at issuance from block 0.
- A new **equivalence suite** asserts, for every case in `conformance/permission-vectors.json`, that
  `resolvePermission(index)` and Biscuit authorization of the token give the same decision. The
  index can never drift from the token without a red test.
- A token whose constraints the index cannot express (anything outside the §6.1 mapping) is minted
  with `indexExact: false`. `hasCapability` treats such rows as granting nothing, so console access
  fails closed rather than over-approximating.

Off the console, `resolvePermission`'s role shrinks to the set layer: "allow if any active grant
passes Biscuit authorization", with the granting `certId` reported as today. `sdk-go/authz` follows
the same shape over the wazero engine.

## 12. Error codes

Shared by the WS protocol, `packages/sdk` and `sdk-go`. Each maps to one §7 step.

| Code | Step |
|---|---|
| `cert_malformed` | 1 |
| `cert_signature_invalid` | 2 |
| `cert_chain_invalid` | 3–4 — `cert_envelope_missing` when the cause is a block with no envelope |
| `holder_proof_invalid` | 5 — `holder_proof_replayed` when the cause is a reused nonce |
| `cert_revoked` | 6 |
| `delegation_revoked_upstream` | 6 |
| `delegation_unregistered` | 6 |
| `suspended` | 6 |
| `delegation_depth_exceeded` | 7 |
| `redelegation_forbidden` | 7 |
| `attenuation_violation` | 7 |
| `capability_denied` | 7 |

## 13. Threat model

| Attack | Outcome |
|---|---|
| Copy a container from a log, disk or network | Rejected at step 5: no holder key |
| Copy a container and a presentation proof | Rejected: wrong audience, stale `issuedAt`, or replayed nonce |
| Thief appends a block naming themselves | Rejected at step 4: no envelope signed by the current holder |
| Holder or delegator tries to widen rights | Impossible: later facts never satisfy earlier checks |
| Delegator extends expiry | Rejected at step 4 (monotonic `expiresAt`) and step 7 (every block's time checks) |
| Biscuit root key leaked | A forged block 0 has no issue envelope from the control-plane VaultysId: rejected at step 3. Rotate `rootKeyId`. |
| Control-plane VaultysId leaked | Same blast radius as today; the Biscuit root key does not add to it |
| Holder's VaultysId key leaked | Same window as today: revoke; bounded by staple age |
| Quantum adversary forges Ed25519 | Biscuit signatures fall; hybrid envelopes and proofs do not, so the chain is still rejected — **only** because of the §3 hard rule |
| Control plane unreachable | `trust-policy.ts` fail mode applies unchanged; offline delegation capped by the registration ceiling |

## 14. Conformance

| Fixture | Change |
|---|---|
| `capability-names.json` | Unchanged |
| `rules-fixture.json`, `kindconfig-fixture.json` | Unchanged |
| `permission-vectors.json` | Kept. Now also drives the index ↔ Biscuit equivalence suite (§11). |
| `grant-fixture.json` | Replaced, at the end of migration, by `biscuit-cert-fixture.json` |
| **new** `biscuit-cert-fixture.json` | TS-signed, verified by Go. Generated by `conformance/generate-biscuit-cert-fixture.ts`. |

`biscuit-cert-fixture.json` contains:

- a live-issued grant and an offline-approved grant;
- a three-hop delegation chain (control plane → human → agent → sub-agent) with presentation
  proofs;
- one negative case per §12 code;
- Ed25519, `dilithium_ed25519` and FIDO2 signers;
- the pinned `biscuit-auth` version.

As with every fixture, never regenerate it without re-running both suites.

## 15. Migration and deprecation

The control plane has **no proactive renewal scan today** (`isEligibleForProactiveRenewal` in
`packages/trust` has no caller), so migration cannot ride on renewals. It needs its own job.

1. **Dual read.** `packages/policy`, `packages/sdk`, `sdk-go`, the sensor and the proxy accept
   both legacy grants and Biscuit certificates. Ship and deploy this first, because enforcement
   points must understand the new format before anything is issued in it.
2. **Biscuit-only issuance.** The control plane issues `"biscuit"` rows only. Legacy rows remain
   valid until migrated.
3. **Re-issuance job.** For each active `packcert`/`challenger` row:
   - prepare a `"biscuit"` row with the same capabilities, scope, limits and expiry;
   - deliver it at the holder's next authentication, where it is accepted;
   - then supersede the legacy row (`supersededByCertId`).

   This covers indefinite grants, the bootstrap admin included. The console shows the count of
   remaining legacy rows per workspace.
4. **Cutoff.** Once no active legacy row remains (or an admin-set date passes and the stragglers are
   revoked):
   - remove the legacy verifiers;
   - remove `capability-grant.ts`, `persistChallengerCertificate`, the `sdk-go/grant` packcert path
     and `grant-fixture.json`;
   - remove the `VERIFIABLE_CERT_FORMAT` branch.

   `delegation.ts`, `peer-grant.ts` and `intent.ts` have no consumer today
   (`packages/policy/CLAUDE.md`) and go at the same time.

An Actor that never reconnects keeps its legacy grant until the cutoff, then loses it. That is the
intended fail-closed outcome.

## 16. Plan

### Phase 0 — spike, ~2–3 weeks, go/no-go

Prove, on a throwaway branch:

1. **Issuance and delegation round trip.** A live grant with acceptance, plus an A→B delegation:
   minted in TS through `biscuit-auth` WASM, verified in Go through wazero, envelopes through
   `sdk-go`.
2. **Rejections.** All of these are refused:
   - a stolen container with no proof;
   - a block with no envelope;
   - a replayed nonce;
   - a revoked parent hop.
3. **Runtimes.** The engine runs in the control plane's Node server (WASM or napi-rs) and in the
   browser.
4. **Key types.** FIDO2 and `dilithium_ed25519` VaultysIds can sign envelopes that Go verifies.
5. **Performance:**
   - wazero cold start;
   - per-request authorization time in the proxy;
   - sensor binary size;
   - minting rate at simulator scale (`pnpm simulator:demo`, 7,000 Actors).
6. **Index equivalence.** The §11 suite passes over `permission-vectors.json`.

**Stop if** 3, 4 or 6 fails, or if wazero is too slow and cgo is unacceptable for the sensor.

### Phase 1 — pure core

- `packages/policy/src/certs/biscuit-cert.ts`: container, the four envelope types, the presentation
  proof, the §6 vocabulary builder and index derivation, `verifyBiscuitCert`. The raw engine is not
  exported.
- The Go counterpart in `sdk-go` (`biscuitcert`), wrapping the wazero engine.
- `biscuit-cert-fixture.json`, the equivalence suite, the §12 codes.

### Phase 2 — dual read everywhere (§15 step 1)

`packages/sdk`, `sdk-go`, sensor, proxy, harness. Plus the control plane's own inbound checks and
`cert-inspect.ts`, so the certificate detail page can render both formats.

### Phase 3 — control plane issues Biscuit (§15 steps 2–3)

- Root key, `rootKeyId`, distribution through `actor_config`.
- The new issuance pipeline behind `issueCapabilityGrant` / `issueAdminGrant` /
  `ensureBootstrapAdmin`, and acceptance in the certificate exchange and the login channel.
- The schema migration (`revocationId`, `indexExact`).
- `delegation_register`, `delegation_status_response`, the revoked-id set for enforcement kinds,
  the offline ceiling.
- Kill-switch evaluation over chains.
- The §10.4 events.
- The re-issuance job and the legacy-count view.

### Phase 4 — cutoff (§15 step 4)

Remove the legacy formats, verifiers and fixtures. Update `CERTIFICATE_WEB_OF_TRUST.md` §3.2–§3.3,
`packages/policy/CLAUDE.md`, `packages/trust/CLAUDE.md`, the root `CLAUDE.md` and `sdk-go/README.md`.

### Phase 5 — built on top

- Approval prompts (`ask`) with a signed approval receipt, possibly a third-party block signed by
  the approver's dedicated key — R13 in the delegation note.
- Signed decision records referencing revocation ids (R12).
- RFC 8693 token exchange from a container to a short-lived, DPoP-bound JWT for third-party APIs.

## 17. Open questions

- **Post-quantum.** Is "hybrid envelopes + the §3 hard rule" sufficient for the ECW demonstrator,
  or does it need a post-quantum Biscuit algorithm before the cutoff?
- **Acceptance for offline approvals.** Mandatory acceptance means an approved grant does nothing
  until the Actor next connects — today's §3.2b behaviour, made universal. Is any flow relying on a
  §3.2a grant being usable before then?
- **Sealing.** Should a token with `depth` exhausted be sealed? It costs the holder the ability to
  hand a narrower single-use token to a tool.
- **Offline delegation ceiling.** The 15-minute default is a proposal, not a measured number.
- **Cutoff policy.** Should there be a hard date, or should the cutoff wait for zero legacy rows?
