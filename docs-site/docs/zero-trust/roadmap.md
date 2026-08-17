---
sidebar_position: 3
title: Gaps and roadmap
description: What is missing from VaultysClaw's Zero Trust posture, ranked by impact, and the order in which it is being closed.
---

# Gaps and roadmap

The [matrix](/docs/zero-trust/matrix) states the current position. This page states
what is being done about it, ranked by how much the gap actually matters rather
than by how easy it is to close.

## The two blocking gaps

### 1. Output filtering — domain 7, zero at every tier

Nothing inspects what an agent returns. Capability gating limits what an agent can
reach, which reduces exposure, but an agent that legitimately holds `file_access`
to a directory containing credentials will return those credentials without
comment.

**Planned approach, in order:**

1. Pattern-based secret and PII detection applied at the control plane's ingress
   for any Actor-produced content it stores or forwards.
2. A filtering-event record in the audit log — a redaction that leaves no trace is
   not an auditable control.
3. Human-in-the-loop approval for content matching high-risk patterns, reusing the
   existing approval surface rather than inventing a second one.

Semantic and classifier-based filtering is explicitly *not* in the near-term plan.
Pattern matching that ships beats a classifier that does not.

### 2. Server Action authorisation retrofit — domain 6

A real, known correctness gap rather than a missing feature. Next.js dispatches a
Server Action without re-running the layout of its route, so the admin console's
capability gate protects navigation but not invocation. Newer actions call
`requireAdmin()`; several older webhook, notification-channel, workspace, and
certificate actions still only check that a session exists.

This is being retrofitted action by action. Until it is finished, treat
`portal_access` as "can reach the application", not "cannot reach admin
mutations".

## Enterprise-tier work

Ordered by dependency, not by wish.

| Work | Closes | Depends on |
|---|---|---|
| **Behavioural baselines and threshold alerting** | Domain 5 Foundation/Enterprise | Nothing — the audit log already holds the data |
| **Rate limiting on capability-gated actions** | Domain 8 Enterprise | Same |
| **Tamper-evident audit storage** (hash chaining or append-only storage) | Domain 4 Enterprise | Nothing |
| **Per-workspace trust policy overrides** (`certFailMode`, `certStapleTtlSeconds`) | Domain 3 Enterprise | Schema columns not yet added |
| **Model-access enforcement** at inference time | Domain 12 Enterprise | LiteLLM virtual-key minting plus an LLM-config push to Actors |
| **Credential rotation and external secrets managers** | Domain 9 Enterprise | Nothing structural |
| **Distributed tracing across agent-to-agent calls** | Domain 4 Enterprise | Correlation IDs on the intent envelope |

## Designed, awaiting implementation

These have committed designs and, in most cases, landed schema or type support.
They are not speculative, but nothing produces or consumes them yet.

### Delegation chains

The mechanism by which a device — or any Actor — acts in the name of its owner.
Certificate B delegates a subset of certificate A's capabilities, references A by
id *and* by a hash of A's bytes recorded at delegation time, and is signed by both
the delegator and the delegate — deliberately **without** a control-plane
signature, unlike every certificate format in use today.

Verification order, when built:

1. Both actors' signatures over B verify.
2. `parentCertHash` matches the live bytes of A.
3. A is active, non-revoked, non-expired, and does not carry `non_delegatable`.
4. Every capability in B is present in A.
5. Recurse if A is itself a delegation certificate, terminating at a root
   certificate co-signed by the control plane.

Live today: `non_delegatable`, and the ownership relation (`Actor.ownerDid`) that
records who a device belongs to — descriptive only, not consulted by permission
resolution.

### REST API on VaultysId

There is currently **no REST API surface at all** in the rebuilt control plane —
the admin console is Server Actions over DAOs. Rather than porting the old
package's hashed bearer-token API keys, the design replaces them: a service DID
holding an `api_call` certificate scoped by `CertScope.resourcePattern`,
authenticated per request with a signature over
`method + path + bodyHash + timestamp + nonce`.

A leaked bearer token works for whoever holds it. A signature scheme does not.
This needs a REST surface to scope against before it means anything.

### Interception point, tier 2 and beyond

The `proxy` role sees only the CONNECT line's host and port today — no
decryption, no CA in the host trust store, works against certificate-pinned
clients. Tier 2 (request-body-aware adapters for generic HTTP, MCP, and LLM
traffic) requires installing a CA and is deliberately gated behind that being a
loud, explicit decision, since it is precisely an adversary-in-the-middle
signature.

Also outstanding for this role: `system` and `transparent` interception modes,
rule subjects with lazy attribution, the workload governance state machine, and
trust-on-first-use anchor pinning.

## Explicitly not planned

Stating these keeps the roadmap honest about its shape.

- **A general-purpose policy DSL.** `CertScope` stays a small structured field
  (resource, pattern, uses, purpose), not an expression language. If real usage
  demands boolean logic over attributes, that is a follow-up design, not an
  extension bolted onto the decision function.
- **Hardware isolation per agent.** A deployment concern, orthogonal to the
  ledger.
- **Private-key compromise ceremonies.** A leaked key stays usable until revoked
  *and* a verifier checks. VaultysClaw makes that check cheap and meaningful; it
  does not prevent misuse in the window before revocation.
- **Returning workflow orchestration or chat.** See
  [what was removed](/docs/reference/removed-surface).

## How this page changes

A roadmap item moves to the [matrix](/docs/zero-trust/matrix) only when it has
been exercised end to end against real infrastructure. Items do not graduate on
the strength of a passing type-check, and they do not graduate when the control is
*recorded* rather than *enforced*.
