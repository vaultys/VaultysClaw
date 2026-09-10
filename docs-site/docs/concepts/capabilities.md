---
sidebar_position: 3
title: Capabilities & scope
description: The capability vocabulary, per-kind allow-lists, and how CertScope turns a capability into an attribute-scoped, just-in-time grant.
---

# Capabilities & scope

A **capability** is the verb. A **scope** narrows it to an object. Together they
are how VaultysClaw expresses attribute-based access control without a second
policy engine or an expression language.

## The vocabulary

One vocabulary covers agent permissions and interface access alike, deliberately,
so that the same ledger and the same resolution function gate *"can this agent
read this file"* and *"can this human open the admin console"* — with no separate
role system to keep in sync.

It comes in two halves: a closed list of **built-ins**, below, and an
admin-defined registry of [**custom** `vendor:action` names](#custom-capabilities).
Both travel through identical machinery.

### Agent capabilities

| Capability | Grants |
|---|---|
| `file_read` | Reading files |
| `file_write` | Writing files |
| `internet_access` | Outbound network egress — the one an interception point enforces |
| `browser_control` | Driving a browser |
| `api_call` | Calling external APIs |
| `mail_send` | Sending mail |
| `code_execution` | Executing code |
| `system_command` | Running system commands |
| `agent_communication` | Talking to other Actors |
| `knowledge_search` | Querying knowledge sources |

:::note `file_access` is withdrawn, not removed
`file_access` — one capability covering both reading and writing — is **no longer
offered for new grants**. It is still a legal name and still resolves for
certificates already carrying it, because retroactively invalidating issued
certificates would be a silent revocation.

The withdrawal is done by leaving it out of the allow-list every issuance path
filters against, which is what makes it unselectable everywhere at once rather
than in each form separately. The reason for the split is the harness supervisor:
a capability with no verb cannot express "may read this file but not write it",
which is the distinction tool-call governance is made of.
:::

### Interface capabilities

| Capability | Grants |
|---|---|
| `admin_console_access` | The admin console |
| `portal_access` | The [Access Portal](/docs/architecture/control-plane#access-portal) |

These are not a special class. They are checked by the same
`hasCapability(did, capability)` call, resolving over the same certificates.

### Sensor capability

| Capability | Grants |
|---|---|
| `process_read` | Reading local process information at all |

The Go sensor checks this at the top of every poll cycle and reads nothing
whatsoever until the certificate arrives. This has been verified against a real
binary: it logs `skipping poll cycle — process_read capability not yet granted`,
touches no process, and begins polling in the same second the exchange completes.

### Delegation markers

| Capability | Meaning |
|---|---|
| `non_delegatable` | **Live.** If present anywhere in a certificate's capabilities, that whole certificate can never be a delegation chain's parent — not per-capability, the whole certificate. |
| `delegation` | **Reserved.** Marks a future delegation-format certificate. Deliberately not offered in any UI, so an admin cannot fabricate a certificate claiming delegation guarantees it does not have. |

## Custom capabilities

The built-in list above is closed. Everything a *deployment* needs beyond it is a
**custom capability**: an admin-defined, namespaced grant — `vendor:action`, e.g.
`acme:invoice.approve` — that travels through the exact same certificates, ledger,
`CertScope` scoping, expiry, revocation and `resolvePermission` as a built-in.

The division of labour is the whole idea:

> The control plane governs **who may hold it**. The application decides **what it
> does**.

An admin declares one in an org-global registry. Agents never self-declare — a
capability an agent could invent is not a permission.

### The colon is load-bearing

`vendor:action`, matched against a single grammar:

```
^[a-z0-9][a-z0-9-]{1,31}:[a-z0-9][a-z0-9._-]{1,63}$
```

Built-ins deliberately stay **unnamespaced**, and that is what makes collision
with a present or future built-in impossible: no built-in contains a colon, so no
custom name can shadow one. Naming a built-in `core:file_read` would make one name
both built-in and custom, and the registry filter would then read it as an
unregistered custom name and drop it — revoking it on every holder at once.

`core` and `vaultys` are **reserved vendors** for the same reason: both are legal
under the grammar, so without a fence a deployment could squat a namespace the
project may later speak for. A capability that appears to be issued by us must not
be authorable by a tenant.

:::warning Never hand-validate a capability name
`assertValidCapabilityName` / `isCustomCapability` in `@vaultysclaw/policy` are
the only grammar. They are mirrored in `sdk-go/capability` and pinned by
`conformance/capability-names.json`, which **both** suites run. Changing the
grammar means changing both sides and the table.
:::

### Deleting a registry entry is a mass revoke

This is the one operational consequence to understand before using the feature.

Before signing a `cert_status_response`, the control plane filters the
certificate's held custom capabilities **against the live registry**. A name
deleted from the registry therefore stops resolving on every holder's next
refresh — and that signed response, not the stored certificate row, is what a
client keeps and enforces against.

So deleting a registry entry is not an administrative tidy-up. It is a revocation
across every certificate that carries the name, applied as those clients refresh.
Fail-closed by design: an unrecognised name grants nothing.

### `AgentCapability` is no longer a closed union

A consequence worth knowing if you write code against it: exhaustiveness checking
does not apply. A `switch` or `Record<AgentCapability, …>` over it **silently
stops being checked** rather than failing to compile, so any such map needs an
explicit fallback.

## Per-kind allow-lists

Not every capability may be granted to every kind of Actor.

```ts
allowedCapabilitiesForKind(kind)
// "sensor"  → ["process_read"]
// "human"   → the interface capabilities, plus knowledge_search,
//             agent_communication and non_delegatable
// otherwise → the agent list above, plus non_delegatable
```

`human` is its own list, not the agent list plus extras: an agent has no business
being granted `admin_console_access`, and a human has no business being granted
`code_execution`.

This filter runs **server-side at approval time**, not in the UI. A capability
outside a kind's list is dropped even if it arrives by direct form post. Hiding a
checkbox is presentation; dropping the value is enforcement.

### Custom capabilities are not partitioned by kind

`grantableCapabilitiesForKind` is the complete set an admin may actually pick: a
kind's built-ins **plus every name currently in the custom registry**. Custom
names are deliberately not split per kind — a `vendor:action` is meaningful to
whichever application binds an operation to it, and the control plane has no way
to know which kinds those are. A per-kind allow-list for admin-defined names
would be a second registry to keep in sync for no security gain, since the grant
still has to be issued deliberately either way.

## CertScope

A capability alone is a blunt grant. `CertScope` narrows it:

```ts
interface CertScope {
  resource?: string;        // "file:///reports/q3.pdf", "domain:api.stripe.com"
  resourcePattern?: string; // glob or prefix — "file:///reports/*"
  maxUses?: number;         // 1 for a single-use grant
  purpose?: string;         // free-text audit tag — "quarterly-report-export"
}
```

A certificate with **no** scope behaves as a plain capability grant. A scoped
certificate authorises only actions whose target matches.

### This is the ABAC and JIT story

Both, from one primitive. "Grant `file_read` on exactly this path for the next
ten seconds" is an ordinary ledger row:

```
capabilities: ["file_read"]
scope:        { resource: "file:///reports/q3.pdf", purpose: "q3-export" }
expiresAt:    issuedAt + 10_000
```

Auditable, revocable, and citable like any other certificate — just very
short-lived. No second policy engine, no rule language, no parallel JIT system.

:::note What exists and what does not
The **primitive** is complete: the ledger stores scopes, the issuance form sets
them, and `resolvePermission` matches against them. What does not exist is an
automated requester — an agent asking for a ten-second grant mid-task and
receiving one without a human clicking approve. See the
[roadmap](/docs/zero-trust/roadmap).
:::

### Deliberately not an expression language

`CertScope` stays a small structured field. There is no boolean logic, no Rego,
no DSL. That is a design decision rather than an unfinished feature: a scope you
can read at a glance is a scope an auditor can check, and the moment scopes become
programs, reviewing them becomes reviewing code.

## Resource limits

Alongside capabilities, a certificate may carry `ResourceLimits`:

| Limit | Enforced today? |
|---|---|
| `allowedDomains` | By the interception point — its first real consumer |
| `maxRequestsPerHour` | By the agent runtime's policy enforcer |
| `maxTokensPerDay` | By the agent runtime's policy enforcer |

:::caution Enforcement location matters
Limits enforced by the agent runtime are enforced by code running on
infrastructure you may not control. They are real controls for a cooperating
agent and no control at all against a modified binary. The interception point
exists precisely because that distinction matters — it enforces from outside the
agent. See [Blast radius](/docs/concepts/blast-radius).
:::

## Host matching, precisely

Where a scope or limit names a host, matching is **exact, or a dot-prefixed
suffix. Never substring.**

```
rule:  api.openai.com
match: api.openai.com          ✅
match: eu.api.openai.com       ✅  (dot-prefixed suffix)
match: api.openai.com.evil.example   ❌  (would match under substring)
```

That third line is the reason for the rule. Substring matching on hostnames turns
an allow-list into a bypass.

Likewise, a wildcard in a path pattern does **not** cross path segments.

## Citing the granting certificate

An action that exercises a scoped grant should name the certificate it is
exercising. The resolution function returns `grantingCertId` for exactly this
reason, and the audit log records it.

Without that, an audit trail says "the Actor had some capability that permitted
this". With it, the trail says "this specific ten-second, single-file grant, issued
by this admin for this stated purpose, authorised this action" — which is the
difference between an ABAC claim an auditor accepts and one they do not.
